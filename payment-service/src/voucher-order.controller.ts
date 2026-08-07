import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';

import { VoucherOrderService } from './voucher-order.service';
import { PayhookAppWebhookDto } from './dto/payhook-app-webhook.dto';
import { PaymentConfigService } from './payment-config.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RequirePermission } from './auth/permissions.decorator';

/**
 * QRIS GoPay Merchant voucher-selling controller (payment-service).
 *
 * Public routes:
 *   POST /payments/payhook/app-webhook  ← PayHook Android app webhook receiver
 *   POST /api/qris/orders               ← create an order (checkout frontend)
 *   GET  /qris/status/:orderId          ← polling status for the checkout page
 *   POST /api/qris/orders/:id/qr        ← (re)generate QR image
 *
 * Admin routes (JWT via auth-node-service — defense-in-depth behind the BFF):
 *   GET  /api/qris/orders               ← order list (requires manageBilling)
 *   GET  /api/qris/orders/:id           ← order detail (requires manageBilling)
 *   POST /api/qris/orders/:id/verify    ← manual fallback verification (requires manageBilling)
 *   GET  /api/qris/callbacks            ← PayHook callback monitor log (requires manageBilling)
 *   GET  /api/qris/stats                ← summary stats (requires manageBilling)
 *
 * NOTE: These admin routes are protected by JwtAuthGuard which validates the
 * Bearer token against auth-node-service. The BFF enforces the session AND
 * injects the cached JWT, so a direct hit to payment-service (bypassing nginx)
 * still requires a valid token.
 */
@Controller()
export class VoucherOrderController {
  constructor(
    private readonly orderService: VoucherOrderService,
    private readonly paymentConfigService: PaymentConfigService,
  ) {}

  // ── Public: PayHook Android-app webhook ─────────────────────────
  // Security: verified against PaymentConfigService's payhookWebhook*
  // settings (auth header + HMAC-SHA256 anti-spoof/anti-replay).
  @Post('payments/payhook/app-webhook')
  @HttpCode(200)
  async appWebhook(@Body() payload: PayhookAppWebhookDto, @Req() req: Request) {
    await this.verifyPayhookRequest(req);
    const result = await this.orderService.processAppWebhook(payload || {});
    return result;
  }

  private async verifyPayhookRequest(req: Request): Promise<void> {
    const cfg = await this.paymentConfigService.getConfig();
    const authType = cfg.payhookWebhookAuthType || 'none';

    if (authType !== 'none') {
      const token = cfg.payhookWebhookToken;
      if (!token) {
        throw new UnauthorizedException(
          `Webhook auth type is "${authType}" but no token is configured in payment settings.`,
        );
      }
      if (authType === 'bearer') {
        const header = req.header('authorization') || '';
        if (!this.safeEqual(header, `Bearer ${token}`)) {
          throw new UnauthorizedException('Invalid Bearer token');
        }
      } else if (authType === 'api_key') {
        const headerName = (cfg.payhookWebhookHeaderName || 'X-API-Key').toLowerCase();
        const provided = req.header(headerName) || '';
        if (!this.safeEqual(provided, token)) {
          throw new UnauthorizedException('Invalid API key');
        }
      } else if (authType === 'basic') {
        const header = req.header('authorization') || '';
        const expected = `Basic ${Buffer.from(token).toString('base64')}`;
        if (!this.safeEqual(header, expected)) {
          throw new UnauthorizedException('Invalid Basic auth token');
        }
      }
    }

    if (cfg.payhookWebhookSecretKey) {
      const timestamp = req.header('x-payhook-timestamp') || '';
      const signature = req.header('x-payhook-signature') || '';
      if (!timestamp || !signature) {
        throw new UnauthorizedException('Missing HMAC signature headers');
      }
      const skewSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
      if (!Number.isFinite(skewSeconds) || skewSeconds > 300) {
        throw new UnauthorizedException('Webhook timestamp expired or invalid (anti-replay)');
      }
      const raw = (req as any).rawBody ? (req as any).rawBody.toString('utf8') : JSON.stringify(req.body);
      const expected =
        'sha256=' +
        crypto.createHmac('sha256', cfg.payhookWebhookSecretKey).update(`${timestamp}.${raw}`).digest('hex');
      if (!this.safeEqual(signature, expected)) {
        throw new UnauthorizedException('Invalid HMAC signature');
      }
    }
  }

  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  // ── Public: create a voucher order (unique amount) ──────────────
  @Post('api/qris/orders')
  async createOrder(
    @Body()
    body: {
      voucherTypeId?: string;
      profile?: string;
      sessionId?: string;
      customerName?: string;
      phone?: string;
      qrString?: string;
      price?: number;
    },
  ) {
    const order = await this.orderService.createOrder({
      voucherTypeId: body.voucherTypeId,
      profile: body.profile,
      sessionId: body.sessionId,
      customerName: body.customerName,
      phone: body.phone,
      qrString: body.qrString,
      price: body.price,
    });
    return {
      success: true,
      order: {
        orderId: order.orderId,
        voucherName: order.voucherName,
        price: order.price,
        uniqueAmount: order.uniqueAmount,
        uniqueCode: order.uniqueCode,
        qrString: order.qrString,
        qrImage: order.qrImage,
        expiresAt: order.expiresAt,
        status: order.status,
      },
    };
  }

