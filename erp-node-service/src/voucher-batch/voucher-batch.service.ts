import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VoucherBatchEntity } from '../entities/voucher-batch.entity';
import { ProfileMetaService } from '../profile-meta/profile-meta.service';
import { MikrotikGrpcClient } from '../clients/mikrotik-grpc.client';
import { VoucherBatchCreationService } from './voucher-batch-creation.service';

export interface VoucherItem {
  username: string; password: string; profile: string; comment?: string; limitUptime?: string;
  color?: string; price?: number; caption?: string; usedBy?: string; usedAt?: string;
  status: 'available' | 'used';
}
export interface VoucherBatch {
  id: string; profileName: string; profileColor: string; price: number; totalPrice: number;
  validity: string; caption?: string; sessionId: string; nasName: string; createdBy: string;
  createdAt: string; resellerId?: string; resellerName?: string; vouchers: VoucherItem[];
}

@Injectable()
export class VoucherBatchService {
  constructor(
    @InjectRepository(VoucherBatchEntity) private readonly batchRepo: Repository<VoucherBatchEntity>,
    private readonly profileMetaSvc: ProfileMetaService,
    private readonly mikrotikGrpc: MikrotikGrpcClient,
    private readonly batchCreation: VoucherBatchCreationService,
  ) {}

  private async toModel(e: VoucherBatchEntity): Promise<VoucherBatch> {
    return { id: e.id, profileName: e.profileName, profileColor: e.profileColor || '#1f6feb', price: e.price || 0,
      totalPrice: e.totalPrice || 0, validity: e.validity || '', caption: e.caption || '', sessionId: e.sessionId,
      nasName: e.nasName || '', createdBy: e.createdBy || '', createdAt: e.createdAt, resellerId: e.resellerId || '',
      resellerName: e.resellerName || '', vouchers: e.vouchers || [] };
  }
  async loadAll(sessionId: string): Promise<VoucherBatch[]> { const rows = await this.batchRepo.find({ where: { sessionId } }); return Promise.all(rows.map((r) => this.toModel(r))); }
  async getById(sessionId: string, batchId: string): Promise<VoucherBatch | null> { const e = await this.batchRepo.findOne({ where: { id: batchId, sessionId } }); return e ? this.toModel(e) : null; }

  async saveBatch(batch: VoucherBatch): Promise<VoucherBatch> {
    let entity = await this.batchRepo.findOne({ where: { id: batch.id, sessionId: batch.sessionId } });
    if (!entity) entity = this.batchRepo.create({ id: batch.id, sessionId: batch.sessionId, profileName: batch.profileName,
      profileColor: batch.profileColor || '#1f6feb', price: batch.price || 0, totalPrice: batch.totalPrice || 0,
      validity: batch.validity || '', caption: batch.caption || '', nasName: batch.nasName || '', createdBy: batch.createdBy || '',
      createdAt: batch.createdAt || new Date().toISOString(), resellerId: batch.resellerId || '', resellerName: batch.resellerName || '', vouchers: batch.vouchers || [] });
    else { entity.profileName = batch.profileName; entity.profileColor = batch.profileColor || '#1f6feb'; entity.price = batch.price || 0;
      entity.totalPrice = batch.totalPrice || 0; entity.validity = batch.validity || ''; entity.caption = batch.caption || '';
      entity.nasName = batch.nasName || ''; entity.createdBy = batch.createdBy || ''; entity.resellerId = batch.resellerId || '';
      entity.resellerName = batch.resellerName || ''; entity.vouchers = batch.vouchers || []; }
    return this.toModel(await this.batchRepo.save(entity));
  }

  async createBatch(batch: VoucherBatch): Promise<VoucherBatch> { return this.batchCreation.create(batch); }
  async deleteBatch(sessionId: string, batchId: string): Promise<boolean> { const result = await this.batchRepo.delete({ id: batchId, sessionId }); return (result.affected || 0) > 0; }

  async markUsed(sessionId: string, batchId: string, username: string, usedBy: string): Promise<boolean> {
    const batch = await this.batchRepo.findOne({ where: { id: batchId, sessionId } }); if (!batch) return false;
    const voucher = (batch.vouchers || []).find((v) => v.username === username); if (!voucher) return false;
    voucher.status = 'used'; voucher.usedBy = usedBy; voucher.usedAt = new Date().toISOString(); await this.batchRepo.save(batch); return true;
  }
  getStats(batch: VoucherBatch) { const used = batch.vouchers.filter((v) => v.status === 'used').length; const total = batch.vouchers.length; return { total, used, remaining: total - used, usedPct: total > 0 ? Math.round((used / total) * 100) : 0 }; }
  async readLocalProfileMeta(sessionId: string): Promise<Record<string, { profileColor?: string; caption?: string }>> {
    const all = await this.profileMetaSvc.getAllForSession('hotspot', sessionId); const result: Record<string, { profileColor?: string; caption?: string }> = {};
    for (const [name, meta] of Object.entries(all)) result[name] = { profileColor: meta.profileColor, caption: meta.caption }; return result;
  }
  async deleteWithRouter(sessionId: string, batchId: string, deleteMikrotik: boolean): Promise<{ success: boolean; deletedFromMikrotik: number; failedFromMikrotik: number; error?: string }> {
    const batch = await this.getById(sessionId, batchId); if (!batch) return { success: false, deletedFromMikrotik: 0, failedFromMikrotik: 0, error: 'Batch tidak ditemukan' };
    let deletedFromMikrotik = 0, failedFromMikrotik = 0;
    if (deleteMikrotik) { const test = await this.mikrotikGrpc.testConnect(sessionId); if (!test.success) return { success: false, deletedFromMikrotik: 0, failedFromMikrotik: 0, error: `Gagal konek ke router: ${test.error}` };
      for (const voucher of batch.vouchers) { if (voucher.status !== 'available') continue; const res = await this.mikrotikGrpc.removeHotspotUser(sessionId, voucher.username); if (res.success) deletedFromMikrotik++; else failedFromMikrotik++; } }
    const success = await this.deleteBatch(sessionId, batchId); return { success, deletedFromMikrotik, failedFromMikrotik };
  }
  async syncUsedFromMikrotik(sessionId: string): Promise<{ success: boolean; updated: number; message?: string }> {
    const batches = await this.loadAll(sessionId); if (!batches.length) return { success: true, updated: 0, message: 'Tidak ada batch' };
    const res = await this.mikrotikGrpc.listHotspotUsers({ sessionId }); if (!res.success) return { success: false, updated: 0, message: res.error || 'Gagal ambil user dari router' };
    const usersByName: Record<string, any> = {}; for (const user of res.users || []) if (user.name) usersByName[user.name] = user; let updated = 0;
    for (const batch of batches) { let changed = false; for (const voucher of batch.vouchers) { if (voucher.status === 'used') continue; const routerUser = usersByName[voucher.username]; if (!routerUser) continue;
        const comment = routerUser.comment || ''; const hasDateComment = /^\w{3}\/\d{2}\/\d{4}/.test(comment) || /^\d{4}-\d{2}-\d{2}/.test(comment); const hasTraffic = parseInt(routerUser['bytes-in'] || '0', 10) > 0;
        if (hasDateComment || hasTraffic) { voucher.status = 'used'; voucher.usedBy = 'Hotspot'; voucher.usedAt = comment || new Date().toISOString(); changed = true; updated++; } }
      if (changed) await this.batchRepo.update({ id: batch.id, sessionId }, { vouchers: batch.vouchers }); }
    return { success: true, updated };
  }
}
