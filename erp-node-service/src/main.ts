import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

const PORT = Number(process.env.PORT || 3003);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: false }));
  app.enableCors({ origin: true, credentials: true });
  app.enableShutdownHooks();
  await app.listen(PORT);
  console.log(`[erp-node-service] running on http://localhost:${PORT}`);
}
bootstrap();

