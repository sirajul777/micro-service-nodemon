import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';

import { PaymentConfigEntity } from './entities/payment-config.entity';
import { VoucherOrderEntity } from './entities/voucher-order.entity';
import { PayhookCallbackLogEntity } from './entities/payhook-callback-log.entity';
import { PaymentOutboxEntity } from './entities/payment-outbox.entity';

import { PaymentConfigService } from './payment-config.service';
import { PaymentConfigController } from './payment-config.controller';
import { QrisService } from './qris.service';
import { VoucherOrderService } from './voucher-order.service';
import { VoucherOrderController } from './voucher-order.controller';
import { PayhookNotifierService } from './notifier.service';
import { PayhookSchedulerService } from './payhook-scheduler.service';
import { VoucherTypeClient } from './clients/voucher-type.client';
import { MikrotikGrpcClient } from './clients/mikrotik-grpc.client';
import { RedisPublisherService } from './redis/redis-publisher.service';
import { OutboxService } from './redis/outbox.service';

/**
 * Payment & Billing module (Phase 3 — QRIS voucher-payment flow).
 *
 * Cross-service wiring:
 *   - VoucherTypeClient  → HTTP → erp-node-service (voucher catalogue)
 *   - MikrotikGrpcClient → gRPC → mikrotik-go-service (router provisioning)
 *   - OutboxService      → Redis pub/sub → bot-py-service (delivery/notify)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentConfigEntity,
      VoucherOrderEntity,
      PayhookCallbackLogEntity,
      PaymentOutboxEntity,
    ]),
    HttpModule,
  ],
  controllers: [PaymentConfigController, VoucherOrderController],
  providers: [
    PaymentConfigService,
    QrisService,
    VoucherOrderService,
    PayhookNotifierService,
    PayhookSchedulerService,
    VoucherTypeClient,
    MikrotikGrpcClient,
    RedisPublisherService,
    OutboxService,
  ],
  exports: [
    PaymentConfigService,
    VoucherOrderService,
    QrisService,
    OutboxService,
    RedisPublisherService,
  ],
})
export class PaymentModule implements OnModuleInit {
  constructor(private readonly outbox: OutboxService) {}

  onModuleInit() {
    // Start the outbox relay loop (publishes pending events to Redis).
    this.outbox.start();
  }
}
