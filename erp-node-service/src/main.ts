import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

const PORT = Number(process.env.PORT || 3003);
const GRPC_PORT = Number(process.env.ERP_GRPC_PORT || 50053);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: false }));
  app.enableCors({ origin: true, credentials: true });
  app.enableShutdownHooks();

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'erp.internal',
      protoPath: join(__dirname, '..', 'proto', 'erp_internal.proto'),
      url: `0.0.0.0:${GRPC_PORT}`,
    },
  });

  await app.startAllMicroservices();
  await app.listen(PORT);
  console.log(`[erp-node-service] running on http://localhost:${PORT}`);
  console.log(`[erp-node-service] internal gRPC on 0.0.0.0:${GRPC_PORT}`);
}
bootstrap();
