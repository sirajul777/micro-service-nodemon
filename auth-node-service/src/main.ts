import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const PORT = Number(process.env.PORT || 3001);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.enableCors({ origin: true, credentials: true });
  await app.listen(PORT);
  console.log(`[auth-node-service] running on http://localhost:${PORT}`);
}
bootstrap();
