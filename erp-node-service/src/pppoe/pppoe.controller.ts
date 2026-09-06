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
 */
@Controller('pppoe')
@UseGuards(JwtAuthGuard)
export class PppoeController {
  constructor(private readonly mikrotik: MikrotikGrpcClient) {}

  @Get(':session/secrets')
  @RequirePermission('viewDashboard')
  async listSecrets(@Param('session') session: string, @Query('profile') profile?: string, @Query('name') name?: string) {
    const resp = await this.mikrotik.listPppSecrets(session, profile, name);
    if (!resp.success) throw new BadRequestException(resp.error || 'Gagal memuat secret');
    return resp.secrets || [];
  }

  @Get(':session/secrets/:name')
  @RequirePermission('viewDashboard')
  async getSecret(@Param('session') session: string, @Param('name') name: string) {
    const resp = await this.mikrotik.getPppSecret(session, name);
    if (!resp.success) throw new BadRequestException(resp.error || 'Secret tidak ditemukan');
    return resp.secret || null;
  }

  @Post(':session/secrets')
  @RequirePermission('managePppoe')
  async addSecret(@Param('session') session: string, @Body() body: { name: string; password?: string; service?: string; profile?: string; localAddress?: string; remoteAddress?: string; comment?: string; }) {
    if (!body.name) return { success: false, error: 'name wajib diisi' };
    return this.mikrotik.addPppSecret({ sessionId: session, name: body.name, password: body.password || '', service: body.service || '', profile: body.profile || '', localAddress: body.localAddress || '', remoteAddress: body.remoteAddress || '', comment: body.comment || '' });
  }

  @Put(':session/secrets/:name')
  @RequirePermission('managePppoe')
  async updateSecret(@Param('session') session: string, @Param('name') name: string, @Body() body: { password?: string; service?: string; profile?: string; localAddress?: string; remoteAddress?: string; comment?: string; }) {
    return this.mikrotik.updatePppSecret({ sessionId: session, name, password: body.password || '', service: body.service || '', profile: body.profile || '', localAddress: body.localAddress || '', remoteAddress: body.remoteAddress || '', comment: body.comment || '' });
  }

  @Delete(':session/secrets/:name')
  @RequirePermission('managePppoe')
  async deleteSecret(@Param('session') session: string, @Param('name') name: string) { return this.mikrotik.deletePppSecret(session, name); }

  @Patch(':session/secrets/:name/enable')
  @RequirePermission('managePppoe')
  async enableSecret(@Param('session') session: string, @Param('name') name: string) { return this.mikrotik.enablePppSecret(session, name); }

  @Patch(':session/secrets/:name/disable')
  @RequirePermission('managePppoe')
  async disableSecret(@Param('session') session: string, @Param('name') name: string) { return this.mikrotik.disablePppSecret(session, name); }

  @Get(':session/profiles')
  @RequirePermission('viewDashboard')
  async listProfiles(@Param('session') session: string) {
    const resp = await this.mikrotik.listPppProfiles(session);
    if (!resp.success) throw new BadRequestException(resp.error || 'Gagal memuat profile');
    return resp.profiles || [];
  }

  @Post(':session/profiles')
  @RequirePermission('managePppoe')
  async addProfile(@Param('session') session: string, @Body() body: { name: string; localAddress?: string; remoteAddress?: string; dns?: string; rateLimit?: string; bridge?: string; onlyOne?: string; changeTcpMss?: string; }) {
    if (!body.name) return { success: false, error: 'name wajib diisi' };
    return this.mikrotik.addPppProfile({ sessionId: session, name: body.name, localAddress: body.localAddress || '', remoteAddress: body.remoteAddress || '', dns: body.dns || '', rateLimit: body.rateLimit || '', bridge: body.bridge || '', onlyOne: body.onlyOne || '', changeTcpMss: body.changeTcpMss || '' });
  }

  @Put(':session/profiles/:name')
  @RequirePermission('managePppoe')
  async updateProfile(@Param('session') session: string, @Param('name') name: string, @Body() body: { localAddress?: string; remoteAddress?: string; dns?: string; rateLimit?: string; bridge?: string; onlyOne?: string; changeTcpMss?: string; }) {
    return this.mikrotik.updatePppProfile({ sessionId: session, name, localAddress: body.localAddress || '', remoteAddress: body.remoteAddress || '', dns: body.dns || '', rateLimit: body.rateLimit || '', bridge: body.bridge || '', onlyOne: body.onlyOne || '', changeTcpMss: body.changeTcpMss || '' });
  }

  @Delete(':session/profiles/:name')
  @RequirePermission('managePppoe')
  async deleteProfile(@Param('session') session: string, @Param('name') name: string) { return this.mikrotik.deletePppProfile(session, name); }

  @Get(':session/active')
  @RequirePermission('viewDashboard')
  async listActive(@Param('session') session: string) {
    const resp = await this.mikrotik.listPppActive(session);
    if (!resp.success) throw new BadRequestException(resp.error || 'Gagal memuat koneksi aktif');
    return resp.connections || [];
  }

  @Post(':session/active/:name/disconnect')
  @RequirePermission('managePppoe')
  async disconnect(@Param('session') session: string, @Param('name') name: string) { return this.mikrotik.disconnectPppActive(session, name); }

  @Get(':session/pools')
  @RequirePermission('viewDashboard')
  async listPools(@Param('session') session: string) {
    const resp = await this.mikrotik.listPppPools(session);
    if (!resp.success) throw new BadRequestException(resp.error || 'Gagal memuat pool');
    return resp.pools || [];
  }
}
