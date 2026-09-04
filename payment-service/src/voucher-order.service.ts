import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { VoucherOrderEntity } from './entities/voucher-order.entity';
import { PayhookCallbackLogEntity } from './entities/payhook-callback-log.entity';
import { PayhookAppWebhookDto } from './dto/payhook-app-webhook.dto';
import { PayhookNotifierService } from './notifier.service';
import { PaymentConfigService } from './payment-config.service';
import { QrisService } from './qris.service';
import { VoucherTypeClient } from './clients/voucher-type.client';
import { MikrotikGrpcClient } from './clients/mikrotik-grpc.client';
import { OutboxService } from './redis/outbox.service';
import { PAYMENT_TOPIC } from './constants';

@Injectable()
export class VoucherOrderService {
  private readonly logger = new Logger(VoucherOrderService.name);

  constructor(
    @InjectRepository(VoucherOrderEntity)
    private readonly orderRepo: Repository<VoucherOrderEntity>,
    @InjectRepository(PayhookCallbackLogEntity)
    private readonly logRepo: Repository<PayhookCallbackLogEntity>,
    private readonly notifier: PayhookNotifierService,
    private readonly paymentConfigService: PaymentConfigService,
    private readonly qrisService: QrisService,
    private readonly voucherTypeClient: VoucherTypeClient,
    private readonly mikrotikGrpc: MikrotikGrpcClient,
    private readonly outbox: OutboxService,
    private readonly dataSource: DataSource,
  ) {}

  private async getConfig() {
    try {
      return await this.paymentConfigService.getConfig();
    } catch {
      return null;
    }
  }

  async getUniqueDigits(): Promise<number> {
    const cfg = await this.getConfig();
    const v = cfg?.payhookUniqueDigits;
    const n = Number(v);
    return isNaN(n) ? 3 : Math.min(5, Math.max(2, n));
  }

  private async getExpiryMinutes(): Promise<number> {
    const cfg = await this.getConfig();
    const v = cfg?.payhookQrisExpiryMinutes;
    const n = Number(v);
    return isNaN(n) ? 15 : Math.min(60, Math.max(5, n));
  }

  private async getStaticQrString(): Promise<string> {
    const cfg = await this.getConfig();
    return cfg?.payhookStaticQris || '';
  }

  private async getRetentionDays(): Promise<number> {
    const cfg = await this.getConfig();
    if (cfg?.payhookExpiredRetentionDays !== undefined && cfg?.payhookExpiredRetentionDays !== null) {
      return Number(cfg.payhookExpiredRetentionDays);
    }
    return 3;
  }

  private async buildDynamicQr(
    order: Pick<VoucherOrderEntity, 'uniqueAmount'>,
    qrString?: string,
  ): Promise<{ qrString: string; qrImage: string | null }> {
    let payload = qrString;
    if (!payload) {
      const staticQr = await this.getStaticQrString();
      if (staticQr) {
        try {
          payload = this.qrisService.buildDynamicQris(staticQr, order.uniqueAmount);
        } catch (e: any) {
          this.logger.warn(`[QRIS] dynamic QR generation failed: ${e.message}`);
          payload = staticQr;
        }
      } else {
        payload = '';
      }
    }

    let qrImage: string | null = null;
    if (payload) {
      try {
        qrImage = await this.qrisService.toDataUrl(payload);
      } catch (e: any) {
        this.logger.warn(`[QRIS] render QR image failed: ${e.message}`);
      }
    }
    return { qrString: payload || '', qrImage };
  }

