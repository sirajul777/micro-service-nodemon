import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AppController } from './app.controller';
import { AuthController } from './auth/auth.controller';
import { ProxyController } from './proxy/proxy.controller';
import { HealthController } from './health/health.controller';
import { AuthService } from './auth/auth.service';
import { ProxyService } from './proxy/proxy.service';
import { ViewService } from './view/view.service';
import { SecurityMiddleware } from './security/security.middleware';

/**
 * Gateway / BFF (Phase 6/8).
 * Stateless — owns no database. Serves the Eta UI (views/ + public/) and
 * aggregates calls to the downstream domain services (auth, erp, payment,
 * mikrotik) via HTTP/gRPC/Redis. Holds a cookie session that caches the
 * downstream JWT; each request re-validates against auth-service and
 * forwards the bearer token to the target service.
 *
 * Phase 8 hardening: a global SecurityMiddleware adds security headers,
 * correlation-id tracing, and request-latency logging.
 */
@Module({
  imports: [HttpModule],
  controllers: [AppController, AuthController, ProxyController, HealthController],
  providers: [AuthService, ProxyService, ViewService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SecurityMiddleware).forRoutes('*');
  }
}
