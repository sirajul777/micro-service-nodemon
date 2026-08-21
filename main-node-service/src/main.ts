import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { resolve } from 'path';
import * as express from 'express';
import { Eta } from 'eta';
import { AppModule } from './app.module';
import { RedisSessionStore } from './redis-session.store';

const session = require('express-session');
const cookieParser = require('cookie-parser');

const PORT = Number(process.env.PORT || 8080);

/**
 * Build the session store.
 * Uses a small native ioredis-backed session adapter so the BFF does not depend
 * on connect-redis / node-redis version-specific APIs.
 */
function buildSessionStore() {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    return new RedisSessionStore({
      url: redisUrl,
      prefix: 'mikhmon:ses:',
    });
  }

  console.warn('[session] REDIS_URL not set — using in-memory MemoryStore (single-instance only)');
  return undefined;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // API responses are dynamic and must not be turned into empty 304 responses
  // by Express conditional GET/ETag handling. Browser caching can otherwise
  // hide the current RouterOS data behind a cached response.
  app.set('etag', false);
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  const viewsDir = resolve(process.cwd(), 'views');

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

  app.useStaticAssets(resolve(process.cwd(), 'public'), { prefix: '/' });

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

  app.use(
    session({
      store: buildSessionStore() as any,
      secret: process.env.SESSION_SECRET || 'mikhmon-bff-secret',
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        maxAge: 1000 * 60 * 60 * 24,
        secure: false,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      },
    }),
  );
  app.set('trust proxy', 1);

  app.enableCors({ origin: true, credentials: true });
  app.enableShutdownHooks();

  await app.listen(PORT);
  console.log(`[main-node-service] BFF running on http://localhost:${PORT}`);
}
bootstrap();
