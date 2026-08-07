# Phase 9 E2E — Fix 502 Bad Gateway (crash-looping services)

## Root cause
nginx returned 502 on every BFF-routed path (`/api/auth/*`, `/api/erp/*`) because
`ms_nestjs_main` (the BFF) was crash-looping. `/healthz` passed because it is
nginx's own location. Two services were crashing:

1. **main-node-service**: `connect-redis` v10 exports `RedisStore` as a named
   export (no `.default`), so `new RedisStoreCtor(...)` threw
   `TypeError: RedisStoreCtor is not a constructor`.
2. **bot-py-service**: Python 3.11 f-string backslash-in-expression syntax error.

## Steps
- [x] Fix `main-node-service/src/main.ts` connect-redis import (access `.RedisStore`).
- [x] Fix `main-node-service/src/main.ts` session store client: ioredis → node-redis `createClient` (connect-redis v10 incompatibility).
- [x] Fix `bot-py-service/services/tg_bot.py` f-string backslash (precompute note line).
- [x] Rebuild (`--no-cache`) & restart main-node-service; restart bot-py-service.
- [x] Confirm both containers are `Up` (not Restarting).
- [x] Restart nginx to clear stale upstream DNS/IP cache after main container recreation.
- [x] Fix `main-node-service/src/proxy/proxy.controller.ts` payment target canonical path (`/api/payment/*` → `/api/*`).
- [x] Fix `scripts/verify-e2e.sh` (me key, REDIS_PASSWORD default) and `nginx/nginx.conf` (security headers on /healthz).
- [x] Run `GATEWAY_PORT=80 ./scripts/verify-e2e.sh` — **Passed: 10, Failed: 0**.
</content>
