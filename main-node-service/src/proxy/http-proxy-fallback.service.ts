import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AxiosResponse } from 'axios';
import { ReportGrpcClient } from '../erp/report-grpc.client';

/**
 * Compatibility adapter for legacy routes. Internal service communication
 * remains gRPC-only; this class never performs internal HTTP requests.
 */
@Injectable()
export class HttpProxyFallbackService {
  private readonly logger = new Logger(HttpProxyFallbackService.name);

  constructor(private readonly reportGrpc: ReportGrpcClient) {}

  async forward(
    target: 'auth' | 'erp' | 'payment' | 'bot',
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    _token: string | null,
    _body?: any,
    _query?: any,
  ): Promise<AxiosResponse> {
    const match = path.match(/^\/report\/([^/]+)\/live$/);
    if (target === 'erp' && method === 'GET' && match) {
      try {
        const response = await this.reportGrpc.getLiveReport(decodeURIComponent(match[1]));
        if (!response?.success) {
          throw new BadGatewayException(response?.error || 'ERP report gRPC failed');
        }
        this.logger.debug(`Translated legacy report/live route to ReportInternalService gRPC for session ${match[1]}`);
        return {
          status: 200,
          statusText: 'OK',
          data: {
            today: { vouchers: Number(response.todayVouchers || 0), income: Number(response.todayIncome || 0) },
            month: { vouchers: Number(response.monthVouchers || 0), income: Number(response.monthIncome || 0) },
            currency: String(response.currency || 'Rp'),
            isIndo: Boolean(response.isIndo),
          },
          headers: {},
          config: {} as any,
        } as AxiosResponse;
      } catch (err: any) {
        this.logger.error(`Report gRPC live report failed: ${err?.message || err}`, err?.stack);
        if (err instanceof BadGatewayException) throw err;
        throw new ServiceUnavailableException('Report gRPC live report tidak tersedia');
      }
    }

    throw new BadGatewayException(`Internal route ${method} ${target}${path} wajib menggunakan gRPC`);
  }

  respond(resp: AxiosResponse): { status: number; body: any } {
    return { status: resp.status, body: resp.data };
  }
}
