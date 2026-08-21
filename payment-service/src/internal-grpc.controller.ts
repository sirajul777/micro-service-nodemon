import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PaymentConfigService } from './payment-config.service';
import { VoucherOrderService } from './voucher-order.service';

@Controller()
export class InternalGrpcController {
  constructor(
    private readonly orderService: VoucherOrderService,
    private readonly configService: PaymentConfigService,
  ) {}

  private mapOrder(order: any) {
    return {
      id: String(order?.id || ''),
      orderId: String(order?.orderId || ''),
      gateway: 'payhook',
      purpose: 'voucher_purchase',
      referenceId: String(order?.id || ''),
      method: 'QRIS',
      voucherName: String(order?.voucherName || ''),
      profile: String(order?.profile || ''),
      amount: Number(order?.uniqueAmount || 0),
      price: Number(order?.price || 0),
      status: String(order?.status || ''),
      customerName: String(order?.customerName || ''),
      phone: String(order?.phone || ''),
      createdAt: order?.createdAt ? String(order.createdAt) : '',
      paidAt: order?.paidAt ? String(order.paidAt) : '',
    };
  }

  @GrpcMethod('PaymentInternalService', 'ListPayments')
  async listPayments(request: { status?: string }) {
    const orders = await this.orderService.listOrders(request?.status || undefined);
    return { success: true, error: '', transactions: orders.map((order) => this.mapOrder(order)), total: orders.length };
  }

  @GrpcMethod('PaymentInternalService', 'GetPaymentStats')
  async getPaymentStats() {
    const stats: any = await this.orderService.getStats();
    return { success: true, error: '', total: Number(stats?.total || 0), pending: Number(stats?.pending || 0), processing: Number(stats?.processing || 0), paid: Number(stats?.paid || 0), expired: Number(stats?.expired || 0), cancelled: Number(stats?.cancelled || 0), revenue: Number(stats?.revenue || 0) };
  }

  @GrpcMethod('PaymentInternalService', 'GetPaymentConfig')
  async getPaymentConfig() {
    const config: any = await this.configService.getConfigMasked();
    return { success: true, error: '', config: this.mapConfig(config) };
  }

  @GrpcMethod('PaymentInternalService', 'SavePaymentConfig')
  async savePaymentConfig(request: { values?: Record<string, string> }) {
    const config: any = await this.configService.saveConfig(request?.values || {});
    return { success: true, error: '', config: this.mapConfig(config) };
  }

  @GrpcMethod('PaymentInternalService', 'CreatePaymentTest')
  async createPaymentTest(request: { amount?: number; profile?: string }) {
    const amount = Number(request?.amount) || 1000;
    const order = await this.orderService.createOrder({ profile: request?.profile || 'test', price: amount, customerName: 'Test Customer', phone: '' });
    return { success: true, error: '', orderId: String(order.orderId), amount: Number(order.uniqueAmount || 0), qrString: String(order.qrString || ''), qrImage: String(order.qrImage || ''), status: String(order.status || '') };
  }

  @GrpcMethod('PaymentInternalService', 'GetPayment')
  async getPayment(request: { orderId: string }) {
    const order = await this.orderService.getOrder(request?.orderId || '');
    if (!order) return { success: false, error: 'Transaction not found', transaction: null };
    return { success: true, error: '', transaction: this.mapOrder(order) };
  }

  @GrpcMethod('PaymentInternalService', 'CheckPayment')
  async checkPayment(request: { orderId: string }) {
    const order = await this.orderService.getOrder(request?.orderId || '');
    if (!order) return { success: false, error: 'Transaction not found', orderId: request?.orderId || '', status: '' };
    return { success: true, error: '', orderId: request.orderId, status: String(order.status || '') };
  }

  @GrpcMethod('PaymentInternalService', 'ProcessPayhookWebhook')
  async processPayhookWebhook(request: { payloadJson?: string }) {
    try {
      const payload = JSON.parse(String(request?.payloadJson || '{}'));
      const result = await this.orderService.processAppWebhook(payload);
      return { success: true, matched: Boolean(result?.matched), orderId: String(result?.orderId || ''), status: String(result?.status || ''), note: String(result?.note || ''), error: '' };
    } catch (error: any) {
      return { success: false, matched: false, orderId: '', status: '', note: '', error: String(error?.message || error) };
    }
  }

  private mapConfig(config: any) {
    return { payhookStaticQris: String(config?.payhookStaticQris || ''), payhookUniqueDigits: Number(config?.payhookUniqueDigits || 0), payhookQrisExpiryMinutes: Number(config?.payhookQrisExpiryMinutes || 0), payhookExpiredRetentionDays: Number(config?.payhookExpiredRetentionDays || 0) };
  }
}
