import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuthController } from './auth/auth.controller';
import { ProxyController } from './proxy/proxy.controller';
import { PaymentWebhookController } from './proxy/payment-webhook.controller';
import { SessionController } from './session/session.controller';
import { HealthController } from './health/health.controller';
import { AuthService } from './auth/auth.service';
import { AuthGrpcClient } from './auth/auth-grpc.client';
import { ErpGrpcClient } from './erp/erp-grpc.client';
import { ErpDashboardGrpcClient } from './erp/erp-dashboard-grpc.client';
import { HotspotGrpcClient } from './erp/hotspot-grpc.client';
import { VoucherBatchGrpcClient } from './erp/voucher-batch-grpc.client';
import { VoucherGenerateGrpcClient } from './erp/voucher-generate-grpc.client';
import { VoucherTypeGrpcClient } from './erp/voucher-type-grpc.client';
import { BotGrpcClient } from './bot/bot-grpc.client';
import { ProxyService } from './proxy/proxy.service';
import { ViewService } from './view/view.service';
import { SecurityMiddleware } from './security/security.middleware';

@Module({
  controllers: [
    AppController,
    AuthController,
    SessionController,
    ProxyController,
    PaymentWebhookController,
    HealthController,
  ],
  providers: [
    AuthService,
    AuthGrpcClient,
    ErpGrpcClient,
    ErpDashboardGrpcClient,
    HotspotGrpcClient,
    VoucherBatchGrpcClient,
    VoucherGenerateGrpcClient,
    VoucherTypeGrpcClient,
    BotGrpcClient,
    ProxyService,
    ViewService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SecurityMiddleware).forRoutes('*');
  }
}
