import { Module } from '@nestjs/common';
import { VoucherBatchInternalController } from './voucher-batch.controller';
import { VoucherBatchInternalStore } from './voucher-batch.store';
import { VoucherBatchService } from '../voucher-batch/voucher-batch.service';
import { MikrotikGrpcClient } from '../clients/mikrotik-grpc.client';

@Module({
  controllers: [VoucherBatchInternalController],
  providers: [VoucherBatchInternalStore, VoucherBatchService, MikrotikGrpcClient],
  exports: [VoucherBatchInternalStore],
})
export class VoucherBatchInternalModule {}
