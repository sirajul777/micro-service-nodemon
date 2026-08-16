import { Injectable } from '@nestjs/common';
import { VoucherBatchService } from '../voucher-batch/voucher-batch.service';
import { MikrotikGrpcClient } from '../clients/mikrotik-grpc.client';

@Injectable()
export class VoucherBatchInternalStore {
  constructor(
    private readonly batches: VoucherBatchService,
    private readonly mikrotik: MikrotikGrpcClient,
  ) {}

  async list(session: string) {
    const rows = await this.batches.loadAll(session);
    return rows.map((b) => ({ ...b, stats: this.batches.getStats(b) }));
  }

  async get(session: string, id: string) {
    const b = await this.batches.getById(session, id);
    if (!b) return { success: false, error: 'Not found' };
    return { success: true, batch: { ...b, stats: this.batches.getStats(b) } };
  }

  async create(request: any) {
    const body = request.batch || request;
    body.sessionId = request.session || body.sessionId;
    return { success: true, batch: await this.batches.createBatch(body) };
  }

  async remove(session: string, id: string, deleteMikrotik: boolean) {
    return this.batches.deleteWithRouter(session, id, deleteMikrotik);
  }

  async markUsed(request: any) {
    return { success: await this.batches.markUsed(request.session, request.id, request.username, request.usedBy) };
  }

  async syncUsed(session: string) {
    return this.batches.syncUsedFromMikrotik(session);
  }

  async autoSyncUsed(session: string) {
    const batches = await this.batches.loadAll(session);
    if (!batches.length) return { success: true, updated: 0, message: 'Tidak ada batch' };

    const available = new Map<string, { batch: any; voucher: any }>();
    for (const batch of batches) {
      for (const voucher of batch.vouchers) {
        if (voucher.status === 'available') available.set(voucher.username, { batch, voucher });
      }
    }
    if (!available.size) return { success: true, updated: 0, message: 'Tidak ada voucher available' };

    const res = await this.mikrotik.listHotspotUsers({ sessionId: session });
    if (!res.success) return { success: false, updated: 0, error: res.error || 'Gagal ambil user dari router' };

    let updated = 0;
    const changed = new Set<any>();
    for (const hsUser of res.users || []) {
      const found = available.get(hsUser.name || '');
      if (!found) continue;
      const comment = hsUser.comment || '';
      const expired = /^\w{3}\/\d{2}\/\d{4}/.test(comment) || /^\d{4}-\d{2}-\d{2}/.test(comment);
      const bytesIn = parseInt(hsUser['bytes-in'] || '0', 10) > 0;
      if (!expired && !bytesIn) continue;
      found.voucher.status = 'used';
      found.voucher.usedBy = expired ? 'Hotspot (expired)' : 'Hotspot (traffic)';
      found.voucher.usedAt = comment || new Date().toISOString();
      changed.add(found.batch);
      updated++;
    }
    for (const batch of changed) await this.batches.saveBatch(batch);
    return { success: true, updated };
  }

  async importProfiles(session: string) {
    const res = await this.mikrotik.listHotspotProfiles(session);
    if (!res.success) return { success: false, error: res.error || 'Gagal ambil profile dari router' };
    const localMeta = await this.batches.readLocalProfileMeta(session);
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

  async importProfile(request: any) {
    const session = request.session;
    const profileName = request.profileName;
    if (!profileName) return { success: false, error: 'profileName required' };
    const profilesRes = await this.mikrotik.listHotspotProfiles(session);
    if (!profilesRes.success) return { success: false, error: profilesRes.error || 'Gagal ambil profile' };
    const profileData = (profilesRes.profiles || []).find((p: any) => p.name === profileName);
    if (!profileData) return { success: false, error: `Profile "${profileName}" tidak ditemukan di router` };
    const ol = this.parseOnLogin(profileData.on_login || '');
    const localMeta = await this.batches.readLocalProfileMeta(session);
    const loc = localMeta[profileName] || {};
    const usersRes = await this.mikrotik.listHotspotUsers({ sessionId: session, profile: profileName });
    if (!usersRes.success) return { success: false, error: usersRes.error || 'Gagal ambil user' };
    const users = usersRes.users || [];
    const batchId = `IMPORT-${profileName}-${session}`;
    const existingBatch = await this.batches.getById(session, batchId);
    const existing: Record<string, any> = {};
    if (existingBatch) for (const v of existingBatch.vouchers) existing[v.username] = v;
    const vouchers = users.map((u: any) => {
      const comment = u.comment || '';
      const hasDate = /^\w{3}\/\d{2}\/\d{4}/.test(comment) || /^\d{4}-\d{2}-\d{2}/.test(comment);
      const old = existing[u.name];
      return {
        username: u.name,
        password: u.password || '',
        profile: profileName,
        comment,
        limitUptime: u.limit_uptime || ol.validity || '',
        color: loc.profileColor || '#1f6feb',
        price: ol.sprice || ol.price || 0,
        caption: loc.caption || profileName,
        status: hasDate ? 'used' : (old?.status || 'available'),
        usedBy: hasDate ? 'Expired' : (old?.usedBy || ''),
        usedAt: old?.usedAt || '',
      };
    });
    const batch = {
      id: batchId,
      profileName,
      profileColor: loc.profileColor || '#1f6feb',
      price: ol.sprice || ol.price || 0,
      totalPrice: (ol.sprice || ol.price || 0) * vouchers.length,
      validity: ol.validity || '',
      caption: loc.caption || profileName,
      sessionId: session,
      nasName: session,
      createdBy: request.createdBy || 'Import',
      createdAt: existingBatch?.createdAt || new Date().toISOString(),
      vouchers,
    };
    const saved = await this.batches.saveBatch(batch as any);
    const stats = this.batches.getStats(saved);
    return { success: true, profileName, batchId, imported: vouchers.length, available: stats.remaining, used: stats.used };
  }

  private parseOnLogin(onLogin: string) {
    const empty = { expmode: '', price: 0, validity: '', sprice: 0 };
    const match = onLogin?.match(/:put \("([^"]*)"\)/);
    if (!match) return empty;
    const p = match[1].split(',');
    return { expmode: (p[1] || '').trim(), price: parseFloat(p[2]) || 0, validity: (p[3] || '').trim(), sprice: parseFloat(p[4]) || 0 };
  }
}
