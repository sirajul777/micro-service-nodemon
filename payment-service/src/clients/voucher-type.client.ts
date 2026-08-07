import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * Shape of a voucher type as owned by erp-node-service (`db_erp`).
 * Mirrors the monolith's VoucherTypeEntity.
 */
export interface VoucherTypeDto {
  id: string;
  name: string;
  price: number;
  profile: string;
  duration: string;
  codeLength: number;
  codeFormat: string;
  userType: string;
  active: boolean;
}

/**
 * HTTP client → erp-node-service (`GET /voucher/types/:id`).
 *
 * In the monolith `VoucherOrderService` called `voucherTypeService.getById()`
 * in-process. In microservices the voucher catalogue lives in `db_erp`, so we
 * fetch it over HTTP. If the ERP service is unreachable (Phase 4 not deployed
 * yet), we fail closed with a clear error — the caller can fall back to an
 * explicit profile/price supplied by the BFF.
 */
@Injectable()
export class VoucherTypeClient {
  private readonly logger = new Logger(VoucherTypeClient.name);

  constructor(private readonly http: HttpService) {}

  private get baseUrl(): string {
    return (
      process.env.ERP_SERVICE_URL ||
      'http://localhost:3004'
    );
  }

  async getById(id: string): Promise<VoucherTypeDto | null> {
    const url = `${this.baseUrl}/voucher/types/${encodeURIComponent(id)}`;
    try {
      const res = await firstValueFrom(
        this.http.get(url, { timeout: 5000, validateStatus: (s) => s < 500 }),
      );
      if (res.status === 404) return null;
      if (res.status >= 400) {
        this.logger.warn(`[erp] GET /voucher/types/:id status ${res.status}`);
        return null;
      }
      const body = res.data;
      // Accept both `{ success, data }` and the raw entity shape.
      const vt = body?.data ?? body?.voucherType ?? body;
      if (!vt || typeof vt !== 'object') return null;
      return {
        id: vt.id ?? id,
        name: vt.name ?? '',
        price: Math.round(Number(vt.price) || 0),
        profile: vt.profile ?? '',
        duration: vt.duration ?? '',
        codeLength: Number(vt.codeLength) || 6,
        codeFormat: vt.codeFormat ?? 'upper+digit',
        userType: vt.userType ?? 'up',
        active: vt.active ?? true,
      };
    } catch (e: any) {
      this.logger.warn(`[erp] fetch voucher type ${id} failed: ${e.message}`);
      return null;
    }
  }
}
