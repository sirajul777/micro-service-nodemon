import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';

import { VoucherTypeEntity } from './entities/voucher-type.entity';
import { ProfileMetaEntity } from './entities/profile-meta.entity';
import { VoucherBatchEntity } from './entities/voucher-batch.entity';

import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { MikrotikGrpcClient } from './clients/mikrotik-grpc.client';
import { RedisPublisherService } from './redis/redis-publisher.service';
import { VoucherBatchPublisherService } from './redis/voucher-batch-publisher.service';

import { VoucherTypeService } from './voucher-type/voucher-type.service';
import { VoucherTypeController } from './voucher-type/voucher-type.controller';
import { ProfileMetaService } from './profile-meta/profile-meta.service';
import { ProfileMetaController } from './profile-meta/profile-meta.controller';
import { VoucherBatchService } from './voucher-batch/voucher-batch.service';
import { VoucherBatchController } from './voucher-batch/voucher-batch.controller';
import { RouterSessionController } from './router-session/router-session.controller';
import { HotspotController } from './hotspot/hotspot.controller';
import { ReportController } from './report/report.controller';
import { VoucherGenerateController } from './voucher-generate/voucher-generate.controller';
import { PppoeController } from './pppoe/pppoe.controller';

/**
 * ERP, Voucher & Report module (Phase 4 — voucher core).
 *
 * Owns database `db_erp`: voucher_types, voucher_batches, profile_meta.
 *
 * Cross-service wiring:
 *   - JwtAuthGuard          → HTTP → auth-node-service (validate-token)
 *   - MikrotikGrpcClient    → gRPC → mikrotik-go-service (router ops)
 *   - RedisPublisher        → Redis pub/sub → mikrotik-go-service (voucher.batch.created)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      VoucherTypeEntity,
      ProfileMetaEntity,
      VoucherBatchEntity,
    ]),
    HttpModule,
  ],
controllers: [
    VoucherTypeController,
    ProfileMetaController,
    VoucherBatchController,
    RouterSessionController,
    HotspotController,
    ReportController,
    VoucherGenerateController,
    PppoeController,
  ],
  providers: [
    JwtAuthGuard,
    MikrotikGrpcClient,
    RedisPublisherService,
    VoucherBatchPublisherService,
    VoucherTypeService,
    ProfileMetaService,
    VoucherBatchService,
  ],
  exports: [
    VoucherTypeService,
    ProfileMetaService,
    VoucherBatchService,
  ],
})
export class ErpModule {}

