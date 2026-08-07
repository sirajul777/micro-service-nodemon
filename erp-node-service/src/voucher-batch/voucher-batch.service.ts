import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  VoucherBatchEntity,
  VoucherItemEntity,
} from '../entities/voucher-batch.entity';
import { ProfileMetaService } from '../profile-meta/profile-meta.service';
import { MikrotikGrpcClient } from '../clients/mikrotik-grpc.client';
import { VoucherBatchPublisherService } from '../redis/voucher-batch-publisher.service';

export interface VoucherItem {
  username: string;
  password: string;
  profile: string;
  comment?: string;
  limitUptime?: string;
  color?: string;
  price?: number;
  caption?: string;
  usedBy?: string;
  usedAt?: string;
  status: 'available' | 'used';
}

export interface VoucherBatch {
  id: string;
  profileName: string;
  profileColor: string;
  price: number;
  totalPrice: number;
  validity: string;
  caption?: string;
  sessionId: string;
  nasName: string;
  createdBy: string;
  createdAt: string;
  resellerId?: string;
  resellerName?: string;
  vouchers: VoucherItem[];
}

/**
 * Voucher batch management. Ported from the monolith's VoucherBatchService.
 *
 * Key change from monolith: MikroTik operations (delete user, sync used,
 * fetch profiles) go through MikrotikGrpcClient → mikrotik-go-service rather
 * than a direct in-process MikrotikService. When the Go service is not yet
 * deployed, gRPC methods return clear errors and the controller surfaces
 * them gracefully.
 */
@Injectable()
export class VoucherBatchService {
  private readonly logger = new Logger(VoucherBatchService.name);

  constructor(
    @InjectRepository(VoucherBatchEntity)
    private readonly batchRepo: Repository<VoucherBatchEntity>,
    private readonly profileMetaSvc: ProfileMetaService,
    private readonly mikrotikGrpc: MikrotikGrpcClient,
    private readonly batchPublisher: VoucherBatchPublisherService,
  ) {}

  private async toModel(e: VoucherBatchEntity): Promise<VoucherBatch> {
    return {
      id: e.id,
      profileName: e.profileName,
      profileColor: e.profileColor || '#1f6feb',
      price: e.price || 0,
      totalPrice: e.totalPrice || 0,
      validity: e.validity || '',
      caption: e.caption || '',
      sessionId: e.sessionId,
      nasName: e.nasName || '',
      createdBy: e.createdBy || '',
      createdAt: e.createdAt,
      resellerId: e.resellerId || '',
      resellerName: e.resellerName || '',
      vouchers: e.vouchers || [],
    };
  }

  async loadAll(sessionId: string): Promise<VoucherBatch[]> {
    const rows = await this.batchRepo.find({ where: { sessionId } });
    const result = [];
    for (const r of rows) result.push(await this.toModel(r));
    return result;
  }

  async getById(sessionId: string, batchId: string): Promise<VoucherBatch | null> {
    const e = await this.batchRepo.findOne({ where: { id: batchId, sessionId } });
    return e ? this.toModel(e) : null;
  }

  /**
   * Save a batch. After persisting, publish `voucher.batch.created` to Redis
   * so mikrotik-go-service can provision the vouchers onto the router.
   */
  async saveBatch(batch: VoucherBatch): Promise<VoucherBatch> {
    let entity = await this.batchRepo.findOne({
      where: { id: batch.id, sessionId: batch.sessionId },
    });
    if (!entity) {
      entity = this.batchRepo.create({
        id: batch.id,
        sessionId: batch.sessionId,
        profileName: batch.profileName,
        profileColor: batch.profileColor || '#1f6feb',
        price: batch.price || 0,
        totalPrice: batch.totalPrice || 0,
        validity: batch.validity || '',
        caption: batch.caption || '',
        nasName: batch.nasName || '',
        createdBy: batch.createdBy || '',
        createdAt: batch.createdAt || new Date().toISOString(),
        resellerId: batch.resellerId || '',
        resellerName: batch.resellerName || '',
        vouchers: batch.vouchers || [],
      });
    } else {
      entity.profileName = batch.profileName;
      entity.profileColor = batch.profileColor || '#1f6feb';
      entity.price = batch.price || 0;
      entity.totalPrice = batch.totalPrice || 0;
      entity.validity = batch.validity || '';
      entity.caption = batch.caption || '';
      entity.nasName = batch.nasName || '';
      entity.createdBy = batch.createdBy || '';
      entity.resellerId = batch.resellerId || '';
      entity.resellerName = batch.resellerName || '';
      entity.vouchers = batch.vouchers || [];
    }
    const saved = await this.batchRepo.save(entity);

    // Best-effort trigger for the Go service to push vouchers to the router.
    await this.batchPublisher.publishBatchCreated({
      batchId: saved.id,
      sessionId: saved.sessionId,
      profileName: saved.profileName,
      vouchers: (saved.vouchers || []).map((v) => ({
        username: v.username,
        password: v.password,
        profile: v.profile,
        limitUptime: v.limitUptime || '',
      })),
    });

    return this.toModel(saved);
  }

