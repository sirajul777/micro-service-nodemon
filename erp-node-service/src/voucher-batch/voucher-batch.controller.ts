import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { VoucherBatchService, VoucherBatch } from './voucher-batch.service';
import { MikrotikGrpcClient } from '../clients/mikrotik-grpc.client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('voucher/batches')
@UseGuards(JwtAuthGuard)
export class VoucherBatchController {
  constructor(
    private readonly batchService: VoucherBatchService,
    private readonly mikrotikGrpc: MikrotikGrpcClient,
  ) {}

  @Get(':session')
  async getAll(@Param('session') session: string) {
    const batches = await this.batchService.loadAll(session);
    return batches.map((b) => ({ ...b, stats: this.batchService.getStats(b) }));
  }

  @Get(':session/:id')
  async getOne(@Param('session') session: string, @Param('id') id: string) {
    const b = await this.batchService.getById(session, id);
    if (!b) return { error: 'Not found' };
    return { ...b, stats: this.batchService.getStats(b) };
  }

  @Post(':session')
  async create(@Param('session') session: string, @Body() body: VoucherBatch) {
    body.sessionId = session;
    if (!body.id) body.id = `BATCH-${Date.now()}`;
    if (!body.createdAt) body.createdAt = new Date().toISOString();
    return this.batchService.createBatch(body);
  }

  @Delete(':session/:id')
  async delete(
    @Param('session') session: string,
    @Param('id') id: string,
    @Query('deleteMikrotik') deleteMikrotik: string,
  ) {
    return this.batchService.deleteWithRouter(session, id, deleteMikrotik === 'true');
  }

  @Post(':session/:id/mark-used')
  async markUsed(
    @Param('session') session: string,
    @Param('id') id: string,
    @Body() body: { username: string; usedBy: string },
  ) {
    return { success: await this.batchService.markUsed(session, id, body.username, body.usedBy) };
  }

  @Post(':session/sync-used')
  async syncUsedFromMikrotik(@Param('session') session: string) {
    return this.batchService.syncUsedFromMikrotik(session);
  }

  @Post(':session/auto-sync-used')
  async autoSyncUsed(@Param('session') session: string) {
    const batches = await this.batchService.loadAll(session);
    if (!batches.length) return { success: true, updated: 0, message: 'Tidak ada batch' };

    const availableMap: Record<string, { batchIdx: number; vcrIdx: number }> = {};
    batches.forEach((batch, bi) => batch.vouchers.forEach((vcr, vi) => {
      if (vcr.status === 'available') availableMap[vcr.username] = { batchIdx: bi, vcrIdx: vi };
    }));

    if (!Object.keys(availableMap).length) {
      return { success: true, updated: 0, message: 'Tidak ada voucher available' };
    }

    const res = await this.mikrotikGrpc.listHotspotUsers({ sessionId: session });
    if (!res.success) return { success: false, updated: 0, error: res.error || 'Gagal ambil user dari router' };

    let updated = 0;
    const changedBatches = new Set<number>();
    for (const hsUser of res.users || []) {
      const username = hsUser.name || '';
      if (!availableMap[username]) continue;
      const comment = hsUser.comment || '';
      const isExpired = /^\w{3}\/\d{2}\/\d{4}/.test(comment) || /^\d{4}-\d{2}-\d{2}/.test(comment);
      const bytesIn = parseInt(hsUser['bytes-in'] || '0', 10) > 0;
      if (isExpired || bytesIn) {
        const { batchIdx, vcrIdx } = availableMap[username];
        const voucher = batches[batchIdx].vouchers[vcrIdx];
        voucher.status = 'used';
        voucher.usedBy = isExpired ? 'Hotspot (expired)' : 'Hotspot (traffic)';
        voucher.usedAt = comment || new Date().toISOString();
        changedBatches.add(batchIdx);
        updated++;
      }
    }

    // Status synchronization must not publish a provisioning event.
    for (const bi of changedBatches) await this.batchService.saveBatch(batches[bi]);
    return { success: true, updated };
  }