  async createOrder(params: {
    voucherTypeId?: string;
    profile?: string;
    sessionId?: string;
    customerName?: string;
    phone?: string;
    qrString?: string;
    price?: number;
    uniqueCodeDigits?: number;
  }): Promise<VoucherOrderEntity> {
    const {
      voucherTypeId,
      profile: profileParam,
      sessionId,
      customerName,
      phone,
      qrString,
      price: explicitPrice,
      uniqueCodeDigits,
    } = params;

    let voucherName = '';
    let price = 0;
    let profile = profileParam || '';
    let validity = '';

    if (voucherTypeId) {
      const vt = await this.voucherTypeClient.getById(voucherTypeId);
      if (vt) {
        voucherName = vt.name;
        price = Math.round(Number(vt.price) || 0);
        profile = vt.profile || profile;
        validity = vt.duration || '';
      } else {
        this.logger.warn(`[QRIS] voucher type ${voucherTypeId} not resolvable from erp`);
      }
    }

    if (!price && explicitPrice) price = Math.round(Number(explicitPrice) || 0);
    if (!profile) throw new BadRequestException('Voucher profile is required');
    if (price <= 0) throw new BadRequestException('Voucher price must be > 0');

    const digits = uniqueCodeDigits || (await this.getUniqueDigits());
    const orderId = `QR${Date.now()}${Math.floor(Math.random() * 90 + 10)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (await this.getExpiryMinutes()) * 60000);

    let min = 0;
    let max = 0;
    if (price < 5000) {
      min = 10;
      max = 99;
    } else if (price < 10000) {
      min = 100;
      max = 499;
    } else {
      min = Math.pow(10, digits - 1);
      max = Math.pow(10, digits) - 1;
    }

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(VoucherOrderEntity);
      let uniqueCode = 0;
      let uniqueAmount = 0;
      let collisionFree = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        const candidateCode = Math.floor(min + Math.random() * (max - min + 1));
        const candidateAmount = price + candidateCode;
        const clash = await repo
          .createQueryBuilder('o')
          .where('o.status = :status', { status: 'pending' })
          .andWhere('o.uniqueAmount = :amount', { amount: candidateAmount })
          .andWhere('o.expiresAt > :now', { now: new Date().toISOString() })
          .getOne();
        if (!clash) {
          uniqueCode = candidateCode;
          uniqueAmount = candidateAmount;
          collisionFree = true;
          break;
        }
      }
      if (!collisionFree) throw new BadRequestException('Gagal menemukan nominal unik yang tersedia saat ini, coba lagi sesaat lagi.');

      const { qrString: builtQrString, qrImage } = await this.buildDynamicQr({ uniqueAmount }, qrString);
      return repo.save(repo.create({
        orderId,
        voucherTypeId: voucherTypeId || null,
        voucherName: voucherName || profile,
        profile,
        sessionId: sessionId || null,
        price,
        uniqueCode,
        uniqueAmount,
        qrString: builtQrString,
        qrImage,
        customerName: customerName || '',
        phone: phone || '',
        status: 'pending',
        expiresAt: expiresAt.toISOString(),
        note: validity ? `Validity: ${validity}` : '',
      }));
    });
  }

  async processAppWebhook(payload: PayhookAppWebhookDto): Promise<{
    matched: boolean;
    orderId?: string;
    status?: string;
    note: string;
  }> {
    const rawPayload = JSON.stringify(payload || {});
    const amount = this.normalizeAmount(payload);
    const eventId = payload.event_id || null;

    this.logger.log(`[PayHook-App] callback received event_id=${eventId} amount=${amount} raw=${rawPayload}`);

    if (eventId) {
      const already = await this.logRepo.findOne({ where: { eventId } });
      if (already?.matchedOrderId) {
        const relatedOrder = await this.orderRepo.findOne({ where: { orderId: already.matchedOrderId } });
        if (relatedOrder?.status === 'paid') {
          return { matched: true, orderId: already.matchedOrderId, status: 'ALREADY_PROCESSED', note: `Duplicate delivery of event_id ${eventId}, already settled as ${already.matchedOrderId}` };
        }
      }
    }

    const logEntry = this.logRepo.create({
      source: 'payhook-app',
      eventId,
      amount: amount || 0,
      status: payload.status || (amount ? 'COMPLETED' : 'UNKNOWN'),
      matched: false,
      matchedOrderId: null,
      reconciliationStatus: 'none',
      rawPayload,
      note: 'Received from PayHook Android app',
    });

    if (!amount) {
      logEntry.note = 'No amount found in payload — could not match';
      await this.logRepo.save(logEntry);
      return { matched: false, status: 'UNKNOWN', note: logEntry.note };
    }

    const order = await this.orderRepo
      .createQueryBuilder('o')
      .where('o.status = :status', { status: 'pending' })
      .andWhere('o.uniqueAmount = :amount', { amount })
      .andWhere('o.expiresAt > :now', { now: new Date().toISOString() })
      .orderBy('o.createdAt', 'ASC')
      .getOne();

    if (!order) {
      const expiredMatches = await this.orderRepo
        .createQueryBuilder('o')
        .where('o.status = :status', { status: 'expired' })
        .andWhere('o.uniqueAmount = :amount', { amount })
        .orderBy('o.createdAt', 'DESC')
        .getMany();
      logEntry.reconciliationStatus = expiredMatches.length === 1 ? 'candidate' : 'none';
      logEntry.note = expiredMatches.length === 1
        ? `No active order with amount ${amount}; one expired order is an eligible reconciliation candidate.`
        : `No active order with amount ${amount}; expired matches=${expiredMatches.length}. Reconciliation requires an unambiguous operator match.`;
      await this.logRepo.save(logEntry);
      return { matched: false, status: 'UNMATCHED', note: logEntry.note };
    }

    logEntry.matched = true;
    logEntry.matchedOrderId = order.orderId;
    try {
      const result = await this.settleOrder(order, 'payhook-app');
      logEntry.note = result.note || 'Paid & voucher generated';
      await this.logRepo.save(logEntry);
      return { matched: true, orderId: order.orderId, status: 'PAID', note: logEntry.note };
    } catch (e: any) {
      logEntry.note = `Matched but settlement failed: ${e.message}`;
      await this.logRepo.save(logEntry);
      this.logger.error(`[QRIS] settle order ${order.orderId} failed: ${e.message}`, e.stack);
      throw e;
    }
  }

  async reconcileExpiredPayment(params: {
    callbackLogId: string;
    orderId: string;
    reconciledBy: string;
  }): Promise<VoucherOrderEntity> {
    const actor = String(params.reconciledBy || '').trim();
    if (!actor) throw new BadRequestException('reconciledBy wajib diisi');

    const log = await this.logRepo.findOne({ where: { id: params.callbackLogId } });
    if (!log) throw new NotFoundException('Callback log not found');
    if (log.reconciliationStatus !== 'candidate') throw new BadRequestException('Callback bukan kandidat rekonsiliasi');
    if (log.matchedOrderId) throw new BadRequestException('Callback sudah memiliki order');

    const order = await this.orderRepo.findOne({ where: { orderId: params.orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'expired') throw new BadRequestException('Order harus berstatus expired');
    if (Number(order.uniqueAmount) !== Number(log.amount)) throw new BadRequestException('Nominal order dan callback tidak sama');

    const siblingMatches = await this.orderRepo
      .createQueryBuilder('o')
      .where('o.status = :status', { status: 'expired' })
      .andWhere('o.uniqueAmount = :amount', { amount: log.amount })
      .getCount();
    if (siblingMatches !== 1) throw new BadRequestException('Nominal expired tidak unik; rekonsiliasi ditolak');

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(PayhookCallbackLogEntity);
      const current = await repo.findOne({ where: { id: log.id }, lock: { mode: 'pessimistic_write' } });
      if (!current || current.reconciliationStatus !== 'candidate' || current.matchedOrderId) {
        throw new BadRequestException('Callback sudah direkonsiliasi oleh operator lain');
      }
      current.matchedOrderId = order.orderId;
      current.reconciliationStatus = 'reconciled';
      current.reconciledBy = actor;
      current.reconciledAt = new Date().toISOString();
      current.matched = true;
      current.note = `Reconciled to expired order ${order.orderId} by ${actor}`;
      await repo.save(current);
    });

    await this.orderRepo.update({ id: order.id }, { status: 'pending' });
    const refreshed = await this.getOrder(order.orderId);
    if (!refreshed) throw new NotFoundException('Order disappeared during reconciliation');
    try {
      await this.settleOrder(refreshed, `reconciliation:${actor}`);
    } catch (error) {
      await this.logRepo.update({ id: log.id }, {
        reconciliationStatus: 'candidate',
        matchedOrderId: null,
        reconciledBy: null,
        reconciledAt: null,
        matched: false,
        note: `Reconciliation settlement failed; candidate released: ${(error as any)?.message || error}`,
      });
      await this.orderRepo.update({ id: order.id }, { status: 'expired' });
      throw error;
    }
    return this.getOrder(order.orderId) as Promise<VoucherOrderEntity>;
  }

  async settleOrder(order: VoucherOrderEntity, source: string): Promise<{ note: string }> {
    if (order.status === 'paid' && order.voucherUsername) return { note: `Already paid (${order.orderId})` };

    const claim = await this.orderRepo
      .createQueryBuilder()
      .update(VoucherOrderEntity)
      .set({ status: 'processing' })
      .where('id = :id', { id: order.id })
      .andWhere('status = :status', { status: 'pending' })
      .execute();

    if (!claim.affected) {
      const fresh = await this.getOrder(order.orderId);
      if (fresh?.status === 'paid' && fresh.voucherUsername) return { note: `Already paid (${fresh.orderId})` };
      throw new BadRequestException(`Order ${order.orderId} sedang diproses oleh permintaan lain, coba lagi sesaat lagi.`);
    }

    const { username, password, limitUptime } = await this.generateVoucherCredentials(order);
    let createdOnRouter = false;
    let routerError = '';

    if (!order.sessionId) {
      routerError = 'Order tidak punya sessionId (router tujuan tidak diketahui)';
    } else {
      try {
        await this.mikrotikGrpc.addHotspotUser({ sessionId: order.sessionId, name: username, password, profile: order.profile, limitUptime });
        createdOnRouter = true;
      } catch (e: any) {
        routerError = e.message;
      }
    }

    if (!createdOnRouter) {
      await this.orderRepo.update({ id: order.id }, { status: 'pending' });
      await this.notifier.notifyAdmin({
        title: `⚠️ Pembayaran QRIS Diterima TAPI Voucher GAGAL Dibuat`,
        message: `Order ${order.orderId} — ${order.voucherName} (Rp ${order.uniqueAmount.toLocaleString('id-ID')})\nSumber: ${source}\nError: ${routerError}\n\nSegera cek dan gunakan verifikasi manual setelah masalah router diperbaiki.`,
      });
      throw new ServiceUnavailableException(`Gagal membuat voucher di router: ${routerError}`);
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(VoucherOrderEntity).update({ id: order.id }, {
        status: 'paid',
        paidAt: new Date().toISOString(),
        voucherUsername: username,
        voucherPassword: password,
      });
      await this.outbox.enqueue(manager, PAYMENT_TOPIC.ORDER_SETTLED, {
        orderId: order.orderId,
        voucherName: order.voucherName,
        profile: order.profile,
        username,
        password,
        phone: order.phone || null,
        uniqueAmount: order.uniqueAmount,
        validity: order.note || '',
      }, order.orderId);
      await this.outbox.enqueue(manager, PAYMENT_TOPIC.ORDER_PAID, {
        orderId: order.orderId,
        uniqueAmount: order.uniqueAmount,
        voucherName: order.voucherName,
        profile: order.profile,
        sessionId: order.sessionId,
      }, order.orderId);
    });

    await this.notifier.sendVoucherToCustomer({ phone: order.phone, voucherName: order.voucherName, username, password, profile: order.profile, validity: order.note || '' });
    await this.notifier.notifyAdmin({
      title: `💰 Pembayaran QRIS Diterima`,
      message: `Order ${order.orderId} — ${order.voucherName} (Rp ${order.uniqueAmount.toLocaleString('id-ID')})\nVoucher: ${username}/${password}\nRouter: ${order.sessionId || '—'}\nSumber: ${source}`,
    });
    return { note: `Order ${order.orderId} marked paid; voucher created on ${order.sessionId || '—'}` };
  }

  private async generateVoucherCredentials(order: VoucherOrderEntity): Promise<{ username: string; password: string; limitUptime?: string }> {
    let length = 6;
    let format = 'upper+digit';
    let userType = 'up';
    let limitUptime = '';
    if (order.voucherTypeId) {
      const vt = await this.voucherTypeClient.getById(order.voucherTypeId);
      if (vt) {
        length = vt.codeLength || 6;
        format = vt.codeFormat || 'upper+digit';
        userType = vt.userType || 'up';
        limitUptime = this.parseValidity(vt.duration || '');
      }
    }
    const username = this.randomStr(length, format);
    const password = userType === 'vc' ? username : this.randomStr(length, format);
    return { username, password, limitUptime };
  }

  private parseValidity(val: string): string {
    if (!val) return '';
    val = val.trim().toLowerCase();
    const d = val.match(/^(\d+)d$/); if (d) return `${d[1]}d`;
    const h = val.match(/^(\d+)h$/); if (h) return `${parseInt(h[1]) * 3600}s`;
    const m = val.match(/^(\d+)m$/); if (m) return `${parseInt(m[1]) * 60}s`;
    if (val.includes(':')) return val;
    return '';
  }

  private randomStr(len: number, format: string): string {
    const map: Record<string, string> = {
      'upper+digit': 'ABCDEFGHJKMNPRSTUVWXYZ23456789',
      'lower+digit': 'abcdefghjkmnprstuvwxyz23456789',
      'mixed+digit': 'abcdefghjkmnprstuvwxyzABCDEFGHJKMNPRSTUVWXYZ23456789',
      digit: '23456789',
      alphabet: 'abcdefghjkmnprstuvwxyzABCDEFGHJKMNPRSTUVWXYZ',
      lower: 'abcdefghjkmnprstuvwxyz',
      upper: 'ABCDEFGHJKMNPRSTUVWXYZ',
    };
    const chars = map[format] || map['upper+digit'];
    return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  async markPaidManual(orderId: string): Promise<VoucherOrderEntity> {
    const order = await this.getOrder(orderId);
    if (!order) throw new NotFoundException('Order not found');
    await this.settleOrder(order, 'manual');
    await this.logRepo.save(this.logRepo.create({
      source: 'manual', amount: order.uniqueAmount, status: 'MANUAL', matched: true,
      matchedOrderId: order.orderId, reconciliationStatus: 'none', rawPayload: JSON.stringify({ action: 'manual-verify', by: 'admin' }), note: 'Manually verified by admin',
    }));
    return this.getOrder(orderId) as Promise<VoucherOrderEntity>;
  }

  async regenerateQr(orderId: string): Promise<{ qrString: string; qrImage: string | null }> {
    const order = await this.getOrder(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'pending') return { qrString: order.qrString, qrImage: order.qrImage };
    const { qrString, qrImage } = await this.buildDynamicQr(order, order.qrString || undefined);
    order.qrString = qrString;
    order.qrImage = qrImage;
    await this.orderRepo.save(order);
    return { qrString, qrImage };
  }

  async expireStaleOrders(): Promise<number> {
    const result = await this.orderRepo.createQueryBuilder().update(VoucherOrderEntity).set({ status: 'expired' }).where('status IN (:...statuses)', { statuses: ['pending', 'processing'] }).andWhere('expiresAt <= :now', { now: new Date().toISOString() }).execute();
    const affected = result.affected || 0;
    if (affected > 0) this.logger.log(`[QRIS] ${affected} order pending/processing ditandai expired`);
    return affected;
  }

  async pruneOldUnpaidOrders(): Promise<number> {
    const retentionDays = await this.getRetentionDays();
    if (!retentionDays || retentionDays <= 0) return 0;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const result = await this.orderRepo.createQueryBuilder().delete().from(VoucherOrderEntity).where('status IN (:...statuses)', { statuses: ['expired', 'failed'] }).andWhere('createdAt <= :cutoff', { cutoff }).execute();
    const affected = result.affected || 0;
    if (affected > 0) this.logger.log(`[QRIS] ${affected} order expired/failed (lebih dari ${retentionDays} hari) dihapus permanen`);
    return affected;
  }

  async listOrders(status?: string): Promise<VoucherOrderEntity[]> {
    const where = status ? { status } : {};
    return this.orderRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async getOrder(orderId: string): Promise<VoucherOrderEntity | null> {
    return this.orderRepo.findOne({ where: { orderId } });
  }

  async getOrderById(id: string): Promise<VoucherOrderEntity | null> {
    return this.orderRepo.findOne({ where: { id } });
  }

  async listCallbackLogs(limit = 100): Promise<PayhookCallbackLogEntity[]> {
    return this.logRepo.find({ order: { processedAt: 'DESC' }, take: Math.min(Number(limit) || 100, 500) });
  }

  async getStats(): Promise<Record<string, any>> {
    const [orders, logs] = await Promise.all([this.orderRepo.find(), this.logRepo.find()]);
    const byStatus: Record<string, number> = {};
    let totalAmount = 0;
    let paidAmount = 0;
    for (const o of orders) {
      byStatus[o.status] = (byStatus[o.status] || 0) + 1;
      totalAmount += o.uniqueAmount;
      if (o.status === 'paid') paidAmount += o.uniqueAmount;
    }
    const today = new Date().toDateString();
    const todayPaid = orders.filter((o) => o.status === 'paid' && new Date(o.paidAt || '').toDateString() === today);
    return { totalOrders: orders.length, byStatus, totalAmount, paidAmount, todayOrders: todayPaid.length, todayIncome: todayPaid.reduce((s, o) => s + o.uniqueAmount, 0), totalCallbacks: logs.length, matchedCallbacks: logs.filter((l) => l.matched).length };
  }

  private normalizeAmount(payload: PayhookAppWebhookDto): number | null {
    for (const key of ['amount', 'nominal', 'total', 'price', 'value']) {
      const v = (payload as any)[key];
      if (v === undefined || v === null || v === '') continue;
      const n = Number(String(v).replace(/[^0-9.-]/g, ''));
      if (Number.isFinite(n) && n > 0) return Math.round(n);
    }
    return null;
  }
}
