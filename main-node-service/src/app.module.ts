import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AppController } from './app.controller';
import { AuthController } from './auth/auth.controller';
import { ProxyController } from './proxy/proxy.controller';
import { HealthController } from './health/health.controller';
import { AuthService } from './auth/auth.service';
import { ProxyService } from './proxy/proxy.service';
import { ViewService } from './view/view.service';

/**
 * Gateway / BFF (Phase 6).
 * Stateless — owns no database. Serves the Eta UI (views/ + public/) and
 * aggregates calls to the downstream domain services (auth, erp, payment,
 * mikrotik) via HTTP/gRPC/Redis. Holds a cookie session that caches the
 * downstream JWT; each request re-validates against auth-service and
 * forwards the bearer token to the target service.
 */
@Module({
  imports: [HttpModule],
  controllers: [AppController, AuthController, ProxyController, HealthController],
  providers: [AuthService, ProxyService, ViewService],
})
export class AppModule {}
