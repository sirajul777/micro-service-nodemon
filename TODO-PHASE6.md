# ✅ Phase 6 — Gateway / BFF (`main-node-service`)

The monolith's web UI + static assets + auth session handling have been moved
into a standalone NestJS **Gateway / BFF** that aggregates calls to the domain
services. The BFF owns no database.

## What was added

### 1. Views + static assets ported
- Copied the full `views/` tree from `nodemon/` into `main-node-service/views/`
  (layout, index, login, partials/sidebar+topbar, all page sections).
- Copied `public/` (CSS assets + app.js) into `main-node-service/public/`.

### 2. Eta view engine + Express middleware (`src/main.ts`)
- Eta v3 configured with `views/` (same `index.eta` → layout + includes).
- `setBaseViewsDir` / `setViewEngine('eta')`.
- Static assets served from `public/` at `/`.
- JSON/urlencoded body parsing (with `rawBody` capture for webhook HMAC).
- `cookie-parser` + `express-session` cookie-based sessions (1-day, httpOnly,
  lax) — the BFF caches the downstream JWT in the session, so the browser
  never handles a token.

### 3. Rendering the dashboard (`src/app.controller.ts` + `src/view/view.service.ts`)
- `GET /` renders `views/index.eta` with a view-model built from the session.
- `ViewService.baseContext()` supplies `title`, `username`, `userInitials`,
  `pageTitle`, and the authenticated user object.

### 4. Auth proxy (`src/auth/`)
- `AuthService` delegates credential verification to `auth-node-service`
  (`POST /api/auth/login`), stores the returned JWT in the session, and can
  re-validate it each request (`POST /api/auth/validate-token`).
- `AuthController` exposes `POST /api/auth/login`, `POST /api/auth/logout`,
  `GET /api/auth/me`, and `POST /api/auth/change-password` (proxied with the
  session JWT).

### 5. Generic proxy to domain services (`src/proxy/`)
- `ProxyService` forwards any method to a target service (`auth|erp|payment|bot`)
  with the session's Bearer token injected, preserving the downstream status
  code/body.
- `ProxyController` is a catch-all at `/api/:target/:rest*` that:
  - maps `erp|payment|bot` → downstream base URL from `ROUTER` (env-overridable),
  - enforces the BFF session + re-validates the JWT,
  - forwards GET/POST/PUT/PATCH/DELETE with the token,
  - passes through downstream responses.

### 6. Service route table (`src/router.config.ts`)
- `ROUTER.auth|erp|payment|bot|mikrotikGrpc` — default docker service names,
  overridable via env (`AUTH_SERVICE_URL`, `ERP_SERVICE_URL`,
  `PAYMENT_SERVICE_URL`, `BOT_SERVICE_URL`, `MIKROTIK_GRPC_SERVER`).

### 7. Packaged deps
- `package.json` now includes `@nestjs/axios`, `cookie-parser`, `eta`,
  `express-session`; dev types for express/cookie-parser/express-session/node.
- `npm install` (380 pkgs) + `npm run build` → **EXIT 0**, `dist/main.js` emitted.

### 8. nginx route table (`nginx/nginx.conf`)
- `/api/auth/*` → `main-node-service` (BFF session login).
- `/api/erp/*`, `/api/payment/*`, `/api/bot/*` → `main-node-service`
  (BFF aggregate proxy injects the JWT; downstream services stay internal).
- `/`, static, `/qris/`, `/payments/` still served as before (UI → main,
  public payment paths → payment-service).

## Cross-service contract
| BFF endpoint | Downstream |
|---|---|
| `POST /api/auth/login` | auth-node-service `/api/auth/login` → JWT cached in session |
| `GET /api/auth/me` | session (JWT cached) |
| `POST /api/auth/change-password` | auth-node-service `/api/auth/change-password` |
| `/api/erp/*` | erp-node-service (voucher/batch/profile-meta) |
| `/api/payment/*` | payment-service (qris orders/config/stats) |
| `/api/bot/*` | bot-py-service (resellers) |

## Files created/changed
- `main-node-service/src/main.ts` (rewritten — view engine, sessions, body parse)
- `main-node-service/src/app.module.ts` (rewritten — controllers/services)
- `main-node-service/src/app.controller.ts` (new — renders index)
- `main-node-service/src/router.config.ts` (new — downstream endpoints)
- `main-node-service/src/auth/auth.service.ts` (new)
- `main-node-service/src/auth/auth.controller.ts` (new)
- `main-node-service/src/proxy/proxy.service.ts` (new)
- `main-node-service/src/proxy/proxy.controller.ts` (new)
- `main-node-service/src/view/view.service.ts` (new)
- `main-node-service/src/health/health.controller.ts` (updated — added bot URL)
- `main-node-service/package.json` (updated deps)
- `main-node-service/views/**` (copied from `nodemon/`)
- `main-node-service/public/**` (copied from `nodemon/`)
- `nginx/nginx.conf` (auth + aggregate proxy routed to BFF)

## Verification
- [x] `npm install` → EXIT 0
- [x] `npm run build` → EXIT 0 (`dist/main.js` emitted)
- [x] Eta views + static assets present in the service

## Remaining (deferred → Phase 7 cutover)
- Full app.js API-path mapping to the BFF proxy (the frontend still calls the
  monolith's `/api/.../session/...` paths verbatim). Requires per-route
  path-rewrite rules so the UI talks to the BFF without code changes, plus
  wiring each domain route to `erp`/`payment`/`bot`.
- Cookie/session sticky pick — BFF currently uses in-memory MemoryStore; switch
  to `connect-redis` for horizontal scaling.
- Docker smoke test (`docker compose up`) after stubs are dropped in.

