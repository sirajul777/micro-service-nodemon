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
  providers: [AuthService, AuthGrpcClient, ErpGrpcClient, ProxyService, ViewService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SecurityMiddleware).forRoutes('*');
  }
}
