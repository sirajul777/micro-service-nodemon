import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join, resolve } from 'path';
import * as session from 'express-session';
import * as cookieParser from 'cookie-parser';
import * as express from 'express';
import { Eta } from 'eta';
import { AppModule } from './app.module';

const PORT = Number(process.env.PORT || 8080);

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const viewsDir = resolve(process.cwd(), 'views');

  // 1. Eta v3 view engine (mirrors the monolith's main.ts).
  const eta = new Eta({ views: viewsDir, cache: false });
  app.engine('eta', (path: string, opts: any, callback: any) => {
    try {
      const templateName = path.replace(viewsDir, '').replace(/^[\\/]/, '');
      const rendered = eta.render(templateName, opts);
      callback(null, rendered);
    } catch (err) {
      callback(err);
    }
  });
  app.setBaseViewsDir(viewsDir);
  app.setViewEngine('eta');

  // Static assets (CSS/JS) — ported from the monolith in Phase 6.
  app.useStaticAssets(resolve(process.cwd(), 'public'), { prefix: '/' });

  // Body parsing (capture rawBody for downstream webhook HMAC verification).
  app.use(
    express.json({
      limit: '50mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.use(cookieParser());

  // Cookie-based session that stores the downstream JWT after login.
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'mikhmon-bff-secret',
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 1 day
        secure: false,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      },
    }),
  );

  app.enableCors({ origin: true, credentials: true });
  app.enableShutdownHooks();

  await app.listen(PORT);
  console.log(`[main-node-service] BFF running on http://localhost:${PORT}`);
}
bootstrap();
