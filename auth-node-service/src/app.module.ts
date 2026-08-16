import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { HealthController } from './health/health.controller';

import { UserEntity } from './entities/user.entity';
import { AppConfigEntity } from './entities/app-config.entity';
import { MobileTokenEntity } from './entities/mobile-token.entity';

import { UserService } from './user/user.service';
import { UserController } from './user/user.controller';
import { ConfigService } from './config/config.service';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { MobileTokenService } from './mobile/mobile-token.service';
import { MobileAuthController } from './mobile/mobile-auth.controller';
import { SeedService } from './database/seed.service';
import { InternalGrpcController } from './internal-grpc.controller';

/**
 * Auth & User Management service.
 * Owns database `db_auth` (users, app_config, mobile_user_tokens).
 */
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      username: process.env.DB_USER || 'admin_mikrotik',
      password: process.env.DB_PASSWORD || 'super_postgres_password_123',
      database: process.env.DB_NAME || 'db_auth',
      autoLoadEntities: true,
      synchronize: true,
    }),
    TypeOrmModule.forFeature([UserEntity, AppConfigEntity, MobileTokenEntity]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'kunci_rahasia_auth_identity_provider_999',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [
    HealthController,
    AuthController,
    UserController,
    MobileAuthController,
    InternalGrpcController,
  ],
  providers: [
    UserService,
    ConfigService,
    AuthService,
    JwtAuthGuard,
    MobileTokenService,
    SeedService,
  ],
})
export class AppModule {}