  // ── Public: (re)generate QR image for an order ──────────────────
  @Post('api/qris/orders/:id/qr')
  @HttpCode(200)
  async regenerateQr(@Param('id') id: string) {
    const { qrString, qrImage } = await this.orderService.regenerateQr(id);
    return { success: true, qrString, qrImage };
  }

  // ── Public: polling status for the checkout page ────────────────
  @Get('qris/status/:orderId')
  async status(@Param('orderId') orderId: string) {
    const order = await this.orderService.getOrder(orderId);
    if (!order) {
      return { success: false, error: 'Order not found', status: 'unknown' };
    }
    return {
      success: true,
      status: order.status,
      voucherUsername: order.voucherUsername || null,
      voucherPassword: order.voucherPassword || null,
      voucherName: order.voucherName,
      uniqueAmount: order.uniqueAmount,
      paidAt: order.paidAt || null,
    };
  }

  // ── Admin: order list ───────────────────────────────────────────
  @Get('api/qris/orders')
  @UseGuards(JwtAuthGuard)
  @RequirePermission('manageBilling')
  async listOrders(@Query('status') status?: string) {
    const orders = await this.orderService.listOrders(status);
    return { success: true, orders, total: orders.length };
  }

  // ── Admin: order detail ─────────────────────────────────────────
  @Get('api/qris/orders/:id')
  @UseGuards(JwtAuthGuard)
  @RequirePermission('manageBilling')
  async orderDetail(@Param('id') id: string) {
    const order = await this.orderService.getOrderById(id);
    if (!order) {
      return { success: false, error: 'Order not found' };
    }
    return { success: true, order };
  }

  // ── Admin: manual fallback verification ─────────────────────────
  @Post('api/qris/orders/:id/verify')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @RequirePermission('manageBilling')
  async verifyOrder(@Param('id') id: string) {
    const order = await this.orderService.markPaidManual(id);
    return { success: true, order };
  }

  // ── Admin: PayHook callback monitor log ─────────────────────────
  @Get('api/qris/callbacks')
  @UseGuards(JwtAuthGuard)
  @RequirePermission('manageBilling')
  async callbacks(@Query('limit') limit?: string) {
    const logs = await this.orderService.listCallbackLogs(limit ? parseInt(limit, 10) : 100);
    return { success: true, logs, total: logs.length };
  }

  // ── Admin: stats ────────────────────────────────────────────────
  @Get('api/qris/stats')
  @UseGuards(JwtAuthGuard)
  @RequirePermission('manageBilling')
  async stats() {
    return { success: true, ...(await this.orderService.getStats()) };
  }
}
