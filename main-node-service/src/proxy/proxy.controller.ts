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
  erp: 'erp', payment: 'payment', bot: 'bot', batches: 'erp', voucherTypes: 'erp',
  'voucher-types': 'erp', voucher: 'erp', users: 'auth', mobile: 'auth', qris: 'payment',
  sessions: 'erp', mikrotik: 'erp', resellers: 'bot', 'bot-resellers': 'bot', telegram: 'bot',
  pppoe: 'erp', report: 'erp', billing: 'payment', payments: 'payment',
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
    if (!target) return res.status(404).json({ success: false, message: `Unknown service: ${targetRaw}` });

    const session = (req as any).session;
    const restPath = rest ? `/${rest}` : '';
    const canonical = this.normalizeCanonicalPath(targetRaw, restPath);
    const isPublic = this.isPublicRequest(target, canonical, req.method);

    if (!isPublic) {
      if (!(session && this.authService.isAuthenticated(session))) throw new UnauthorizedException('Please login first');
      if (!(await this.authService.validate(session))) throw new UnauthorizedException('Session token tidak valid atau kadaluarsa');
    }

    if (targetRaw === 'sessions' && canonical === '/sessions' && req.method === 'GET') {
      try {
        const response = await this.erpGrpc.listSessions();
        if (!response?.success) return res.status(502).json({ success: false, message: response?.error || 'ERP gRPC ListSessions failed' });
        return res.status(200).json(response.sessions || []);
      } catch (err: any) {
        return res.status(502).json({ success: false, message: `ERP gRPC unavailable: ${err?.message || err}` });
      }
    }

    if (targetRaw === 'sessions' && /^\/sessions\/[^/]+$/.test(canonical)) {
      try {
        const id = canonical.split('/')[2];
        if (req.method === 'GET') {
          const response = await this.erpGrpc.getSession(id);
          if (!response?.success) return res.status(404).json({ error: response?.error || 'Router session tidak ditemukan' });
          return res.status(200).json(response.session || null);
        }
        if (req.method === 'DELETE') {
          const response = await this.erpGrpc.deleteSession(id);
          if (!response?.success) return res.status(400).json({ success: false, message: response?.error || 'DeleteSession failed' });
          return res.status(200).json({ success: true });
        }
      } catch (err: any) {
        return res.status(502).json({ success: false, message: `ERP gRPC unavailable: ${err?.message || err}` });
      }
    }

    if (targetRaw === 'sessions' && canonical === '/sessions' && (req.method === 'POST' || req.method === 'PUT')) {
      try {
        const params = {
          id: String(body?.id || ''),
          name: String(body?.name || ''),
          ip: String(body?.ip || ''),
          port: Number(body?.port) || 0,
          user: body?.user ? String(body.user) : '',
          password: body?.password ? String(body.password) : '',
          hotspotName: body?.hotspotName ? String(body.hotspotName) : '',
          dnsName: body?.dnsName ? String(body.dnsName) : '',
          currency: body?.currency ? String(body.currency) : '',
          reloadInterval: Number(body?.reloadInterval) || 0,
          iface: body?.iface ? String(body.iface) : '',
          idleTo: Number(body?.idleTo) || 0,
          livereport: body?.livereport ? String(body.livereport) : '',
        };
        if (!params.id || !params.name || !params.ip) return res.status(400).json({ success: false, message: 'id, name, dan ip wajib diisi' });
        const response = req.method === 'POST'
          ? await this.erpGrpc.createSession(params)
          : await this.erpGrpc.updateSession(params);
        if (!response?.success) return res.status(400).json({ success: false, message: response?.error || 'Session mutation failed' });
        return res.status(200).json({ success: true, session: response.session });
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
    if (['resellers', 'bot-resellers', 'telegram', 'pppoe', 'report', 'billing', 'payments'].includes(targetRaw)) return `/${targetRaw}${restPath}`;
    return restPath;
  }

  private isPublicRequest(target: Target, canonical: string, method: string): boolean {
    return (
      (target === 'payment' && canonical.startsWith('/payments/payhook/app-webhook')) ||
      (target === 'payment' && method === 'POST' && (canonical === '/api/qris/orders' || /^\/api\/qris\/orders\/[^/]+\/qr$/.test(canonical))) ||
      (target === 'payment' && canonical.startsWith('/qris/status/'))
    );
  }
}
