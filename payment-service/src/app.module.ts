import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health/health.controller';
import { PaymentModule } from './payment.module';
import { InternalGrpcModule } from './internal-grpc.module';

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
      synchronize: true,
    }),
    PaymentModule,
    InternalGrpcModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
