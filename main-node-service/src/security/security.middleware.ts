import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

/**
 * Phase 8 — Security & observability middleware for the BFF.
 *
 *  - Sets hardened security headers (a lightweight helmet equivalent without
 *    pulling in the full helmet dependency).
 *  - Injects a correlation-id (taken from the inbound `X-Request-Id` header
 *    or freshly generated) so logs can be traced end-to-end across services.
 *  - Adds a small latency log line per request for operability.
 */
@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Correlation id for distributed tracing.
    const incoming = req.header('x-request-id');
    const correlationId = incoming || crypto.randomUUID();
    (req as any).correlationId = correlationId;
    res.setHeader('X-Request-Id', correlationId);

    // Security headers.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; font-src 'self' data:; connect-src 'self'",
    );
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

    // Log request latency (only once response finishes).
    const started = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - started;
      const line = `[${correlationId}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`;
      if (res.statusCode >= 500) console.error(line);
      else if (res.statusCode >= 400) console.warn(line);
      else console.log(line);
    });

    next();
  }
}
