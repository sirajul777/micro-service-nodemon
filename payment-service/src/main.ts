import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';

const PORT = Number(process.env.PORT || 3002);
const GRPC_PORT = Number(process.env.INTERNAL_GRPC_PORT || 50054);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(
    express.json({
      limit: '50mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: false }));
  app.enableCors({ origin: true, credentials: true });
  app.enableShutdownHooks();

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'payment.internal',
      protoPath: process.env.PAYMENT_INTERNAL_GRPC_PROTO_PATH || `${process.cwd()}/proto/payment_internal.proto`,
      url: `0.0.0.0:${GRPC_PORT}`,
    },
  });

  await app.startAllMicroservices();
  await app.listen(PORT);
  console.log(`[payment-service] running on http://localhost:${PORT}`);
  console.log(`[payment-service] internal gRPC listening on 0.0.0.0:${GRPC_PORT}`);
}
bootstrap();
