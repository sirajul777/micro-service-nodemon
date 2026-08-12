import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MikrotikGrpcClient } from '../clients/mikrotik-grpc.client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/permissions.decorator';

/**
 * PPPoE operations (secrets CRUD, profiles CRUD, active connections, pools).
 * Backed by mikrotik-go-service over gRPC.
 *
 * The BFF routes `/api/pppoe/:session/*` ? erp `/pppoe/:session/*`
 * (see `pppoe` target alias in main-node-service proxy.controller.ts).
 *
 * Two things fixed here, both found by comparing directly against the
 * reference monolith (sirajul777/nodemon's pppoe.controller.ts):
 *
 * 1. Permission scope: GET routes only need `viewDashboard` in the
 *    monolith (any role that can see the dashboard can view PPPoE data);
 *    only mutations need `managePppoe`. This previously had
 *    `managePppoe` class-wide, blocking view-only roles from the page
 *    entirely.
 * 2. Response shape: GET routes return the raw array/object directly in
 *    the monolith (`this.mikrotikService.run(...)` passthrough) -- app.js
 *    calls `.length`/`.forEach`/`.sort()` straight on the response. This
 *    previously wrapped everything as `{success, secrets:[...]}` etc.,
 *    which isn't an array, so those calls silently failed (or produced
 *    `undefined`) and the page rendered blank even though the request
 *    itself succeeded (200 OK, valid JSON) -- this is the "data fetched,
 *    not rendered" symptom.
 */
@Controller('pppoe')
@UseGuards(JwtAuthGuard)
export class PppoeController {
  constructor(private readonly mikrotik: MikrotikGrpcClient) {}

  // ?? Secrets list (with optional profile/name filter) ?????????????
  @Get(':session/secrets')
  @RequirePermission('viewDashboard')
  async listSecrets(
    @Param('session') session: string,
    @Query('profile') profile?: string,
    @Query('name') name?: string,
  ) {
    const resp = await this.mikrotik.listPppSecrets(session, profile, name);
    if (!resp.success) {
      throw new BadRequestException(resp.error || 'Gagal memuat secret');
    }
    return resp.secrets || [];
  }

  @Get(':session/secrets/:name')
  @RequirePermission('viewDashboard')
  async getSecret(@Param('session') session: string, @Param('name') name: string) {
    const resp = await this.mikrotik.getPppSecret(session, name);
    if (!resp.success) {
      throw new BadRequestException(resp.error || 'Secret tidak ditemukan');
    }
    return resp.secret || null;
  }

  @Post(':session/secrets')
  @RequirePermission('managePppoe')
  async addSecret(
    @Param('session') session: string,
    @Body() body: {
      name: string;
      password?: string;
      service?: string;
      profile?: string;
      localAddress?: string;
      remoteAddress?: string;
      comment?: string;
    },
  ) {
    if (!body.name) return { success: false, error: 'name wajib diisi' };
    return this.mikrotik.addPppSecret({
      sessionId: session,
      name: body.name,
      password: body.password || '',
      service: body.service || '',
      profile: body.profile || '',
      localAddress: body.localAddress || '',
      remoteAddress: body.remoteAddress || '',
      comment: body.comment || '',
    });
  }

  @Put(':session/secrets/:name')
  @RequirePermission('managePppoe')
  async updateSecret(
    @Param('session') session: string,
    @Param('name') name: string,
    @Body() body: {
      password?: string;
      service?: string;
      profile?: string;
      localAddress?: string;
      remoteAddress?: string;
      comment?: string;
    },
  ) {
    return this.mikrotik.updatePppSecret({
      sessionId: session,
      name,
      password: body.password || '',
      service: body.service || '',
      profile: body.profile || '',
      localAddress: body.localAddress || '',
      remoteAddress: body.remoteAddress || '',
      comment: body.comment || '',
    });
  }

  @Delete(':session/secrets/:name')
  @RequirePermission('managePppoe')
  async deleteSecret(@Param('session') session: string, @Param('name') name: string) {
    return this.mikrotik.deletePppSecret(session, name);
  }

  @Patch(':session/secrets/:name/enable')
  @RequirePermission('managePppoe')
  async enableSecret(@Param('session') session: string, @Param('name') name: string) {
    return this.mikrotik.enablePppSecret(session, name);
  }

  @Patch(':session/secrets/:name/disable')
  @RequirePermission('managePppoe')
  async disableSecret(@Param('session') session: string, @Param('name') name: string) {
    return this.mikrotik.disablePppSecret(session, name);
  }

  // ?? Profiles ?????????????????????????????????????????????????????
  @Get(':session/profiles')
  @RequirePermission('viewDashboard')
  async listProfiles(@Param('session') session: string) {
    const resp = await this.mikrotik.listPppProfiles(session);
    if (!resp.success) {
      throw new BadRequestException(resp.error || 'Gagal memuat profile');
    }
    return resp.profiles || [];
  }

  @Post(':session/profiles')
  @RequirePermission('managePppoe')
  async addProfile(
    @Param('session') session: string,
    @Body() body: {
      name: string;
      localAddress?: string;
      remoteAddress?: string;
      dns?: string;
      rateLimit?: string;
      bridge?: string;
      onlyOne?: string;
      changeTcpMss?: string;
    },
  ) {
    if (!body.name) return { success: false, error: 'name wajib diisi' };
    return this.mikrotik.addPppProfile({
      sessionId: session,
      name: body.name,
      localAddress: body.localAddress || '',
      remoteAddress: body.remoteAddress || '',
      dns: body.dns || '',
      rateLimit: body.rateLimit || '',
      bridge: body.bridge || '',
      onlyOne: body.onlyOne || '',
      changeTcpMss: body.changeTcpMss || '',
    });
  }

  @Put(':session/profiles/:name')
  @RequirePermission('managePppoe')
  async updateProfile(
    @Param('session') session: string,
    @Param('name') name: string,
    @Body() body: {
      localAddress?: string;
      remoteAddress?: string;
      dns?: string;
      rateLimit?: string;
      bridge?: string;
      onlyOne?: string;
      changeTcpMss?: string;
    },
  ) {
    return this.mikrotik.updatePppProfile({
      sessionId: session,
      name,
      localAddress: body.localAddress || '',
      remoteAddress: body.remoteAddress || '',
      dns: body.dns || '',
      rateLimit: body.rateLimit || '',
      bridge: body.bridge || '',
      onlyOne: body.onlyOne || '',
      changeTcpMss: body.changeTcpMss || '',
    });
  }

  @Delete(':session/profiles/:name')
  @RequirePermission('managePppoe')
  async deleteProfile(@Param('session') session: string, @Param('name') name: string) {
    return this.mikrotik.deletePppProfile(session, name);
  }

  // ?? Active connections & pools ???????????????????????????????????
  @Get(':session/active')
  @RequirePermission('viewDashboard')
  async listActive(@Param('session') session: string) {
    const resp = await this.mikrotik.listPppActive(session);
    if (!resp.success) {
      throw new BadRequestException(resp.error || 'Gagal memuat koneksi aktif');
    }
    return resp.connections || [];
  }

  @Post(':session/active/:name/disconnect')
  @RequirePermission('managePppoe')
  async disconnect(@Param('session') session: string, @Param('name') name: string) {
    return this.mikrotik.disconnectPppActive(session, name);
  }

  @Get(':session/pools')
  @RequirePermission('viewDashboard')
  async listPools(@Param('session') session: string) {
    const resp = await this.mikrotik.listPppPools(session);
    if (!resp.success) {
      throw new BadRequestException(resp.error || 'Gagal memuat pool');
    }
    return resp.pools || [];
  }
}