  async deleteBatch(sessionId: string, batchId: string): Promise<boolean> {
    const result = await this.batchRepo.delete({ id: batchId, sessionId });
    return (result.affected || 0) > 0;
  }

  async markUsed(
    sessionId: string,
    batchId: string,
    username: string,
    usedBy: string,
  ): Promise<boolean> {
    const batch = await this.batchRepo.findOne({ where: { id: batchId, sessionId } });
    if (!batch) return false;
    const vcr = (batch.vouchers || []).find((v) => v.username === username);
    if (!vcr) return false;
    vcr.status = 'used';
    vcr.usedBy = usedBy;
    vcr.usedAt = new Date().toLocaleString('id-ID');
    await this.batchRepo.save(batch);
    return true;
  }

  getStats(batch: VoucherBatch) {
    const used = batch.vouchers.filter((v) => v.status === 'used').length;
    const total = batch.vouchers.length;
    return {
      total,
      used,
      remaining: total - used,
      usedPct: Math.round((used / total) * 100),
    };
  }

  async readLocalProfileMeta(
    sessionId: string,
  ): Promise<Record<string, { profileColor?: string; caption?: string }>> {
    const all = await this.profileMetaSvc.getAllForSession('hotspot', sessionId);
    const result: Record<string, { profileColor?: string; caption?: string }> = {};
    for (const [name, meta] of Object.entries(all)) {
      result[name] = {
        profileColor: meta.profileColor,
        caption: meta.caption,
      };
    }
    return result;
  }

  // ── MikroTik-backed operations (via gRPC → Go) ──────────────────

  /**
   * Delete a batch, optionally also removing the still-available vouchers
   * from the MikroTik router (via gRPC → Go).
   */
  async deleteWithRouter(
    sessionId: string,
    batchId: string,
    deleteMikrotik: boolean,
  ): Promise<{ success: boolean; deletedFromMikrotik: number; failedFromMikrotik: number; error?: string }> {
    const batch = await this.getById(sessionId, batchId);
    if (!batch) return { success: false, deletedFromMikrotik: 0, failedFromMikrotik: 0, error: 'Batch tidak ditemukan' };

    let deletedFromMikrotik = 0;
    let failedFromMikrotik = 0;

    if (deleteMikrotik) {
      // Verify connectivity first (Go resolves the session credentials).
      const test = await this.mikrotikGrpc.testConnect(sessionId);
      if (!test.success) {
        return {
          success: false,
          deletedFromMikrotik: 0,
          failedFromMikrotik: 0,
          error: `Gagal konek ke router: ${test.error}`,
        };
      }

      for (const vcr of batch.vouchers) {
        if (vcr.status !== 'available') continue;
        const res = await this.mikrotikGrpc.removeHotspotUser(sessionId, vcr.username);
        if (res.success) deletedFromMikrotik++;
        else failedFromMikrotik++;
      }
    }

    const success = await this.deleteBatch(sessionId, batchId);
    return { success, deletedFromMikrotik, failedFromMikrotik };
  }

  /**
   * Fetch all hotspot users from the router (via gRPC → Go) and mark batch
   * vouchers as used when the router says they have a date-comment or traffic.
   */
  async syncUsedFromMikrotik(sessionId: string): Promise<{ success: boolean; updated: number; message?: string }> {
    const batches = await this.loadAll(sessionId);
    if (!batches.length) return { success: true, updated: 0, message: 'Tidak ada batch' };

    const res = await this.mikrotikGrpc.listHotspotUsers({ sessionId });
    if (!res.success) {
      return { success: false, updated: 0, message: res.error || 'Gagal ambil user dari router' };
    }
    const hsMap: Record<string, any> = {};
    for (const u of res.users || []) {
      if (u.name) hsMap[u.name] = u;
    }

    let updated = 0;
    for (const batch of batches) {
      let batchChanged = false;
      for (const vcr of batch.vouchers) {
        if (vcr.status === 'used') continue;
        const hsUser = hsMap[vcr.username];
        if (!hsUser) continue;

        const comment = hsUser.comment || '';
        const hasDateComment =
          /^\w{3}\/\d{2}\/\d{4}/.test(comment) || /^\d{4}-\d{2}-\d{2}/.test(comment);
        const hasTraffic = parseInt(hsUser['bytes-in'] || '0', 10) > 0;

        if (hasDateComment || hasTraffic) {
          vcr.status = 'used';
          vcr.usedBy = 'Hotspot';
          vcr.usedAt = comment || new Date().toLocaleString('id-ID');
          batchChanged = true;
          updated++;
        }
      }
      if (batchChanged) {
        await this.batchRepo.save(batch);
      }
    }
    return { success: true, updated };
  }
}

