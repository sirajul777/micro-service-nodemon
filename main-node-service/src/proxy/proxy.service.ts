import {
  BadGatewayException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosRequestConfig, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import { ROUTER } from '../router.config';

/**
 * Generic proxy used by the BFF to forward authenticated requests to the
 * downstream domain services. The BFF injects the cached bearer token from
 * the session into the forwarded request, so the browser never sees it.
 */
@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  constructor(private readonly http: HttpService) {}

  /**
   * Forward a request to a downstream service.
   *
   * @param target  service key: 'auth' | 'erp' | 'payment' | 'bot'
   * @param path    full path (e.g. '/api/qris/orders')
   * @param method  HTTP method
   * @param token   cached JWT (forwarded as Bearer) or null
   * @param body    request body (JSON)
   * @param query   optional query params
   */
  async forward(
    target: 'auth' | 'erp' | 'payment' | 'bot',
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    token: string | null,
    body?: any,
    query?: any,
  ): Promise<AxiosResponse> {
    const base = ROUTER[target];
    const url = `${base.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;

    const config: AxiosRequestConfig = {
      method,
      url,
      timeout: 30000,
      params: query,
      validateStatus: () => true, // pass through downstream status codes
    };
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    config.headers = headers;
    if (body !== undefined && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      config.data = body;
    }

    try {
      const resp = await firstValueFrom(this.http.request(config));
      return resp;
    } catch (e: any) {
      this.logger.error(`proxy ${target} ${path} failed: ${e.message}`);
      throw new BadGatewayException(`Downstream ${target} tidak dapat dijangkau`);
    }
  }

  /** Helper to turn a downstream Axios response into a Nest response payload. */
  respond(resp: AxiosResponse): { status: number; body: any } {
    return { status: resp.status, body: resp.data };
  }
}
