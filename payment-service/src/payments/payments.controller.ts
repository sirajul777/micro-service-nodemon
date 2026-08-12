import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { VoucherOrderService } from '../voucher-order.service';
import { PaymentConfigService } from '../payment-config.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/permissions.decorator';

/**
 * Payments admin endpoints (list / stats / config / test / detail / check).
 *
 * The frontend's Payment Gateway page calls `/api/payments*` (app.js:
 * loadPayments() → req('/payments'), paymentStats() → req('/payments/stats'),
 * savePaymentGateway() → post('/payments/config'), testPayment() →
 * post('/payments/test')). The BFF `payments` alias routes these to
 * payment-service `/payments*`.
 *
 * Backed by the existing VoucherOrderService (QRIS orders) + PaymentConfigService.
 */
@Controller('payments')
@UseGuards(JwtAuthGuard)
@RequirePermission('manageBilling')
export class PaymentsController {
  constructor(
    private readonly orderService: VoucherOrderService,
    private readonly configService: PaymentConfigService,
  ) {}

  /** GET /payments — unified transaction list (QRIS orders). */
  @Get()
  async list(@Query('status') status?: string) {
    const orders = await this.orderService.listOrders(status || undefined);
    return {
      success: true,
      transactions: orders.map((o) => ({
        id: o.id,
        orderId: o.orderId,
        gateway: 'payhook',
        purpose: 'voucher_purchase',
        referenceId: o.id,
        method: 'QRIS',
        voucherName: o.voucherName,
        profile: o.profile,
        amount: o.uniqueAmount,
        price: o.price,
        status: o.status,
        customerName: o.customerName,
        phone: o.phone,
        createdAt: o.createdAt,
        paidAt: o.paidAt,
      })),
      total: orders.length,
    };
  }

  /** GET /payments/stats — summary stats. */
  @Get('stats')
  async stats() {
    return { success: true, ...(await this.orderService.getStats()) };
  }

  /** GET /payments/config — payment gateway config (masked). */
  @Get('config')
  @RequirePermission('manageSystem')
  async getConfig() {
    return { success: true, config: await this.configService.getConfigMasked() };
  }

  /** POST /payments/config — save payment gateway config. */
  @Post('config')
  @RequirePermission('manageSystem')
  async saveConfig(@Body() body: any) {
    const saved = await this.configService.saveConfig(body || {});
    return { success: true, config: saved };
  }

  /** POST /payments/test — create a test QRIS order. */
  @Post('test')
  @RequirePermission('manageSystem')
  async createTest(@Body() body: { amount?: number; profile?: string }) {
    const amount = Number(body.amount) || 1000;
    const order = await this.orderService.createOrder({
      profile: body.profile || 'test',
      price: amount,
      customerName: 'Test Customer',
      phone: '',
    });
    return {
      success: true,
      orderId: order.orderId,
      amount: order.uniqueAmount,
      qrString: order.qrString,
      qrImage: order.qrImage,
      status: order.status,
    };
  }

  /** GET /payments/:orderId — transaction detail. */
  @Get(':orderId')
  async detail(@Param('orderId') orderId: string) {
    const order = await this.orderService.getOrder(orderId);
    if (!order) return { success: false, error: 'Transaction not found' };
    return {
      success: true,
      transaction: {
        ...order,
        gateway: 'payhook',
        purpose: 'voucher_purchase',
        referenceId: order.id,
        method: 'QRIS',
      },
    };
  }

  /** POST /payments/:orderId/check — force-check / re-verify an order. */
  @Post(':orderId/check')
  async checkStatus(@Param('orderId') orderId: string) {
    const order = await this.orderService.getOrder(orderId);
    if (!order) return { success: false, error: 'Transaction not found' };
    return { success: true, orderId, status: order.status };
  }
}
