import { GrpcMethod } from '@nestjs/microservices';
import { VoucherBatchInternalStore } from './voucher-batch.store';

export class VoucherBatchInternalController {
  constructor(private readonly store: VoucherBatchInternalStore) {}

  @GrpcMethod('ErpInternalService', 'ListVoucherBatches')
  async listVoucherBatches(request: { session: string }) {
    const batches = await this.store.list(request.session);
    return { success: true, batches };
  }

  @GrpcMethod('ErpInternalService', 'GetVoucherBatch')
  async getVoucherBatch(request: { session: string; id: string }) {
    return this.store.get(request.session, request.id);
  }

  @GrpcMethod('ErpInternalService', 'CreateVoucherBatch')
  async createVoucherBatch(request: Record<string, any>) {
    return this.store.create(request);
  }

  @GrpcMethod('ErpInternalService', 'DeleteVoucherBatch')
  async deleteVoucherBatch(request: { session: string; id: string; deleteMikrotik: boolean }) {
    return this.store.remove(request.session, request.id, request.deleteMikrotik);
  }

  @GrpcMethod('ErpInternalService', 'MarkVoucherUsed')
  async markVoucherUsed(request: Record<string, any>) {
    return this.store.markUsed(request);
  }

  @GrpcMethod('ErpInternalService', 'SyncVoucherUsed')
  async syncVoucherUsed(request: { session: string }) {
    return this.store.syncUsed(request.session);
  }

  @GrpcMethod('ErpInternalService', 'AutoSyncVoucherUsed')
  async autoSyncVoucherUsed(request: { session: string }) {
    return this.store.autoSyncUsed(request.session);
  }

  @GrpcMethod('ErpInternalService', 'ListVoucherImportProfiles')
  async listVoucherImportProfiles(request: { session: string }) {
    return this.store.importProfiles(request.session);
  }

  @GrpcMethod('ErpInternalService', 'ImportVoucherProfile')
  async importVoucherProfile(request: Record<string, any>) {
    return this.store.importProfile(request);
  }
}
