import { Module } from '@nestjs/common';
import { InternalGrpcController } from './internal-grpc.controller';
import { ErpSessionStore } from './internal-grpc.store';
import { MikrotikGrpcClient } from './clients/mikrotik-grpc.client';

@Module({
  controllers: [InternalGrpcController],
  providers: [ErpSessionStore, MikrotikGrpcClient],
  exports: [ErpSessionStore],
})
export class InternalGrpcModule {}
