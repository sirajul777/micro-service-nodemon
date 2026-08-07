# ✅ Phase 8 — Optimization & Hardening

Post-migration production hardening of the gateway/BFF and cross-cutting
concerns. Targets the **main-node-service** (BFF) and the **nginx** gateway:
security headers, rate limiting, resilience (circuit breaker + retry),
scalable sessions (Redis store), observability (correlation id + latency
logging), and run configuration docs.

## What changed (main-node-service)

- **[NEW] `src/security/security.middleware.ts`** — global middleware that:
  - sets hardened security headers (CSP, nosniff, X-Frame-Options, HSTS-ready,
    Referrer-Policy, Permissions-Policy, COOP);
  - injects a `X-Request-Id` correlation id (inbound or generated) for
    end-to-end tracing;
  - logs per-request method/url/status/latency, coloured by status class.
- **[EDIT] `src/proxy/proxy.service.ts`** — resilience added to the generic
  downstream proxy:
  - **circuit breaker** per target (trips after 5 consecutive 5xx/failures,
    half-open probe after 15s cool-down) → fails fast instead of hanging;
  - **single retry** for idempotent methods (GET/PUT/DELETE) on transient
    network errors;
  - reduced request timeout 30s → 20s.
- **[EDIT] `src/main.ts`** — sessions now use a **shared Redis store** via
  `connect-redis` + `ioredis` (`REDIS_URL`). Falls back to in-memory
  `MemoryStore` (single-instance only) when `REDIS_URL` unset. Also sets
  `trust proxy` so `X-Forwarded-*` from nginx is honoured.
- **[EDIT] `src/app.module.ts`** — applies `SecurityMiddleware` to all routes.
- **[ADD] deps** — `connect-redis`, `ioredis`.

## What changed (nginx gateway)

- **[EDIT] `nginx/nginx.conf`**
  - rate-limit zones: `api_limit` (30 r/s) and `login_limit` (5 r/m) using
    shared-memory zones;
  - `login_limit` applied to `POST /api/auth/login` to blunt brute-force;
  - security headers added on every response (`nosniff`, `X-Frame-Options`,
    `Referrer-Policy`, `X-XSS-Protection`, `Permissions-Policy`).

## Run config

- **[NEW] `main-node-service/.env.example`** — documents `REDIS_URL`,
  `SESSION_SECRET`, `PORT`, and the downstream service endpoint overrides.

## Verification

- [x] `main-node-service` `npm run build` → EXIT 0 (security middleware +
      circuit-breaker proxy + Redis session store all compile).
- [x] deps `connect-redis` / `ioredis` installed and resolved.

## Deferred (needs live infra)

- [ ] `docker compose up` and confirm shared Redis sessions across multiple
      BFF instances (set `REDIS_URL` in `main-node-service` env).
- [ ] Validate `nginx -t` inside the running nginx container (rate-limit +
      header directives).
- [ ] Dust off the monolith `.patch`-based bugfixes and re-apply to the
      relevant microservice once shadow-traffic testing is done.
- [ ] Add Prometheus `/metrics` (pino/OTel) if tracing needs deepen.

