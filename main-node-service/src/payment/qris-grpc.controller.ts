import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { PaymentGrpcClient } from './payment-grpc.client';

@Controller('api/qris')
export class QrisGrpcController {
  constructor(private readonly auth: AuthService, private readonly payment: PaymentGrpcClient) {}

  private async requireSession(req: Request) {
    const session = (req as any).session;
    if (!(session && this.auth.isAuthenticated(session))) throw new UnauthorizedException('Please login first');
    if (!(await this.auth.validate(session))) throw new UnauthorizedException('Session token tidak valid atau kadaluarsa');
  }

  @Post('orders')
  async createOrder(@Body() body: any) {
    const response = await this.payment.createQrisOrder(body);
    if (!response?.success) return { success: false, error: response?.error || 'Payment gRPC QRIS order failed' };
    return { success: true, order: JSON.parse(response.orderJson || '{}') };
  }

  @Post('orders/:id/qr')
  async regenerate(@Param('id') id: string) {
    const response = await this.payment.regenerateQrisOrder(id);
    if (!response?.success) return { success: false, error: response?.error || 'Payment gRPC QR regeneration failed' };
    return { success: true, qrString: response.qrString, qrImage: response.qrImage || null };
  }

  @Get('orders')
  async listOrders(@Req() req: Request, @Query('status') status?: string) {
    await this.requireSession(req);
    const response = await this.payment.listQrisOrders(status || '');
    if (!response?.success) return { success: false, error: response?.error || 'Payment gRPC QRIS orders failed' };
    return { success: true, orders: JSON.parse(response.ordersJson || '[]'), total: Number(response.total || 0) };
  }

  @Get('orders/:id')
  async getOrder(@Req() req: Request, @Param('id') id: string) {
    await this.requireSession(req);
    const response = await this.payment.getQrisOrder(id);
    if (!response?.success) return { success: false, error: response?.error || 'Order not found' };
    return { success: true, order: JSON.parse(response.orderJson || '{}') };
  }

  @Post('orders/:id/verify')
  async verify(@Req() req: Request, @Param('id') id: string) {
    await this.requireSession(req);
    const response = await this.payment.verifyQrisOrder(id);
    if (!response?.success) return { success: false, error: response?.error || 'QRIS verification failed' };
    return { success: true, order: JSON.parse(response.orderJson || '{}') };
  }

  @Get('callbacks')
  async callbacks(@Req() req: Request, @Query('limit') limit?: string) {
    await this.requireSession(req);
    const response = await this.payment.listQrisCallbacks(Number(limit) || 100);
    if (!response?.success) return { success: false, error: response?.error || 'Payment gRPC callback list failed' };
    return { success: true, logs: JSON.parse(response.logsJson || '[]'), total: Number(response.total || 0) };
  }

  @Get('stats')
  async stats(@Req() req: Request) {
    await this.requireSession(req);
    const response = await this.payment.getQrisStats();
    if (!response?.success) return { success: false, error: response?.error || 'Payment gRPC stats failed' };
    return { success: true, ...(JSON.parse(response.statsJson || '{}')) };
  }
}
