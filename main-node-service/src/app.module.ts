import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuthController } from './auth/auth.controller';
import { ProxyController } from './proxy/proxy.controller';
import { PaymentWebhookController } from './proxy/payment-webhook.controller';
import { QrisGrpcController } from './payment/qris-grpc.controller';
import { SessionController } from './session/session.controller';
import { HealthController } from './health/health.controller';
import { HotspotGrpcController } from './erp/hotspot-grpc.controller';
import { PppoeGrpcController } from './erp/pppoe-grpc.controller';
import { PppoeWriteController } from './erp/pppoe-write.controller';
import { VoucherBatchGrpcController } from './erp/voucher-batch-grpc.controller';
import { AuthService } from './auth/auth.service';
import { AuthGrpcClient } from './auth/auth-grpc.client';
import { ErpGrpcClient } from './erp/erp-grpc.client';
import { ErpDashboardGrpcClient } from './erp/erp-dashboard-grpc.client';
import { HotspotGrpcClient } from './erp/hotspot-grpc.client';
import { PppoeGrpcClient } from './erp/pppoe-grpc.client';
import { VoucherBatchGrpcClient } from './erp/voucher-batch-grpc.client';
import { VoucherGenerateGrpcClient } from './erp/voucher-generate-grpc.client';
import { VoucherTypeGrpcClient } from './erp/voucher-type-grpc.client';
import { ReportGrpcClient } from './erp/report-grpc.client';
import { BotGrpcClient } from './bot/bot-grpc.client';
import { PaymentGrpcClient } from './payment/payment-grpc.client';
import { HttpProxyFallbackService } from './proxy/http-proxy-fallback.service';
import { ViewService } from './view/view.service';
import { SecurityMiddleware } from './security/security.middleware';

@Module({
  imports: [],
  controllers: [
    AppController,
    AuthController,
    SessionController,
    QrisGrpcController,
    HotspotGrpcController,
    PppoeGrpcController,
    PppoeWriteController,
    VoucherBatchGrpcController,
    PaymentWebhookController,
    ProxyController,
    HealthController,
  ],
  providers: [
    AuthService,
    AuthGrpcClient,
    ErpGrpcClient,
    ErpDashboardGrpcClient,
    HotspotGrpcClient,
    PppoeGrpcClient,
    VoucherBatchGrpcClient,
    VoucherGenerateGrpcClient,
    VoucherTypeGrpcClient,
    ReportGrpcClient,
    BotGrpcClient,
    PaymentGrpcClient,
    HttpProxyFallbackService,
    ViewService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SecurityMiddleware).forRoutes('*');
  }
}
