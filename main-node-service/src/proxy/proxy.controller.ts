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
  batches: 'erp',
  // The frontend's Voucher Settings page calls `/api/voucher-types*` (app.js:
  // loadVoucherSettings() → req('/voucher-types'), saveVt() → post('/voucher-
  // types'), etc). These map to erp-node-service's VoucherTypeController,
  // mounted at /voucher/types. The frontend also calls `/api/voucher/*` for
  // batch-profile import (app.js: initBatch() → req(`/batches/${CS}/import/
  // profiles`) actually uses `batches`, but the monolith also exposes
  // `/api/voucher/:cs/profiles` → erp `/voucher/batches/:cs/import/profiles`).
  voucherTypes: 'erp',
  'voucher-types': 'erp',
  voucher: 'erp',
  // The frontend's batch routes also depend on the legacy `/api/voucher/:cs/profiles`
  // path, which gets rewritten to `/voucher/batches/:cs/import/profiles` below.
  // The frontend's User Management page calls `/api/users*` (app.js:
  // loadUserManagement() → req('/users'), saveUm() → post('/users'), etc).
  // These map to auth-node-service's UserController, mounted at /api/users.
  users: 'auth',
  // The frontend calls QRIS admin endpoints via `/api/qris/*` (see app.js:
  // req('/qris/stats') → fetch(API + '/qris/stats') = /api/qris/stats).
  // Route them through the BFF so the session is enforced and the cached
  // JWT is injected, satisfying payment-service's JwtAuthGuard.
  qris: 'payment',
  // The frontend's Sessions page calls `/api/sessions*` and
  // `/api/mikrotik/:id/connect/test` directly (app.js: loadSessions() →
  // req('/sessions'), testConn() → req(`/mikrotik/${id}/connect/test`)),
  // with no `/erp/` segment. These are handled by erp-node-service's
  // RouterSessionController — see the canonical-path branch below for how
  // the `/sessions`/`/mikrotik` prefix is preserved when forwarding.
  sessions: 'erp',
  mikrotik: 'erp',
  // ── Phase 11: feature areas whose backends we implemented ──────────────
  // Resellers / bot-resellers / telegram → bot-py-service (rest_api.py).
  resellers: 'bot',
  'bot-resellers': 'bot',
  telegram: 'bot',
  // PPPoE ops → erp (which talks to Go gRPC).
  pppoe: 'erp',
  // Reports (selling/live/resume) → erp (aggregates from DB + Go).
  report: 'erp',
  // Billing (customers/invoices/settlements) → payment-service.
  billing: 'payment',
  // Payments stats/test/check → payment-service.
  payments: 'payment',
};

/**
 * Catch-all proxy for the domain services. The BFF enforces the session,
 * re-validates the JWT, then forwards to the requested service with the
 * bearer token injected.
 *
 * Route pattern: /api/:target[/:rest(.*)]  (see the @All(...) comment below
 * for why a bare ':rest*' pattern doesn't work here)
 */
@Controller('api/:target')
export class ProxyController {
  constructor(
    private readonly proxyService: ProxyService,
    private readonly authService: AuthService,
  ) {}

  // Two things had to be fixed here, found by actually spinning up this
  // controller against the installed Express/path-to-regexp and hitting it
  // with real requests (assumptions from reading the code were wrong on
  // both counts):
  //
  // 1. ':rest*' alone does NOT match a bare '/api/:target' with nothing
  //    after it — Express/path-to-regexp needs the leading '/' + at least
  //    one segment for a '*' param to kick in. This is the direct cause of
  //    GET /api/sessions returning 404 straight from the router, before
  //    ever reaching this controller.
  // 2. ':rest*' also only ever captured a SINGLE path segment, not
  //    everything after it — '/api/erp/voucher/types' was being forwarded
  //    downstream as just '/voucher', silently dropping '/types'. This
  //    affected every multi-segment call through every alias (erp, payment,
  //    qris, bot), not just sessions/mikrotik — it just went unnoticed
  //    because most existing frontend calls happen to be single-segment.
  //
  // ':rest(.*)' (a path-to-regexp custom-regex param) captures the full
  // remaining path including slashes; pairing it with '' as a second
  // pattern covers the bare case. Verified against the actual installed
  // @nestjs/core (10.4.22) / express (4.22.1) / path-to-regexp (3.3.0).
  @All(['', ':rest(.*)'])
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
    //
    // The rest path depends on which target alias was used:
    //   /api/payment/api/qris/orders → target=payment, rest=api/qris/orders
    //   /api/qris/orders            → target=qris,   rest=orders
    // Normalize both to a canonical path so the public-route checks below
    // are correct regardless of routing alias.
    const restPath = rest ? `/${rest}` : '';
    const canonical = this.normalizeCanonicalPath(targetRaw, restPath);

    const isPublic = this.isPublicRequest(target, canonical, req.method);

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

    // Build the downstream path. `canonical` already normalizes the qris
    // alias to the payment-service's real paths (e.g. /api/payment/... →
    // /api/qris/..., and /api/qris/... → /api/qris/...).
    const downstreamPath = canonical;
    const method = req.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

    const resp = await this.proxyService.forward(target, downstreamPath, method, token, body, query);
    const { status, body: data } = this.proxyService.respond(resp);
    return res.status(status).json(data);
  }

  private normalizeCanonicalPath(targetRaw: string, restPath: string): string {
    if (targetRaw === 'qris') {
      return `/api/qris${restPath}`;
    }
    if (targetRaw === 'payment') {
      return `/api${restPath}`;
    }
    if (targetRaw === 'batches') {
      return `/voucher/batches${restPath}`;
    }
    if (targetRaw === 'voucher-types' || targetRaw === 'voucherTypes') {
      return `/voucher/types${restPath}`;
    }
    if (targetRaw === 'voucher') {
      if (/^\/([^/]+)\/profiles$/.test(restPath)) {
        const cs = restPath.split('/')[1];
        return `/voucher/batches/${cs}/import/profiles`;
      }
      return restPath;
    }
    if (targetRaw === 'users') {
      return `/api/users${restPath}`;
    }
    if (targetRaw === 'sessions') {
      return `/sessions${restPath}`;
    }
    if (targetRaw === 'mikrotik') {
      return `/mikrotik${restPath}`;
    }
    // Phase 11 aliases pass through to their target with the same path shape:
    //   resellers / bot-resellers / telegram → bot-py (rest_api.py)
    //   pppoe / report → erp controllers mounted at /pppoe, /report
    //   billing → payment-service billing controllers mounted at /billing
    //   payments → payment-service payments controllers mounted at /payments
    if (
      targetRaw === 'resellers' ||
      targetRaw === 'bot-resellers' ||
      targetRaw === 'telegram' ||
      targetRaw === 'pppoe' ||
      targetRaw === 'report' ||
      targetRaw === 'billing' ||
      targetRaw === 'payments'
    ) {
      return restPath;
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