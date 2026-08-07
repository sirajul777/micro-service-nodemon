import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health/health.controller';
import { ErpModule } from './erp.module';

/**
 * ERP, Voucher & Report service.
 * Owns database `db_erp` (voucher_types, voucher_batches, profile_meta).
 */
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      username: process.env.DB_USER || 'admin_mikrotik',
      password: process.env.DB_PASSWORD || 'super_postgres_password_123',
      database: process.env.DB_NAME || 'db_erp',
      autoLoadEntities: true,
      synchronize: true, // dev only
    }),
    ErpModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

