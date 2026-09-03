import {
  BadRequestException,
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

@Controller('voucher/generate')
@UseGuards(JwtAuthGuard)
@RequirePermission('manageVoucher')
export class VoucherGenerateController {
  constructor(private readonly batchService: VoucherBatchService) {}

  @Post()
  async generate(@Body() body: GenerateRequest) {
    const normalized = this.validateRequest(body);
    const batch = await this.buildBatch(normalized);
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
    const normalized = this.validateRequest(body);
    const batch = await this.buildBatch(normalized);
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
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="vouchers-${normalized.profile}-${Date.now()}.csv"`);
    res.send(csv);
  }

  private validateRequest(body: GenerateRequest): GenerateRequest {
    const session = String(body?.session || '').trim();
    const profile = String(body?.profile || '').trim();
    if (!session) throw new BadRequestException('session wajib diisi');
    if (!profile) throw new BadRequestException('profile wajib diisi');

    const count = Number(body?.count ?? 1);
    if (!Number.isInteger(count) || count < 1 || count > 500) {
      throw new BadRequestException('count harus berupa integer 1-500');
    }

    const prefix = String(body?.prefix || '').trim();
    if (prefix.length > 32) throw new BadRequestException('prefix maksimal 32 karakter');

    const price = body?.price === undefined || body?.price === null || body?.price === '' ? 0 : Number(body.price);
    if (!Number.isFinite(price) || price < 0) throw new BadRequestException('price harus berupa angka >= 0');

    const validity = String(body?.validity || '').trim();
    const caption = String(body?.caption || '').trim();
    const color = String(body?.color || '#1f6feb').trim();
    const createdBy = String(body?.createdBy || 'Admin').trim().slice(0, 100) || 'Admin';

    return { ...body, session, profile, count, prefix, price, validity, caption, color, createdBy };
  }

  private async buildBatch(body: GenerateRequest): Promise<VoucherBatch> {
    const session = body.session;
    const count = body.count as number;
    const prefix = body.prefix || '';
    const createdBy = body.createdBy || 'Admin';

    const existing = await this.batchService.loadAll(session);
    const usedNames = new Set<string>();
    for (const b of existing) {
      for (const v of b.vouchers || []) usedNames.add(v.username);
    }

    const vouchers: any[] = [];
    let attempts = 0;
    while (vouchers.length < count && attempts < count * 100) {
      attempts++;
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

    if (vouchers.length !== count) {
      throw new BadRequestException('Gagal menghasilkan jumlah voucher yang diminta');
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
