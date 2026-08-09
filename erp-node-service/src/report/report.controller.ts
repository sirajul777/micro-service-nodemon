import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VoucherBatchEntity } from '../entities/voucher-batch.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/permissions.decorator';

/**
 * Selling / live / resume reports, aggregated from the voucher_batches rows
 * in db_erp (the only transactional data this service owns).
 *
 * The BFF routes `/api/report/:session/*` → erp `/report/:session/*`
 * (see `report` target alias in main-node-service proxy.controller.ts).
 */
@Controller('report')
@UseGuards(JwtAuthGuard)
@RequirePermission('viewReport')
export class ReportController {
  constructor(
    @InjectRepository(VoucherBatchEntity)
    private readonly batchRepo: Repository<VoucherBatchEntity>,
  ) {}

  /** GET /report/:session/selling — selling records (voucher usage). */
  @Get(':session/selling')
  async selling(
    @Param('session') session: string,
    @Query('reseller') reseller?: string,
  ) {
    const rows = await this.batchRepo.find({ where: { sessionId: session } });
    const records: any[] = [];
    for (const b of rows) {
      for (const v of b.vouchers || []) {
        if (v.status !== 'used') continue;
        if (reseller && b.resellerName !== reseller) continue;
        records.push({
          id: `${b.id}-${v.username}`,
          username: v.username,
          profile: v.profile || b.profileName,
          price: v.price ?? b.price,
          comment: v.comment || '',
          usedBy: v.usedBy || '',
          usedAt: v.usedAt || b.createdAt,
          reseller: b.resellerName || '',
          batchId: b.id,
        });
      }
    }
    return { success: true, records };
  }

  /** GET /report/:session/live — live report (recent usage today). */
  @Get(':session/live')
  async live(@Param('session') session: string) {
    const rows = await this.batchRepo.find({ where: { sessionId: session } });
    const today = new Date().toLocaleDateString('id-ID');
    let income = 0;
    let vouchersSold = 0;
    const records: any[] = [];
    for (const b of rows) {
      for (const v of b.vouchers || []) {
        if (v.status !== 'used') continue;
        const usedAt = v.usedAt || b.createdAt;
        if (!usedAt.includes(today)) continue;
        const price = v.price ?? b.price;
        income += price;
        vouchersSold++;
        records.push({
          username: v.username,
          profile: v.profile || b.profileName,
          price,
          usedAt,
          reseller: b.resellerName || '',
        });
      }
    }
    return { success: true, income, vouchersSold, records };
  }

  /** GET /report/:session/resume — daily income summary. */
  @Get(':session/resume')
  async resume(@Param('session') session: string, @Query('idbl') idbl?: string) {
    const rows = await this.batchRepo.find({ where: { sessionId: session } });
    const byDate: Record<string, { income: number; vouchers: number }> = {};
    for (const b of rows) {
      for (const v of b.vouchers || []) {
        if (v.status !== 'used') continue;
        const usedAt = v.usedAt || b.createdAt;
        const dateKey = usedAt.split(',')[0] || usedAt.slice(0, 10);
        const price = v.price ?? b.price;
        byDate[dateKey] = byDate[dateKey] || { income: 0, vouchers: 0 };
        byDate[dateKey].income += price;
        byDate[dateKey].vouchers++;
      }
    }
    const days = Object.entries(byDate)
      .map(([date, d]) => ({ date, ...d }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    return { success: true, days };
  }

  /** DELETE /report/:session/selling — clear report data. */
  @Delete(':session/selling')
  async clear(@Param('session') session: string) {
    // Mark all used vouchers as available again (best-effort "clear report").
    const rows = await this.batchRepo.find({ where: { sessionId: session } });
    for (const b of rows) {
      let changed = false;
      for (const v of b.vouchers || []) {
        if (v.status === 'used') {
          v.status = 'available';
          v.usedBy = '';
          v.usedAt = '';
          changed = true;
        }
      }
      if (changed) await this.batchRepo.save(b);
    }
    return { success: true };
  }
}
