import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ReportGrpcClient } from '../erp/report-grpc.client';
import { ErpGrpcClient } from '../erp/erp-grpc.client';

type LegacyProxyResponse = {
  status: number;
  statusText: string;
  data: unknown;
  headers: Record<string, string>;
  config: Record<string, never>;
};

/**
 * Compatibility adapter for legacy routes. Internal service communication
 * remains gRPC-only; this class never performs internal HTTP requests.
 */
@Injectable()
export class HttpProxyFallbackService {
  private readonly logger = new Logger(HttpProxyFallbackService.name);

  constructor(
    private readonly reportGrpc: ReportGrpcClient,
    private readonly erpGrpc: ErpGrpcClient,
  ) {}

  async forward(
    target: 'auth' | 'erp' | 'payment' | 'bot',
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    _token: string | null,
    body?: unknown,
    _query?: unknown,
  ): Promise<LegacyProxyResponse> {
    const match = path.match(/^\/report\/([^/]+)\/live$/);
    if (target === 'erp' && method === 'GET' && match) {
      const session = decodeURIComponent(match[1]);
      try {
        const response = await this.reportGrpc.getLiveReport(session);
        if (!response?.success) {
          throw new BadGatewayException(
            response?.error || 'ERP report gRPC failed',
          );
        }

        this.logger.debug(
          `Translated legacy report/live route to ReportInternalService gRPC for session ${session}`,
        );
        return {
          status: 200,
          statusText: 'OK',
          data: {
            today: {
              vouchers: Number(response.todayVouchers || 0),
              income: Number(response.todayIncome || 0),
            },
            month: {
              vouchers: Number(response.monthVouchers || 0),
              income: Number(response.monthIncome || 0),
            },
            currency: String(response.currency || 'Rp'),
            isIndo: Boolean(response.isIndo),
          },
          headers: {},
          config: {},
        };
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger.error(
          `Report gRPC live report failed for ${session}: ${error.message}`,
          error.stack,
        );
        if (err instanceof BadGatewayException) throw err;
        throw new ServiceUnavailableException(
          `Report gRPC live report tidak tersedia: ${error.message}`,
        );
      }
    }

    const requestMethod = String(method).toUpperCase();
    const requestPath = String(path || '/').replace(/\/+$/, '') || '/';

    if (target === 'erp' && /^\/sessions(?:\/[^/]+)?$/.test(requestPath)) {
      try {
        if (requestMethod === 'POST' && requestPath === '/sessions') {
          const input = (body && typeof body === 'object') ? body as Record<string, any> : {};
          if (!input.id || !input.name || !input.ip) {
            throw new BadGatewayException('id, name, dan ip wajib diisi');
          }

          const existing = await this.erpGrpc.getSession(String(input.id));
          const session = {
            id: String(input.id),
            name: String(input.name),
            ip: String(input.ip),
            port: Number(input.port) || 8728,
            user: input.user ? String(input.user) : '',
            password: input.password ? String(input.password) : '',
            hotspotName: input.hotspotName ? String(input.hotspotName) : '',
            dnsName: input.dnsName ? String(input.dnsName) : '',
            currency: input.currency ? String(input.currency) : 'Rp',
            reloadInterval: Number(input.reloadInterval) || 10,
            iface: input.iface ? String(input.iface) : 'ether1',
            idleTo: Number(input.idleTo) || 0,
            livereport: input.livereport ? String(input.livereport) : 'enable',
          };
          const response = existing?.success
            ? await this.erpGrpc.updateSession(session)
            : await this.erpGrpc.createSession(session);
          if (!response?.success) {
            throw new BadGatewayException(
              response?.error || 'ERP gRPC router session mutation failed',
            );
          }
          return {
            status: 200,
            statusText: 'OK',
            data: { success: true, session: response.session || null },
            headers: {},
            config: {},
          };
        }

        const idMatch = requestPath.match(/^\/sessions\/([^/]+)$/);
        if (requestMethod === 'DELETE' && idMatch) {
          const response = await this.erpGrpc.deleteSession(
            decodeURIComponent(idMatch[1]),
          );
          if (!response?.success) {
            throw new BadGatewayException(
              response?.error || 'ERP gRPC router session delete failed',
            );
          }
          return {
            status: 200,
            statusText: 'OK',
            data: { success: true },
            headers: {},
            config: {},
          };
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger.error(
          `ERP gRPC router session mutation failed for ${requestMethod} ${requestPath}: ${error.message}`,
          error.stack,
        );
        if (err instanceof BadGatewayException) throw err;
        throw new ServiceUnavailableException(
          `ERP gRPC router session tidak tersedia: ${error.message}`,
        );
      }
    }

    throw new BadGatewayException(
      `Internal route ${requestMethod} ${target}${requestPath} wajib menggunakan gRPC`,
    );
  }

  respond(resp: LegacyProxyResponse): { status: number; body: unknown } {
    return { status: resp.status, body: resp.data };
  }
}
