import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import { ROUTER } from '../router.config';

/**
 * Phase 8 — Generic proxy with resilience.
 *
 * The BFF forwards authenticated requests to downstream domain services with
 * the cached bearer token injected. This version adds:
 *   - a short-circuit "circuit breaker" per target (trip after N consecutive
 *     failures, half-open retry after a cool-down) so a dead downstream
 *     service fails fast instead of hanging every request on a 30s timeout;
 *   - a single retry for idempotent methods (GET/PUT/DELETE) on transient
 *     network errors.
 */
@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  // Per-target circuit breaker state.
  private readonly breaker: Record<
    string,
    { failures: number; openUntil: number }
  > = {};
  private static readonly THRESHOLD = 5;
  private static readonly COOLDOWN_MS = 15000;
  private static readonly MAX_RETRIES = 1;

  constructor(private readonly http: HttpService) {}

  private isOpen(target: string): boolean {
    const b = this.breaker[target];
    if (!b) return false;
    if (b.failures >= ProxyService.THRESHOLD) {
      if (Date.now() < b.openUntil) return true;
      b.failures = 0;
      return false;
    }
    return false;
  }

  private recordFailure(target: string): void {
    const b = (this.breaker[target] ||= { failures: 0, openUntil: 0 });
    b.failures += 1;
    if (b.failures >= ProxyService.THRESHOLD) {
      b.openUntil = Date.now() + ProxyService.COOLDOWN_MS;
      this.logger.warn(
        `[breaker] ${target} circuit OPEN for ${ProxyService.COOLDOWN_MS}ms (${b.failures} failures)`,
      );
    }
  }

  private recordSuccess(target: string): void {
    const b = this.breaker[target];
    if (b && b.failures > 0) {
      b.failures = 0;
      this.logger.log(`[breaker] ${target} circuit CLOSED`);
    }
  }

  async forward(
    target: 'auth' | 'erp' | 'payment' | 'bot',
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    token: string | null,
    body?: any,
    query?: any,
  ): Promise<AxiosResponse> {
    if (this.isOpen(target)) {
      throw new ServiceUnavailableException(
        `Layanan ${target} sedang dalam masa pemulihan, coba lagi beberapa saat lagi`,
      );
    }

    const base = ROUTER[target];
    const url = `${base.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;

    const isLiveReport = target === 'erp' && /^\/report\/[^/]+\/live$/.test(path);
    const configuredLiveTimeout = Number.parseInt(
      process.env.ERP_LIVE_REPORT_PROXY_TIMEOUT_MS || '120000',
      10,
    );
    const liveTimeout = Number.isFinite(configuredLiveTimeout) && configuredLiveTimeout > 0
      ? Math.min(configuredLiveTimeout, 180000)
      : 120000;

    const config: AxiosRequestConfig = {
      method,
      url,
      timeout: isLiveReport ? liveTimeout : 20000,
      params: query,
      validateStatus: () => true,
    };
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    config.headers = headers;
    if (body !== undefined && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      config.data = body;
    }

    const idempotent = method === 'GET' || method === 'PUT' || method === 'DELETE';
    const attempts = idempotent ? ProxyService.MAX_RETRIES + 1 : 1;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const resp = await firstValueFrom(this.http.request(config));
        if (resp.status >= 500) {
          this.recordFailure(target);
        } else {
          this.recordSuccess(target);
        }
        return resp;
      } catch (e: any) {
        const ax = e as AxiosError;
        if (attempt === attempts) {
          this.recordFailure(target);
          this.logger.error(
            `proxy ${target} ${path} failed: ${ax?.message}`,
            ax?.stack,
          );
          throw new BadGatewayException(
            `Downstream ${target} tidak dapat dijangkau`,
          );
        }
        this.logger.warn(
          `proxy ${target} ${path} attempt ${attempt} failed (${ax?.message}); retrying`,
        );
      }
    }
    throw new BadGatewayException(`Downstream ${target} tidak dapat dijangkau`);
  }

  respond(resp: AxiosResponse): { status: number; body: any } {
    return { status: resp.status, body: resp.data };
  }
}
