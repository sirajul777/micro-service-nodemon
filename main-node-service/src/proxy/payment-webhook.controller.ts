import { All, Body, Controller, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { PaymentGrpcClient } from '../payment/payment-grpc.client';

/**
 * Public payment/QRIS routes. The client-facing HTTP boundary remains here,
 * but every hop from the BFF to payment-service is now gRPC.
 */
@Controller()
export class PaymentWebhookController {
  constructor(private readonly paymentGrpc: PaymentGrpcClient) {}

  @All('payments/payhook/app-webhook')
  async payhookWebhook(@Res() res: Response, @Body() body: any) {
    try {
      const response = await this.paymentGrpc.processPayhookWebhook(body);
      if (!response?.success) {
        return res.status(502).json({ success: false, matched: false, error: response?.error || 'Payment gRPC webhook failed' });
      }
      return res.status(200).json({
        success: true,
        matched: Boolean(response.matched),
        orderId: response.orderId || undefined,
        status: response.status || undefined,
        note: response.note || '',
      });
    } catch (error: any) {
      return res.status(502).json({ success: false, matched: false, error: String(error?.message || error) });
    }
  }

  @All('qris/status/:orderId')
  async qrisStatus(@Param('orderId') orderId: string, @Res() res: Response) {
    try {
      const response = await this.paymentGrpc.check(decodeURIComponent(orderId));
      if (!response?.success) {
        return res.status(404).json({ success: false, error: response?.error || 'Transaction not found' });
      }
      return res.status(200).json({ success: true, orderId: response.orderId || orderId, status: response.status || '' });
    } catch (error: any) {
      return res.status(502).json({ success: false, error: String(error?.message || error) });
    }
  }
}
