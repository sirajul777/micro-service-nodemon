import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { VoucherBatchService, VoucherBatch } from '../voucher-batch/voucher-batch.service';

interface GenerateVoucherRequest {
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

@Controller()
export class VoucherGenerateInternalController {
  constructor(private readonly batchService: VoucherBatchService) {}

  @GrpcMethod('ErpInternalService', 'GenerateVouchers')
  async generate(request: GenerateVoucherRequest) {
    const batch = await this.buildBatch(request);
    const saved = await this.batchService.saveBatch(batch);
    return { success: true, count: saved.vouchers.length, vouchers: saved.vouchers, batchId: saved.id };
  }

  @GrpcMethod('ErpInternalService', 'GenerateVouchersCsv')
  async generateCsv(request: GenerateVoucherRequest) {
    const batch = await this.buildBatch(request);
    const saved = await this.batchService.saveBatch(batch);
    const rows = [
      ['Username', 'Password', 'Profile', 'Comment', 'Limit Uptime'],
      ...saved.vouchers.map((v) => [v.username, v.password, v.profile, v.comment || '', v.limitUptime || '']),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    return {
      success: true,
      csv,
      filename: `vouchers-${request.profile}-${Date.now()}.csv`,
      count: saved.vouchers.length,
      batchId: saved.id,
    };
  }

  private async buildBatch(body: GenerateVoucherRequest): Promise<VoucherBatch> {
    const session = body.session;
    const count = Math.min(Math.max(Number(body.count) || 1, 1), 500);
    const prefix = body.prefix || '';
    const createdBy = body.createdBy || 'Admin';
    const existing = await this.batchService.loadAll(session);
    const usedNames = new Set<string>();
    for (const b of existing) for (const v of b.vouchers) usedNames.add(v.username);

    const vouchers: any[] = [];
    let attempts = 0;
    while (vouchers.length < count && attempts < count * 20) {
      attempts++;
      const username = `${prefix}${randomCode(8, 'upper+digit')}`;
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

    return {
      id: `GEN-${Date.now()}`,
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
