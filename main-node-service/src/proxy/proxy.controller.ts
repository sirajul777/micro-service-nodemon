import {
  All,
  Body,
  Controller,
  Headers,
  Param,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ProxyService } from './proxy.service';
import { AuthService } from '../auth/auth.service';

type Target = 'auth' | 'erp' | 'payment' | 'bot';

const TARGETS: Record<string, Target> = {
  erp: 'erp',
  payment: 'payment',
  bot: 'bot',
};

/**
 * Catch-all proxy for the domain services. The BFF enforces the session,
 * re-validates the JWT, then forwards to the requested service with the
 * bearer token injected.
 *
 * Route pattern: /api/:target/:rest*
 */
@Controller('api/:target')
export class ProxyController {
  constructor(
    private readonly proxyService: ProxyService,
    private readonly authService: AuthService,
  ) {}

  @All(':rest*')
  async proxyHandler(
    @Param('target') targetRaw: string,
    @Param('rest') rest: string,
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: any,
    @Query() query: any,
    @Headers('authorization') clientAuth?: string,
  ) {
    const target = TARGETS[targetRaw];
    if (!target) {
      return res.status(404).json({ success: false, message: `Unknown service: ${targetRaw}` });
    }

    const session = (req as any).session;

    // Public routes that don't require auth (e.g. payment app-webhook, qris
    // checkout, qris status). These are forwarded without a token.
    const restPath = rest ? `/${rest}` : '';
    const fullPath = restPath;
    const isPublic =
      (target === 'payment' &&
        (fullPath.startsWith('/api/qris/orders')) &&
        req.method === 'POST' &&
        !String(query?.public === 'true')) ||
      (target === 'payment' && fullPath.startsWith('/payments/payhook/app-webhook'));

    // Enforce auth for everything else.
    if (!isPublic) {
      const ok = session && this.authService.isAuthenticated(session);
      if (!ok) {
        throw new UnauthorizedException('Please login first');
      }
      // Re-validate JWT against auth-service.
      const valid = await this.authService.validate(session);
      if (!valid) {
        throw new UnauthorizedException('Session token tidak valid atau kadaluarsa');
      }
    }

    const token = isPublic ? null : this.authService.getToken(session);

    // Build the downstream path: /api/:target/:rest* → /:rest*
    const downstreamPath = fullPath;
    const method = req.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const resp = await this.proxyService.forward(target, downstreamPath, method, token, body, query);
    const { status, body: data } = this.proxyService.respond(resp);
    return res.status(status).json(data);
  }
}
