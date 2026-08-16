import { Module } from '@nestjs/common';
import { InternalGrpcController } from './internal-grpc.controller';
import { ErpSessionStore } from './internal-grpc.store';
import { MikrotikGrpcClient } from './clients/mikrotik-grpc.client';
import { VoucherBatchInternalController } from './internal-grpc/voucher-batch.controller';
import { VoucherBatchInternalStore } from './internal-grpc/voucher-batch.store';
import { VoucherBatchService } from './voucher-batch/voucher-batch.service';

@Module({
  controllers: [InternalGrpcController, VoucherBatchInternalController],
  providers: [ErpSessionStore, MikrotikGrpcClient, VoucherBatchInternalStore, VoucherBatchService],
  exports: [ErpSessionStore, VoucherBatchInternalStore],
})
export class InternalGrpcModule {}
