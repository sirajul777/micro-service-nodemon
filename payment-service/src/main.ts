import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';

const PORT = Number(process.env.PORT || 3002);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Raise JSON limit and stash the raw body on req.rawBody — needed to verify
  // the PayHook webhook HMAC-SHA256 signature, which is computed over the
  // exact raw bytes the app sent (not a re-serialized req.body).
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

  await app.listen(PORT);
  console.log(`[payment-service] running on http://localhost:${PORT}`);
}
bootstrap();
