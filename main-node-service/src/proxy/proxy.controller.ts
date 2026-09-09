import {
  All, Body, Controller, Headers, Param, Query, Req, Res, UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { HttpProxyFallbackService } from './http-proxy-fallback.service';
import { AuthService } from '../auth/auth.service';
import { ErpGrpcClient } from '../erp/erp-grpc.client';
import { ErpDashboardGrpcClient } from '../erp/erp-dashboard-grpc.client';
import { HotspotGrpcClient } from '../erp/hotspot-grpc.client';
import { VoucherBatchGrpcClient } from '../erp/voucher-batch-grpc.client';
import { VoucherGenerateGrpcClient } from '../erp/voucher-generate-grpc.client';
import { VoucherTypeGrpcClient } from '../erp/voucher-type-grpc.client';
import { ReportRouterGrpcClient } from '../erp/report-router-grpc.client';
import { BotGrpcClient } from '../bot/bot-grpc.client';
import { PaymentGrpcClient } from '../payment/payment-grpc.client';
import { handleBotGrpcRoute } from './bot.routes';
import { normalizePppoeActiveList } from './pppoe.active-normalizer';

type Target = 'auth' | 'erp' | 'payment' | 'bot';

const TARGETS: Record<string, Target> = {
  erp: 'erp', payment: 'payment', bot: 'bot', batches: 'erp', voucherTypes: 'erp', 'voucher-types': 'erp',
  voucher: 'erp', users: 'auth', mobile: 'auth', qris: 'payment', sessions: 'erp', mikrotik: 'erp',
  resellers: 'bot', 'bot-resellers': 'bot', telegram: 'bot', pppoe: 'erp', report: 'erp', billing: 'payment', payments: 'payment',
};

@Controller('api/:target')
export class ProxyController {
  constructor(
    private readonly fallback: HttpProxyFallbackService,
    private readonly authService: AuthService,
    private readonly erpGrpc: ErpGrpcClient,
    private readonly erpDashboardGrpc: ErpDashboardGrpcClient,
    private readonly hotspotGrpc: HotspotGrpcClient,
    private readonly voucherBatchGrpc: VoucherBatchGrpcClient,
    private readonly voucherGenerateGrpc: VoucherGenerateGrpcClient,
    private readonly voucherTypeGrpc: VoucherTypeGrpcClient,
    private readonly reportRouterGrpc: ReportRouterGrpcClient,
    private readonly botGrpc: BotGrpcClient,
    private readonly paymentGrpc: PaymentGrpcClient,
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

    if (targetRaw === 'payments' && canonical.startsWith('/payments')) {
      try {
        if (req.method === 'GET' && canonical === '/payments') {
          const response = await this.paymentGrpc.list(String(query?.status || ''));
          if (!response?.success) return res.status(502).json({ success: false, message: response?.error || 'Payment gRPC list failed' });
          return res.status(200).json({ success: true, transactions: response.transactions || [], total: Number(response.total || 0) });
        }
        if (req.method === 'GET' && canonical === '/payments/stats') {
          const response = await this.paymentGrpc.stats();
          if (!response?.success) return res.status(502).json({ success: false, message: response?.error || 'Payment gRPC stats failed' });
          return res.status(200).json(response);
        }
        if (req.method === 'GET' && canonical === '/payments/config') {
          const response = await this.paymentGrpc.getConfig();
          if (!response?.success) return res.status(502).json({ success: false, message: response?.error || 'Payment gRPC config list failed' });
          return res.status(200).json({ success: true, config: response.config || null });
        }
        if (req.method === 'POST' && canonical === '/payments/config') {
          const response = await this.paymentGrpc.saveConfig(Object.fromEntries(Object.entries(body || {}).map(([k, v]) => [k, String(v ?? '')])));
          if (!response?.success) return res.status(400).json({ success: false, message: response?.error || 'Payment gRPC config save failed' });
          return res.status(200).json({ success: true, config: response.config || null });
        }
        if (req.method === 'POST' && canonical === '/payments/test') {
          const response = await this.paymentGrpc.test(Number(body?.amount) || 1000, String(body?.profile || 'test'));
          if (!response?.success) return res.status(400).json({ success: false, message: response?.error || 'Payment gRPC test failed' });
          return res.status(200).json({ success: true, orderId: response.orderId, amount: response.amount, qrString: response.qrString, qrImage: response.qrImage, status: response.status });
        }
        const detailMatch = canonical.match(/^\/payments\/([^/]+)$/);
        const checkMatch = canonical.match(/^\/payments\/([^/]+)\/check$/);
        if (req.method === 'GET' && detailMatch) {
          const response = await this.paymentGrpc.get(decodeURIComponent(detailMatch[1]));
          if (!response?.success) return res.status(404).json({ success: false, error: response?.error || 'Transaction not found' });
          return res.status(200).json({ success: true, transaction: response.transaction || null });
        }
        if (req.method === 'POST' && checkMatch) {
          const orderId = decodeURIComponent(checkMatch[1]);
          const response = await this.paymentGrpc.check(orderId);
          if (!response?.success) return res.status(404).json({ success: false, error: response?.error || 'Transaction not found' });
          return res.status(200).json({ success: true, orderId, status: response.status });
        }
      } catch (err: any) {
        return res.status(502).json({ success: false, message: `Payment gRPC unavailable: ${err?.message || err}` });
      }
    }

    if ((targetRaw === 'resellers' || targetRaw === 'bot-resellers' || targetRaw === 'telegram') &&
        await handleBotGrpcRoute(this.botGrpc, req, res, canonical, body, query)) return;

    const sellingMatch = canonical.match(/^\/report\/([^/]+)\/selling$/);
    if (targetRaw === 'report' && req.method === 'GET' && sellingMatch) {
      try {
        const routerSession = decodeURIComponent(sellingMatch[1]);
        const response = await this.reportRouterGrpc.listSellingScripts(
          routerSession,
          String(query?.idhr || ''),
          String(query?.idbl || ''),
        );
        if (!response?.success) return res.status(502).json({ success: false, message: response?.error || 'Report gRPC selling failed' });
        const records = (response.scripts || []).map((row: any) => ({
          date: String(row.date || ''), time: String(row.time || ''), username: String(row.username || ''),
          price: Number(row.price || 0), profile: String(row.profile || ''), comment: String(row.comment || ''),
        }));
        return res.status(200).json({ records, summary: { totalVouchers: records.length, totalIncome: records.reduce((sum: number, row: any) => sum + row.price, 0), currency: 'Rp', isIndo: true }, resellerGroups: [], filter: { idhr: query?.idhr, idbl: query?.idbl, prefix: query?.prefix, datacomments: query?.datacomments, dataprofile: query?.dataprofile, reseller: query?.reseller } });
      } catch (err: any) {
        return res.status(502).json({ success: false, message: `Report gRPC unavailable: ${err?.message || err}` });
      }
    }

    const resumeMatch = canonical.match(/^\/report\/([^/]+)\/resume$/);
    if (targetRaw === 'report' && req.method === 'GET' && resumeMatch) {
      try {
        const routerSession = decodeURIComponent(resumeMatch[1]);
        const response = await this.reportRouterGrpc.getResumeReport(routerSession, String(query?.idbl || ''));
        if (!response?.success) return res.status(502).json({ success: false, message: response?.error || 'Report gRPC resume failed' });
        return res.status(200).json({
          daily: (response.daily || []).map((row: any) => ({
            date: String(row.date || ''),
            vouchers: Number(row.vouchers || 0),
            total: Number(row.total || 0),
          })),
          summary: {
            totalVouchers: Number(response.totalVouchers || 0),
            totalIncome: Number(response.totalIncome || 0),
            currency: String(response.currency || 'Rp'),
            isIndo: Boolean(response.isIndo),
            month: String(response.month || ''),
            year: String(response.year || ''),
          },
        });
      } catch (err: any) {
        return res.status(502).json({ success: false, message: `Report gRPC unavailable: ${err?.message || err}` });
      }
    }

    const token = isPublic ? null : this.authService.getToken(session);
    const method = req.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    const resp = await this.fallback.forward(target, canonical, method, token, body, query);
    const { status, body: data } = this.fallback.respond(resp);
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
