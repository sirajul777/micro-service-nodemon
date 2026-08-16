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
import { ErpGrpcClient } from '../erp/erp-grpc.client';

type Target = 'auth' | 'erp' | 'payment' | 'bot';

const TARGETS: Record<string, Target> = {
  erp: 'erp',
  payment: 'payment',
  bot: 'bot',
  batches: 'erp',
  voucherTypes: 'erp',
  'voucher-types': 'erp',
  voucher: 'erp',
  users: 'auth',
  mobile: 'auth',
  qris: 'payment',
  sessions: 'erp',
  mikrotik: 'erp',
  resellers: 'bot',
  'bot-resellers': 'bot',
  telegram: 'bot',
  pppoe: 'erp',
  report: 'erp',
  billing: 'payment',
  payments: 'payment',
};

@Controller('api/:target')
export class ProxyController {
  constructor(
    private readonly proxyService: ProxyService,
    private readonly authService: AuthService,
    private readonly erpGrpc: ErpGrpcClient,
  ) {}

  @All(['', ':rest(.*)'])
  async proxyHandler(
    @Param('target') targetRaw: string,
    @Param('rest') rest: string,
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: any,
    @Query() query: any,
    @Headers('authorization') _clientAuth?: string,
  ) {
    const target = TARGETS[targetRaw];
    if (!target) {
      return res.status(404).json({ success: false, message: `Unknown service: ${targetRaw}` });
    }

    const session = (req as any).session;
    const restPath = rest ? `/${rest}` : '';
    const canonical = this.normalizeCanonicalPath(targetRaw, restPath);
    const isPublic = this.isPublicRequest(target, canonical, req.method);

    if (!isPublic) {
      const ok = session && this.authService.isAuthenticated(session);
      if (!ok) throw new UnauthorizedException('Please login first');
      const valid = await this.authService.validate(session);
      if (!valid) throw new UnauthorizedException('Session token tidak valid atau kadaluarsa');
    }

    // Sessions GET is now a direct internal gRPC call from BFF -> ERP.
    // POST/DELETE and all other ERP paths still use the compatibility HTTP proxy
    // until their corresponding gRPC RPCs are migrated in later service branches.
    if (
      targetRaw === 'sessions' &&
      (req.method === 'GET') &&
      (canonical === '/sessions' || /^\/sessions\/[^/]+$/.test(canonical))
    ) {
      try {
        if (canonical === '/sessions') {
          const response = await this.erpGrpc.listSessions();
          if (!response?.success) {
            return res.status(502).json({ success: false, message: response?.error || 'ERP gRPC ListSessions failed' });
          }
          return res.status(200).json(response.sessions || []);
        }

        const id = canonical.split('/')[2];
        const response = await this.erpGrpc.getSession(id);
        if (!response?.success) {
          return res.status(404).json({ error: response?.error || 'Router session tidak ditemukan' });
        }
        return res.status(200).json(response.session || null);
      } catch (err: any) {
        return res.status(502).json({ success: false, message: `ERP gRPC unavailable: ${err?.message || err}` });
      }
    }

    const token = isPublic ? null : this.authService.getToken(session);
    const method = req.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    const resp = await this.proxyService.forward(target, canonical, method, token, body, query);
    const { status, body: data } = this.proxyService.respond(resp);
    return res.status(status).json(data);
  }

  private normalizeCanonicalPath(targetRaw: string, restPath: string): string {
    if (targetRaw === 'qris') return `/api/qris${restPath}`;
    if (targetRaw === 'payment') return `/api${restPath}`;
    if (targetRaw === 'batches') return `/voucher/batches${restPath}`;
    if (targetRaw === 'voucher-types' || targetRaw === 'voucherTypes') return `/voucher/types${restPath}`;
    if (targetRaw === 'voucher') {
      if (/^\/([^/]+)\/profiles$/.test(restPath)) {
        const cs = restPath.split('/')[1];
        return `/voucher/batches/${cs}/import/profiles`;
      }
      return restPath;
    }
    if (targetRaw === 'users') return `/api/users${restPath}`;
    if (targetRaw === 'mobile') return `/api/mobile-auth${restPath}`;
    if (targetRaw === 'sessions') return `/sessions${restPath}`;
    if (targetRaw === 'mikrotik') return `/mikrotik${restPath}`;
    if (
      targetRaw === 'resellers' ||
      targetRaw === 'bot-resellers' ||
      targetRaw === 'telegram' ||
      targetRaw === 'pppoe' ||
      targetRaw === 'report' ||
      targetRaw === 'billing' ||
      targetRaw === 'payments'
    ) {
      return `/${targetRaw}${restPath}`;
    }
    return restPath;
  }

  private isPublicRequest(target: Target, canonical: string, method: string): boolean {
    return (
      (target === 'payment' && canonical.startsWith('/payments/payhook/app-webhook')) ||
      (target === 'payment' &&
        method === 'POST' &&
        (canonical === '/api/qris/orders' || /^\/api\/qris\/orders\/[^/]+\/qr$/.test(canonical))) ||
      (target === 'payment' && canonical.startsWith('/qris/status/'))
    );
  }
}
