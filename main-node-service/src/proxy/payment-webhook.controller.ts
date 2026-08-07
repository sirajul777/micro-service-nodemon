import { All, Body, Controller, Param, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { ProxyService } from './proxy.service';

/**
 * Public payment/QRIS routes that must NOT require auth. These are normally
 * reached via nginx, which forwards `/payments/*` and `/qris/*` straight to
 * payment-service. When the BFF is exposed directly (e.g. GATEWAY_PORT=8080),
 * the BFF must route these public paths itself so the same endpoints keep
 * working without going through nginx.
 *
 * Handles (bare paths that the /api/:target ProxyController does NOT match):
 *   POST /payments/payhook/app-webhook   (PayHook Android app webhook)
 *   GET  /qris/status/:orderId          (checkout polling)
 *
 * NOTE: `/api/qris/*` admin + `/api/qris/orders` public routes are already
 * handled by ProxyController (target=qris → payment-service), so they are not
 * duplicated here (which would cause a NestJS route conflict).
 */
@Controller()
export class PaymentWebhookController {
  private readonly PAYMENT = 'payment';

  constructor(private readonly proxyService: ProxyService) {}

  @All('payments/payhook/app-webhook')
  async payhookWebhook(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: any,
    @Query() query: any,
  ) {
    return this.forwardPublic(
      req,
      res,
      '/payments/payhook/app-webhook',
      body,
      query,
    );
  }

  @All('qris/status/:orderId')
  async qrisStatus(
    @Param('orderId') orderId: string,
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: any,
    @Query() query: any,
  ) {
    return this.forwardPublic(req, res, `/qris/status/${orderId}`, body, query);
  }

  private async forwardPublic(
    req: Request,
    res: Response,
    path: string,
    body: any,
    query: any,
  ) {
    const method = req.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    const resp = await this.proxyService.forward(
      this.PAYMENT,
      path,
      method,
      null, // public — no token
      body,
      query,
    );
    const { status, body: data } = this.proxyService.respond(resp);
    return res.status(status).json(data);
  }
}
