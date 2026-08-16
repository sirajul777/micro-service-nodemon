import { Module } from '@nestjs/common';
import { InternalGrpcController } from './internal-grpc.controller';
import { ErpSessionStore } from './internal-grpc.store';
import { MikrotikGrpcClient } from './clients/mikrotik-grpc.client';
import { VoucherBatchInternalController } from './internal-grpc/voucher-batch.controller';
import { VoucherBatchInternalStore } from './internal-grpc/voucher-batch.store';
import { VoucherBatchService } from './voucher-batch/voucher-batch.service';
import { VoucherGenerateInternalController } from './internal-grpc/voucher-generate.controller';
import { PaymentVoucherTypeInternalController } from './internal-grpc/payment-voucher-type.controller';
import { VoucherTypeService } from './voucher-type/voucher-type.service';

@Module({
  controllers: [
    InternalGrpcController,
    VoucherBatchInternalController,
    VoucherGenerateInternalController,
    PaymentVoucherTypeInternalController,
  ],
  providers: [
    ErpSessionStore,
    MikrotikGrpcClient,
    VoucherBatchInternalStore,
    VoucherBatchService,
    VoucherTypeService,
  ],
  exports: [ErpSessionStore, VoucherBatchInternalStore],
})
export class InternalGrpcModule {}
