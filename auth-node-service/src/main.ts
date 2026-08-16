import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';

const PORT = Number(process.env.PORT || 3001);
const GRPC_PORT = process.env.AUTH_GRPC_PORT || '0.0.0.0:50052';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.enableCors({ origin: true, credentials: true });

  const grpcApp = app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'auth',
      protoPath: `${process.cwd()}/proto/auth.proto`,
      url: GRPC_PORT,
    },
  });

  await app.startAllMicroservices();
  await app.listen(PORT);
  console.log(`[auth-node-service] running on http://localhost:${PORT}`);
  console.log(`[auth-node-service] internal gRPC listening on ${GRPC_PORT}`);
}
bootstrap();
