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
import { MikrotikGrpcClient } from '../clients/mikrotik-grpc.client';

const INDO_CURRENCIES = ['RP', 'Rp', 'rp', 'IDR', 'idr', 'RP.', 'Rp.', 'rp.', 'IDR.', 'idr.'];

/** Parses the "D/M/YYYY, HH.MM.SS" format written by
 * `new Date().toLocaleString('id-ID')` (see voucher-batch.service.ts /
 * voucher-batch.controller.ts, where `usedAt` is set) -- `new Date(str)`
 * can't parse this locale format at all (always Invalid Date), which
 * silently made month-based filtering here return zero every time. */
function parseIdDate(s: string): { month: number; year: number } | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || '');
  if (!m) return null;
  return { month: parseInt(m[2], 10) - 1, year: parseInt(m[3], 10) };
}

/**
 * Selling / live / resume reports, aggregated from the voucher_batches rows
 * in db_erp (the only transactional data this service owns).
 *
 * The BFF routes `/api/report/:session/*` ? erp `/report/:session/*`
 * (see `report` target alias in main-node-service proxy.controller.ts).
 */
@Controller('report')
@UseGuards(JwtAuthGuard)
@RequirePermission('viewReport')
export class ReportController {
  constructor(
    @InjectRepository(VoucherBatchEntity)
    private readonly batchRepo: Repository<VoucherBatchEntity>,
    private readonly mikrotik: MikrotikGrpcClient,
  ) {}

  /** GET /report/:session/selling -- selling records (voucher usage). */
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

  /**
   * GET /report/:session/live -- live report (today + this month's income).
   * Response shape matches the reference monolith's `getLiveReport()`
   * exactly (compared directly against sirajul777/nodemon's
   * report.service.ts) -- main-node-service's app.js loadDashboard() reads
   * `live.today.income`, `live.month.income`, `live.currency`,
   * `live.isIndo` directly off this. The previous
   * `{success, income, vouchersSold, records}` shape had none of those
   * keys, so the dashboard's income/voucher stat cards always rendered
   * blank/"undefined" even though the request itself succeeded.
   */
  @Get(':session/live')
  async live(@Param('session') session: string) {
    const rows = await this.batchRepo.find({ where: { sessionId: session } });
    const now = new Date();
    const todayStr = now.toLocaleDateString('id-ID');
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();

    let todayIncome = 0;
    let todayVouchers = 0;
    let monthIncome = 0;
    let monthVouchers = 0;
    for (const b of rows) {
      for (const v of b.vouchers || []) {
        if (v.status !== 'used') continue;
        const usedAt = v.usedAt || b.createdAt;
        const price = v.price ?? b.price ?? 0;
        const usedDate = parseIdDate(usedAt);
        if (usedDate && usedDate.month === curMonth && usedDate.year === curYear) {
          monthIncome += price;
          monthVouchers++;
        }
        if (usedAt.includes(todayStr)) {
          todayIncome += price;
          todayVouchers++;
        }
      }
    }

    const session_ = await this.mikrotik.getSession(session).catch(() => null);
    const currency = session_?.session?.currency || 'Rp';

    return {
      today: { vouchers: todayVouchers, income: todayIncome },
      month: { vouchers: monthVouchers, income: monthIncome },
      currency,
      isIndo: INDO_CURRENCIES.includes(currency),
    };
  }

  /** GET /report/:session/resume -- daily income summary. */
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

  /** DELETE /report/:session/selling -- clear report data. */
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