import { Module } from '@nestjs/common';
import { InternalGrpcController } from './internal-grpc.controller';
import { PaymentModule } from './payment.module';

@Module({
  imports: [PaymentModule],
  controllers: [InternalGrpcController],
})
export class InternalGrpcModule {}
