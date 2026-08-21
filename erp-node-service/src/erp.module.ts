import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { VoucherTypeEntity } from './entities/voucher-type.entity';
import { ProfileMetaEntity } from './entities/profile-meta.entity';
import { VoucherBatchEntity } from './entities/voucher-batch.entity';
import { OutboxEventEntity } from './entities/outbox-event.entity';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { AuthGrpcClient } from './auth/auth-grpc.client';
import { MikrotikGrpcClient } from './clients/mikrotik-grpc.client';
import { RedisPublisherService } from './redis/redis-publisher.service';
import { VoucherTypeService } from './voucher-type/voucher-type.service';
import { VoucherTypeController } from './voucher-type/voucher-type.controller';
import { ProfileMetaService } from './profile-meta/profile-meta.service';
import { ProfileMetaController } from './profile-meta/profile-meta.controller';
import { VoucherBatchService } from './voucher-batch/voucher-batch.service';
import { VoucherBatchCreationService } from './voucher-batch/voucher-batch-creation.service';
import { VoucherBatchController } from './voucher-batch/voucher-batch.controller';
import { RouterSessionController } from './router-session/router-session.controller';
import { HotspotController } from './hotspot/hotspot.controller';
import { ReportController } from './report/report.controller';
import { ReportInternalController } from './report/report-internal.controller';
import { VoucherGenerateController } from './voucher-generate/voucher-generate.controller';
import { PppoeController } from './pppoe/pppoe.controller';
import { OutboxService } from './outbox/outbox.service';
import { InternalGrpcModule } from './internal-grpc.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([VoucherTypeEntity, ProfileMetaEntity, VoucherBatchEntity, OutboxEventEntity]),
    HttpModule,
    InternalGrpcModule,
  ],
  controllers: [VoucherTypeController, ProfileMetaController, VoucherBatchController, RouterSessionController, HotspotController, ReportController, ReportInternalController, VoucherGenerateController, PppoeController],
  providers: [
    AuthGrpcClient,
    JwtAuthGuard,
    MikrotikGrpcClient,
    RedisPublisherService,
    OutboxService,
    VoucherBatchCreationService,
    VoucherTypeService,
    ProfileMetaService,
    VoucherBatchService,
  ],
  exports: [VoucherTypeService, ProfileMetaService, VoucherBatchService, MikrotikGrpcClient],
})
export class ErpModule {}
