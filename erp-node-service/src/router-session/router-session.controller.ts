import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MikrotikGrpcClient } from '../clients/mikrotik-grpc.client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/permissions.decorator';

/**
 * Router session (connection profile) CRUD, backed by mikrotik-go-service's
 * `router_sessions` table over gRPC.
 *
 * This was previously missing entirely — the frontend (`app.js`) has always
 * called `/api/sessions`, but no service exposed it, so every call 404'd at
 * the BFF's proxy whitelist. See `main-node-service/src/proxy/proxy.controller.ts`
 * for the matching `sessions` target alias that routes here.
 *
 * Request/response shapes intentionally mirror what `app.js` already sends
 * (loadSessions/editSessionFn/saveSession/delSession/testConn) so the
 * existing frontend needs no changes.
 */
@Controller()
@UseGuards(JwtAuthGuard)
@RequirePermission('manageSystem')
export class RouterSessionController {
  constructor(private readonly mikrotik: MikrotikGrpcClient) {}

  /** GET /sessions — list all router connection profiles (no passwords). */
  @Get('sessions')
  async list() {
    const resp = await this.mikrotik.listSessions();
    if (!resp.success) {
      throw new BadRequestException(resp.error || 'Gagal memuat daftar router');
    }
    return resp.sessions || [];
  }

  /** GET /sessions/:id — a single profile, for the edit form. */
  @Get('sessions/:id')
  async getOne(@Param('id') id: string) {
    const resp = await this.mikrotik.getSession(id);
    if (!resp.success) {
      return { error: resp.error || 'Router session tidak ditemukan' };
    }
    return resp.session;
  }

  /**
   * POST /sessions — upsert. The UI always sends the full form (including
   * `id`); we create if the id doesn't exist yet, update otherwise. This
   * matches `saveSession()` in app.js, which uses the same endpoint for
   * both "Add Router" and "Edit Router".
   */
  @Post('sessions')
  async upsert(@Body() body: Record<string, any>) {
    if (!body?.id || !body?.name || !body?.ip) {
      throw new BadRequestException('id, name, dan ip wajib diisi');
    }

    const existing = await this.mikrotik.getSession(body.id);
    const params = {
      id: String(body.id),
      name: String(body.name),
      ip: String(body.ip),
      port: Number(body.port) || 0,
      user: body.user ? String(body.user) : '',
      password: body.password ? String(body.password) : '',
      hotspotName: body.hotspotName ? String(body.hotspotName) : '',
      dnsName: body.dnsName ? String(body.dnsName) : '',
      currency: body.currency ? String(body.currency) : '',
      reloadInterval: Number(body.reloadInterval) || 0,
      iface: body.iface ? String(body.iface) : '',
      idleTo: Number(body.idleTo) || 0,
      livereport: body.livereport ? String(body.livereport) : '',
    };

    const resp = existing.success
      ? await this.mikrotik.updateSession(params)
      : await this.mikrotik.createSession(params);

    if (!resp.success) {
      throw new BadRequestException(resp.error || 'Gagal menyimpan router session');
    }
    return { success: true, session: resp.session };
  }

  /** DELETE /sessions/:id */
  @Delete('sessions/:id')
  async remove(@Param('id') id: string) {
    const resp = await this.mikrotik.deleteSession(id);
    if (!resp.success) {
      throw new BadRequestException(resp.error || 'Gagal menghapus router session');
    }
    return { success: true };
  }

  /**
   * GET /mikrotik/:id/connect/test — used by the "Test" button on the
   * Sessions page (`testConn()` in app.js). Reuses the existing
   * `TestConnect` RPC that was already implemented for other flows, just
   * never had a REST route in front of it.
   */
  @Get('mikrotik/:id/connect/test')
  async testConnect(@Param('id') id: string) {
    const resp = await this.mikrotik.testConnect(id);
    return resp;
  }
}