  @Get(':session/import/profiles')
  async getImportProfiles(@Param('session') session: string) {
    const res = await this.mikrotikGrpc.listHotspotProfiles(session);
    if (!res.success) return { success: false, error: res.error || 'Gagal ambil profile dari router' };
    const localMeta = await this.batchService.readLocalProfileMeta(session);
    const profiles = (res.profiles || []).map((p: any) => {
      const ol = this.parseOnLogin(p.on_login || '');
      const loc = localMeta[p.name] || {};
      return {
        name: p.name,
        rateLimit: p.rate_limit || '',
        price: ol.price,
        sprice: ol.sprice,
        validity: ol.validity,
        expmode: ol.expmode,
        profileColor: loc.profileColor || '#1f6feb',
        caption: loc.caption || p.name,
      };
    });
    return { success: true, profiles };
  }

  @Post(':session/import/profile')
  async importOneProfile(@Param('session') session: string, @Body() body: { profileName: string; createdBy?: string }) {
    const profileName = body.profileName;
    if (!profileName) return { success: false, error: 'profileName required' };

    const profilesRes = await this.mikrotikGrpc.listHotspotProfiles(session);
    if (!profilesRes.success) return { success: false, error: profilesRes.error || 'Gagal ambil profile' };
    const profileData = (profilesRes.profiles || []).find((p: any) => p.name === profileName);
    if (!profileData) return { success: false, error: `Profile "${profileName}" tidak ditemukan di router` };

    const ol = this.parseOnLogin(profileData.on_login || '');
    const localMeta = await this.batchService.readLocalProfileMeta(session);
    const loc = localMeta[profileName] || {};
    const usersRes = await this.mikrotikGrpc.listHotspotUsers({ sessionId: session, profile: profileName });
    if (!usersRes.success) return { success: false, error: usersRes.error || 'Gagal ambil user' };

    const users = usersRes.users || [];
    const batchId = `IMPORT-${profileName}-${session}`;
    const existingBatch = await this.batchService.getById(session, batchId);
    const existingVcrMap: Record<string, any> = {};
    if (existingBatch) for (const v of existingBatch.vouchers) existingVcrMap[v.username] = v;

    const vouchers = users.map((u: any) => {
      const comment = u.comment || '';
      const hasDateComment = /^\w{3}\/\d{2}\/\d{4}/.test(comment) || /^\d{4}-\d{2}-\d{2}/.test(comment);
      const existing = existingVcrMap[u.name];
      return {
        username: u.name,
        password: u.password || '',
        profile: profileName,
        comment,
        limitUptime: u.limit_uptime || ol.validity || '',
        color: loc.profileColor || '#1f6feb',
        price: ol.sprice || ol.price || 0,
        caption: loc.caption || profileName,
        status: hasDateComment ? 'used' : (existing?.status || 'available'),
        usedBy: hasDateComment ? 'Expired' : (existing?.usedBy || ''),
        usedAt: existing?.usedAt || '',
      };
    });

    const batch: VoucherBatch = {
      id: batchId,
      profileName,
      profileColor: loc.profileColor || '#1f6feb',
      price: ol.sprice || ol.price || 0,
      totalPrice: (ol.sprice || ol.price || 0) * vouchers.length,
      validity: ol.validity || '',
      caption: loc.caption || profileName,
      sessionId: session,
      nasName: session,
      createdBy: body.createdBy || 'Import',
      createdAt: existingBatch?.createdAt || new Date().toISOString(),
      vouchers,
    };

    // Importing existing router users must never provision them again.
    const saved = await this.batchService.saveBatch(batch);
    const stats = this.batchService.getStats(saved);
    return { success: true, profileName, batchId, imported: vouchers.length, available: stats.remaining, used: stats.used };
  }

  private parseOnLogin(onLogin: string) {
    const empty = { expmode: '', price: 0, validity: '', sprice: 0, lockUser: '' };
    if (!onLogin) return empty;
    const match = onLogin.match(/:put \("([^"]*)"\)/);
    if (!match) return empty;
    const p = match[1].split(',');
    return {
      expmode: (p[1] || '').trim(),
      price: parseFloat(p[2]) || 0,
      validity: (p[3] || '').trim(),
      sprice: parseFloat(p[4]) || 0,
      lockUser: (p[6] || '').trim(),
    };
  }
}
