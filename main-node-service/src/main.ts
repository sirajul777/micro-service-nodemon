import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { resolve } from 'path';
import * as express from 'express';
import { Eta } from 'eta';
import * as RedisStore from 'connect-redis';
import * as Redis from 'ioredis';
import { AppModule } from './app.module';

const session = require('express-session');
const cookieParser = require('cookie-parser');

const PORT = Number(process.env.PORT || 8080);

/**
 * Build the session store.
 * Prefers a shared Redis store (so multiple BFF pods can share sessions);
 * falls back to the in-memory MemoryStore when REDIS_URL is unset (dev).
 */
function buildSessionStore() {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const client = new Redis.default(redisUrl, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
    });
    client.on('error', (e: any) =>
      console.error('[session-redis] error:', e?.message),
    );
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RedisStoreCtor = (RedisStore as any).default || RedisStore;
    return new RedisStoreCtor({ client, prefix: 'mikhmon:ses:' });
  }
  console.warn('[session] REDIS_URL not set — using in-memory MemoryStore (single-instance only)');
  return undefined; // express-session falls back to MemoryStore
}

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
      store: buildSessionStore() as any,
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
  // Behind nginx reverse-proxy — honour X-Forwarded-For / X-Forwarded-Proto.
  app.set('trust proxy', 1);

  app.enableCors({ origin: true, credentials: true });
  app.enableShutdownHooks();

  await app.listen(PORT);
  console.log(`[main-node-service] BFF running on http://localhost:${PORT}`);
}
bootstrap();
