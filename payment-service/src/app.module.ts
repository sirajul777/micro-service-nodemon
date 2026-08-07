import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health/health.controller';
import { PaymentModule } from './payment.module';

/**
 * Payment & Billing service.
 * Owns database `db_payment` (payment_config, voucher_orders,
 * payhook_callback_logs, billing_customers, invoices, settlements,
 * resellers, billing topup_requests).
 *
 * Phase 3 wires the QRIS voucher-payment flow (PaymentModule).
 */
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      username: process.env.DB_USER || 'admin_mikrotik',
      password: process.env.DB_PASSWORD || 'super_postgres_password_123',
      database: process.env.DB_NAME || 'db_payment',
      autoLoadEntities: true,
      synchronize: true, // dev only
    }),
    PaymentModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
