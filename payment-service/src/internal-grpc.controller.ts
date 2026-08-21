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
      id: String(order?.id || ''), orderId: String(order?.orderId || ''), gateway: 'payhook',
      purpose: 'voucher_purchase', referenceId: String(order?.id || ''), method: 'QRIS',
      voucherName: String(order?.voucherName || ''), profile: String(order?.profile || ''),
      amount: Number(order?.uniqueAmount || 0), price: Number(order?.price || 0),
      status: String(order?.status || ''), customerName: String(order?.customerName || ''),
      phone: String(order?.phone || ''), createdAt: order?.createdAt ? String(order.createdAt) : '',
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
    return { success: true, error: '', total: Number(stats?.totalOrders || 0), pending: Number(stats?.byStatus?.pending || 0), processing: Number(stats?.byStatus?.processing || 0), paid: Number(stats?.byStatus?.paid || 0), expired: Number(stats?.byStatus?.expired || 0), cancelled: Number(stats?.byStatus?.cancelled || 0), revenue: Number(stats?.paidAmount || 0) };
  }

  @GrpcMethod('PaymentInternalService', 'GetPaymentConfig')
  async getPaymentConfig() { const config: any = await this.configService.getConfigMasked(); return { success: true, error: '', config: this.mapConfig(config) }; }
  @GrpcMethod('PaymentInternalService', 'SavePaymentConfig')
  async savePaymentConfig(request: { values?: Record<string, string> }) { const config: any = await this.configService.saveConfig(request?.values || {}); return { success: true, error: '', config: this.mapConfig(config) }; }
  @GrpcMethod('PaymentInternalService', 'CreatePaymentTest')
  async createPaymentTest(request: { amount?: number; profile?: string }) { const amount = Number(request?.amount) || 1000; const order = await this.orderService.createOrder({ profile: request?.profile || 'test', price: amount, customerName: 'Test Customer', phone: '' }); return { success: true, error: '', orderId: String(order.orderId), amount: Number(order.uniqueAmount || 0), qrString: String(order.qrString || ''), qrImage: String(order.qrImage || ''), status: String(order.status || '') }; }
  @GrpcMethod('PaymentInternalService', 'GetPayment')
  async getPayment(request: { orderId: string }) { const order = await this.orderService.getOrder(request?.orderId || ''); if (!order) return { success: false, error: 'Transaction not found', transaction: null }; return { success: true, error: '', transaction: this.mapOrder(order) }; }
  @GrpcMethod('PaymentInternalService', 'CheckPayment')
  async checkPayment(request: { orderId: string }) { const order = await this.orderService.getOrder(request?.orderId || ''); if (!order) return { success: false, error: 'Transaction not found', orderId: request?.orderId || '', status: '' }; return { success: true, error: '', orderId: request.orderId, status: String(order.status || '') }; }
  @GrpcMethod('PaymentInternalService', 'ProcessPayhookWebhook')
  async processPayhookWebhook(request: { payloadJson?: string }) { try { const payload = JSON.parse(String(request?.payloadJson || '{}')); const result = await this.orderService.processAppWebhook(payload); return { success: true, matched: Boolean(result?.matched), orderId: String(result?.orderId || ''), status: String(result?.status || ''), note: String(result?.note || ''), error: '' }; } catch (error: any) { return { success: false, matched: false, orderId: '', status: '', note: '', error: String(error?.message || error) }; } }

  @GrpcMethod('PaymentInternalService', 'CreateQrisOrder')
  async createQrisOrder(request: { payloadJson?: string }) { try { const body = JSON.parse(String(request?.payloadJson || '{}')); const order = await this.orderService.createOrder(body); return { success: true, error: '', orderJson: JSON.stringify({ orderId: order.orderId, voucherName: order.voucherName, price: order.price, uniqueAmount: order.uniqueAmount, uniqueCode: order.uniqueCode, qrString: order.qrString, qrImage: order.qrImage, expiresAt: order.expiresAt, status: order.status }) }; } catch (error: any) { return { success: false, error: String(error?.message || error), orderJson: '' }; } }
  @GrpcMethod('PaymentInternalService', 'RegenerateQrisOrder')
  async regenerateQrisOrder(request: { orderId: string }) { try { const result = await this.orderService.regenerateQr(request?.orderId || ''); return { success: true, error: '', qrString: result.qrString, qrImage: result.qrImage || '' }; } catch (error: any) { return { success: false, error: String(error?.message || error), qrString: '', qrImage: '' }; } }
  @GrpcMethod('PaymentInternalService', 'GetQrisStatus')
  async getQrisStatus(request: { orderId: string }) { const order = await this.orderService.getOrder(request?.orderId || ''); if (!order) return { success: false, error: 'Order not found', status: 'unknown', voucherUsername: '', voucherPassword: '', voucherName: '', uniqueAmount: 0, paidAt: '' }; return { success: true, error: '', status: order.status, voucherUsername: order.voucherUsername || '', voucherPassword: order.voucherPassword || '', voucherName: order.voucherName || '', uniqueAmount: Number(order.uniqueAmount || 0), paidAt: order.paidAt || '' }; }
  @GrpcMethod('PaymentInternalService', 'ListQrisOrders')
  async listQrisOrders(request: { status?: string }) { const orders = await this.orderService.listOrders(request?.status || undefined); return { success: true, error: '', ordersJson: JSON.stringify(orders), total: orders.length }; }
  @GrpcMethod('PaymentInternalService', 'GetQrisOrder')
  async getQrisOrder(request: { id: string }) { const order = await this.orderService.getOrderById(request?.id || ''); if (!order) return { success: false, error: 'Order not found', orderJson: '' }; return { success: true, error: '', orderJson: JSON.stringify(order) }; }
  @GrpcMethod('PaymentInternalService', 'VerifyQrisOrder')
  async verifyQrisOrder(request: { id: string }) { try { const order = await this.orderService.markPaidManual(request?.id || ''); return { success: true, error: '', orderJson: JSON.stringify(order) }; } catch (error: any) { return { success: false, error: String(error?.message || error), orderJson: '' }; } }
  @GrpcMethod('PaymentInternalService', 'ListQrisCallbacks')
  async listQrisCallbacks(request: { limit?: number }) { const logs = await this.orderService.listCallbackLogs(Number(request?.limit) || 100); return { success: true, error: '', logsJson: JSON.stringify(logs), total: logs.length }; }
  @GrpcMethod('PaymentInternalService', 'GetQrisStats')
  async getQrisStats() { const stats = await this.orderService.getStats(); return { success: true, error: '', statsJson: JSON.stringify(stats) }; }

  private mapConfig(config: any) { return { payhookStaticQris: String(config?.payhookStaticQris || ''), payhookUniqueDigits: Number(config?.payhookUniqueDigits || 0), payhookQrisExpiryMinutes: Number(config?.payhookQrisExpiryMinutes || 0), payhookExpiredRetentionDays: Number(config?.payhookExpiredRetentionDays || 0) }; }
}
