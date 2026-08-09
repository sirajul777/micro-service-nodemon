import {
  Body,
  Controller,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { VoucherBatchService, VoucherBatch } from '../voucher-batch/voucher-batch.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/permissions.decorator';

export interface GenerateRequest {
  session: string;
  profile: string;
  count?: number;
  prefix?: string;
  price?: number;
  validity?: string;
  caption?: string;
  color?: string;
  createdBy?: string;
}

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(len: number, format: 'upper+digit' | 'digit' | 'upper'): string {
  if (format === 'digit') {
    let s = '';
    for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 10);
    return s;
  }
  if (format === 'upper') {
    let s = '';
    for (let i = 0; i < len; i++) s += CHARS[Math.floor(Math.random() * 26)];
    return s;
  }
  let s = '';
  for (let i = 0; i < len; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
  return s;
}

/**
 * Voucher generation (single batch + CSV). The frontend's Voucher page calls
 * `POST /api/voucher/generate` and `POST /api/voucher/generate/csv` (app.js:
 * generateVoucher() → post('/voucher/generate')). The BFF `voucher` alias
 * routes these to erp `/voucher/generate*`.
 *
 * Generates a batch of hotspot voucher credentials, persists it as a voucher
 * batch (so the Go service can provision them via Redis), and returns the
 * generated list (or a CSV download).
 */
@Controller('voucher/generate')
@UseGuards(JwtAuthGuard)
@RequirePermission('manageVoucher')
export class VoucherGenerateController {
  constructor(private readonly batchService: VoucherBatchService) {}

  @Post()
  async generate(@Body() body: GenerateRequest) {
    const batch = await this.buildBatch(body);
    const saved = await this.batchService.saveBatch(batch);
    return {
      success: true,
      count: saved.vouchers.length,
      vouchers: saved.vouchers,
      batchId: saved.id,
    };
  }

  @Post('csv')
  async generateCsv(@Body() body: GenerateRequest, @Res() res: Response) {
    const batch = await this.buildBatch(body);
    const saved = await this.batchService.saveBatch(batch);
    const rows = [
      ['Username', 'Password', 'Profile', 'Comment', 'Limit Uptime'],
      ...saved.vouchers.map((v) => [
        v.username,
        v.password,
        v.profile,
        v.comment || '',
        v.limitUptime || '',
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="vouchers-${body.profile}-${Date.now()}.csv"`,
    );
    res.send(csv);
  }

  private async buildBatch(body: GenerateRequest): Promise<VoucherBatch> {
    const session = body.session;
    const count = Math.min(Math.max(Number(body.count) || 1, 1), 500);
    const prefix = body.prefix || '';
    const createdBy = body.createdBy || 'Admin';

    const existing = await this.batchService.loadAll(session);
    const usedNames = new Set<string>();
    for (const b of existing) {
      for (const v of b.vouchers) usedNames.add(v.username);
    }

    const vouchers: any[] = [];
    let attempts = 0;
    while (vouchers.length < count && attempts < count * 20) {
      attempts++;
      // 8-char upper+digit code (with prefix).
      const code = randomCode(8, 'upper+digit');
      const username = `${prefix}${code}`;
      if (usedNames.has(username)) continue;
      usedNames.add(username);
      vouchers.push({
        username,
        password: randomCode(6, 'digit'),
        profile: body.profile,
        comment: body.caption || '',
        limitUptime: body.validity || '',
        color: body.color || '#1f6feb',
        price: Number(body.price) || 0,
        caption: body.caption || '',
        status: 'available',
      });
    }

    const batchId = `GEN-${Date.now()}`;
    return {
      id: batchId,
      sessionId: session,
      profileName: body.profile,
      profileColor: body.color || '#1f6feb',
      price: Number(body.price) || 0,
      totalPrice: (Number(body.price) || 0) * vouchers.length,
      validity: body.validity || '',
      caption: body.caption || body.profile,
      nasName: session,
      createdBy,
      createdAt: new Date().toISOString(),
      vouchers,
    };
  }
}
