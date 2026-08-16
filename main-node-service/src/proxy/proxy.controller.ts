import {
  All, Body, Controller, Headers, Param, Query, Req, Res, UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ProxyService } from './proxy.service';
import { AuthService } from '../auth/auth.service';
import { ErpGrpcClient } from '../erp/erp-grpc.client';
import { ErpDashboardGrpcClient } from '../erp/erp-dashboard-grpc.client';
import { HotspotGrpcClient } from '../erp/hotspot-grpc.client';

type Target = 'auth' | 'erp' | 'payment' | 'bot';

const TARGETS: Record<string, Target> = {
  erp: 'erp', payment: 'payment', bot: 'bot', batches: 'erp', voucherTypes: 'erp', 'voucher-types': 'erp',
  voucher: 'erp', users: 'auth', mobile: 'auth', qris: 'payment', sessions: 'erp', mikrotik: 'erp',
  resellers: 'bot', 'bot-resellers': 'bot', telegram: 'bot', pppoe: 'erp', report: 'erp', billing: 'payment', payments: 'payment',
};

@Controller('api/:target')
export class ProxyController {
  constructor(
    private readonly proxyService: ProxyService,
    private readonly authService: AuthService,
    private readonly erpGrpc: ErpGrpcClient,
    private readonly erpDashboardGrpc: ErpDashboardGrpcClient,
    private readonly hotspotGrpc: HotspotGrpcClient,
  ) {}

