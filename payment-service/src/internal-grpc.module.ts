import { Module } from '@nestjs/common';
import { InternalGrpcController } from './internal-grpc.controller';

@Module({
  controllers: [InternalGrpcController],
})
export class InternalGrpcModule {}
