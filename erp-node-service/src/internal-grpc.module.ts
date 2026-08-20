import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InternalGrpcController } from './internal-grpc.controller';
import { ErpSessionStore } from './internal-grpc.store';
import { MikrotikGrpcClient } from './clients/mikrotik-grpc.client';
import { VoucherBatchInternalController } from './internal-grpc/voucher-batch.controller';
import { VoucherBatchInternalStore } from './internal-grpc/voucher-batch.store';
import { VoucherBatchService } from './voucher-batch/voucher-batch.service';
import { VoucherBatchCreationService } from './voucher-batch/voucher-batch-creation.service';
import { VoucherGenerateInternalController } from './internal-grpc/voucher-generate.controller';
import { PaymentVoucherTypeInternalController } from './internal-grpc/payment-voucher-type.controller';
import { VoucherTypeInternalController } from './internal-grpc/voucher-type.controller';
import { VoucherTypeService } from './voucher-type/voucher-type.service';
import { ProfileMetaService } from './profile-meta/profile-meta.service';
import { VoucherBatchEntity } from './entities/voucher-batch.entity';
import { ProfileMetaEntity } from './entities/profile-meta.entity';
import { VoucherTypeEntity } from './entities/voucher-type.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([VoucherBatchEntity, ProfileMetaEntity, VoucherTypeEntity]),
  ],
  controllers: [],
  providers: [
    InternalGrpcController,
    VoucherBatchInternalController,
    VoucherGenerateInternalController,
    PaymentVoucherTypeInternalController,
    VoucherTypeInternalController,
    ErpSessionStore,
    MikrotikGrpcClient,
    VoucherBatchInternalStore,
    VoucherBatchService,
    VoucherBatchCreationService,
    ProfileMetaService,
    VoucherTypeService,
  ],
  exports: [
    ErpSessionStore,
    VoucherBatchInternalStore,
    InternalGrpcController,
    VoucherBatchInternalController,
    VoucherGenerateInternalController,
    PaymentVoucherTypeInternalController,
    VoucherTypeInternalController,
  ],
})
export class InternalGrpcModule {}