  @All(['', ':rest(.*)'])
  async proxyHandler(
    @Param('target') targetRaw: string, @Param('rest') rest: string, @Req() req: Request, @Res() res: Response,
    @Body() body: any, @Query() query: any, @Headers('authorization') _clientAuth?: string,
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

    if (targetRaw === 'sessions' && req.method === 'GET' && (canonical === '/sessions' || /^\/sessions\/[^/]+$/.test(canonical))) {
      try {
        if (canonical === '/sessions') {
          const response = await this.erpGrpc.listSessions();
          if (!response?.success) return res.status(502).json({ success: false, message: response?.error || 'ERP gRPC ListSessions failed' });
          return res.status(200).json(response.sessions || []);
        }
        const response = await this.erpGrpc.getSession(canonical.split('/')[2]);
        if (!response?.success) return res.status(404).json({ error: response?.error || 'Router session tidak ditemukan' });
        return res.status(200).json(response.session || null);
      } catch (err: any) { return res.status(502).json({ success: false, message: `ERP gRPC unavailable: ${err?.message || err}` }); }
    }

    const pppoeMatch = canonical.match(/^\/pppoe\/([^/]+)\/(secrets|active)(?:\/([^/]+))?$/);
    if (targetRaw === 'pppoe' && req.method === 'GET' && pppoeMatch) {
      try {
        const routerSession = decodeURIComponent(pppoeMatch[1]);
        const kind = pppoeMatch[2];
        const name = pppoeMatch[3] ? decodeURIComponent(pppoeMatch[3]) : '';
        if (kind === 'secrets') {
          const response = name ? await this.erpDashboardGrpc.getPppSecret(routerSession, name) : await this.erpDashboardGrpc.listPppSecrets(routerSession, String(query?.profile || ''), String(query?.name || ''));
          if (!response?.success) return res.status(502).json({ success: false, message: response?.error || 'ERP gRPC PPPoE secrets failed' });
          return res.status(200).json(name ? (response.secret || null) : (response.secrets || []));
        }
        const response = await this.erpDashboardGrpc.listPppActive(routerSession);
        if (!response?.success) return res.status(502).json({ success: false, message: response?.error || 'ERP gRPC PPPoE active failed' });
        return res.status(200).json(response.connections || []);
      } catch (err: any) { return res.status(502).json({ success: false, message: `ERP gRPC unavailable: ${err?.message || err}` }); }
    }

    const dashboardMatch = canonical.match(/^\/mikrotik\/([^/]+)\/(dashboard|system\/resource|interfaces|hotspot\/log)$/);
    if (targetRaw === 'mikrotik' && req.method === 'GET' && dashboardMatch) {
      try {
        const routerSession = decodeURIComponent(dashboardMatch[1]);
        const kind = dashboardMatch[2];
        if (kind === 'dashboard') {
          const response = await this.erpDashboardGrpc.getDashboard(routerSession);
          if (!response?.success) return res.status(502).json({ success: false, message: response?.error || 'ERP gRPC dashboard failed' });
          return res.status(200).json({ identity: response.identity, rosVersion: response.rosVersion || response.version?.charAt(0) || '7', resource: { version: response.version, uptime: response.uptime, 'cpu-load': response.cpuLoad, 'free-memory': response.freeMemory, 'total-memory': response.totalMemory, 'free-hdd-space': response.freeHdd, 'total-hdd-space': response.totalHdd }, routerboard: {}, clock: {}, health: [], hotspot: { active: response.activeHotspotUsers ?? 0, total: response.totalHotspotUsers ?? 0 } });
        }
        if (kind === 'system/resource') {
          const response = await this.erpDashboardGrpc.getSystemResource(routerSession);
          if (!response?.success) return res.status(502).json({ success: false, message: response?.error || 'ERP gRPC resource failed' });
          const { success, error, ...restResponse } = response; return res.status(200).json(restResponse);
        }
        if (kind === 'interfaces') {
          const response = await this.erpDashboardGrpc.getInterfaces(routerSession);
          if (!response?.success) return res.status(502).json({ success: false, message: response?.error || 'ERP gRPC interfaces failed' });
          return res.status(200).json(response.interfaces || []);
        }
        const response = await this.erpDashboardGrpc.listLogs(routerSession, String(query?.topics || ''));
        if (!response?.success) return res.status(502).json({ success: false, message: response?.error || 'ERP gRPC log failed' });
        return res.status(200).json((response.logs || []).map((log: any) => ({ id: log.id, time: log.time, topics: log.topics, message: log.message })));
      } catch (err: any) { return res.status(502).json({ success: false, message: `ERP gRPC unavailable: ${err?.message || err}` }); }
    }

    const hotspotUserMatch = canonical.match(/^\/mikrotik\/([^/]+)\/hotspot\/users(?:\/([^/]+))?$/);
    if (targetRaw === 'mikrotik' && hotspotUserMatch && req.method === 'POST') {
      try {
        const routerSession = decodeURIComponent(hotspotUserMatch[1]);
        const name = hotspotUserMatch[2];
        const response = await this.hotspotGrpc.addUser({
          sessionId: routerSession,
          name: String(body?.name || name || ''),
          password: String(body?.password || ''),
          profile: String(body?.profile || ''),
          comment: String(body?.comment || ''),
          limitUptime: String(body?.limitUptime || body?.['limit-uptime'] || ''),
        });
        return res.status(200).json(response || { success: false, error: 'AddHotspotUser failed' });
      } catch (err: any) { return res.status(502).json({ success: false, message: `MikroTik gRPC unavailable: ${err?.message || err}` }); }
    }

    const hotspotDeleteMatch = canonical.match(/^\/mikrotik\/([^/]+)\/hotspot\/users\/([^/]+)$/);
    if (targetRaw === 'mikrotik' && req.method === 'DELETE' && hotspotDeleteMatch) {
      try {
        const response = await this.hotspotGrpc.removeUser(decodeURIComponent(hotspotDeleteMatch[1]), decodeURIComponent(hotspotDeleteMatch[2]));
        return res.status(200).json(response || { success: false, error: 'RemoveHotspotUser failed' });
      } catch (err: any) { return res.status(502).json({ success: false, message: `MikroTik gRPC unavailable: ${err?.message || err}` }); }
    }

    const hotspotBulk = canonical.match(/^\/mikrotik\/([^/]+)\/hotspot\/users\/bulk-delete$/);
    if (targetRaw === 'mikrotik' && req.method === 'POST' && hotspotBulk) {
      try {
        const names = Array.isArray(body?.names) ? body.names.filter(Boolean) : [];
        const response = await this.hotspotGrpc.bulkRemoveUsers(decodeURIComponent(hotspotBulk[1]), names);
        return res.status(200).json(response || { success: false, error: 'BulkRemoveHotspotUsers failed' });
      } catch (err: any) { return res.status(502).json({ success: false, message: `MikroTik gRPC unavailable: ${err?.message || err}` }); }
    }

    const hotspotProfile = canonical.match(/^\/mikrotik\/([^/]+)\/hotspot\/profiles(?:\/([^/]+))?$/);
    if (targetRaw === 'mikrotik' && hotspotProfile && ['POST', 'PUT', 'DELETE'].includes(req.method)) {
      try {
        const routerSession = decodeURIComponent(hotspotProfile[1]);
        const name = hotspotProfile[2] ? decodeURIComponent(hotspotProfile[2]) : String(body?.name || '');
        let response: any;
        if (req.method === 'POST') {
          response = await this.hotspotGrpc.addProfile({ sessionId: routerSession, name, onLogin: String(body?.onLogin || body?.['on-login'] || ''), sessionTimeout: String(body?.sessionTimeout || body?.['session-timeout'] || ''), idleTimeout: String(body?.idleTimeout || body?.['idle-timeout'] || ''), rateLimit: String(body?.rateLimit || body?.['rate-limit'] || ''), sharedUsers: String(body?.sharedUsers || body?.['shared-users'] || ''), addressPool: String(body?.addressPool || body?.['address-pool'] || '') });
        } else if (req.method === 'PUT') {
          response = await this.hotspotGrpc.updateProfile({ sessionId: routerSession, name, onLogin: String(body?.onLogin || body?.['on-login'] || ''), sessionTimeout: String(body?.sessionTimeout || body?.['session-timeout'] || ''), idleTimeout: String(body?.idleTimeout || body?.['idle-timeout'] || ''), rateLimit: String(body?.rateLimit || body?.['rate-limit'] || ''), sharedUsers: String(body?.sharedUsers || body?.['shared-users'] || ''), addressPool: String(body?.addressPool || body?.['address-pool'] || '') });
        } else {
          response = await this.hotspotGrpc.deleteProfile(routerSession, name);
        }
        return res.status(200).json(response || { success: false, error: 'Hotspot profile operation failed' });
      } catch (err: any) { return res.status(502).json({ success: false, message: `MikroTik gRPC unavailable: ${err?.message || err}` }); }
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
    if (targetRaw === 'voucher') { if (/^\/([^/]+)\/profiles$/.test(restPath)) return `/voucher/batches/${restPath.split('/')[1]}/import/profiles`; return restPath; }
    if (targetRaw === 'users') return `/api/users${restPath}`;
    if (targetRaw === 'mobile') return `/api/mobile-auth${restPath}`;
    if (targetRaw === 'sessions') return `/sessions${restPath}`;
    if (targetRaw === 'mikrotik') return `/mikrotik${restPath}`;
    return `/${targetRaw}${restPath}`;
  }

  private isPublicRequest(target: Target, canonical: string, method: string): boolean {
    return (target === 'payment' && canonical.startsWith('/payments/payhook/app-webhook')) || (target === 'payment' && method === 'POST' && (canonical === '/api/qris/orders' || /^\/api\/qris\/orders\/[^/]+\/qr$/.test(canonical))) || (target === 'payment' && canonical.startsWith('/qris/status/'));
  }
}
