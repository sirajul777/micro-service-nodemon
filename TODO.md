# MikHMon — Microservice Migration Checklist

> Companion to `ARCHITECTURE.md`. Tracks all steps needed to convert the monolith
> (`../nodemon/`) into the microservice architecture. Update checkboxes as work progresses.

## Phase 0 — Infrastructure (no business logic)
- [x] Fix `docker-compose.yml` service names & build contexts to match real folders
      (`auth-node-service`, `bot-py-service`, `mikrotik-go-service`, add `main-node-service`, `erp-node-service`)
- [x] Add `nginx.conf` (reverse proxy, TLS, route table to each service)
- [x] Add per-service Postgres databases (init scripts / one `POSTGRES_DB` per service container)
- [x] Add Redis with auth (broker + cache)
- [x] Add local dev `.env.example` (shared env template)
- [x] Scaffold minimal runnable stubs for all 6 services (health checks)
- [x] Verify `docker compose config` resolves all 9 services (EXIT=0)
- [x] Verify Go service compiles (`go build ./...` → EXIT=0)
- [x] Verify Python service compiles (`py_compile` → OK)
- [ ] `docker compose up` — bring up all infra containers healthy (needs Docker running)

## Phase 1 — Auth & User Management (`auth-node-service`)
- [x] Scaffold NestJS + TypeORM; DB `db_auth`
- [x] Entities: `users`, `app_config`, `mobile_user_tokens`
- [x] `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/validate-token`, `POST /api/auth/change-password`
- [x] JWT signing (@nestjs/jwt, shared secret via `JWT_SECRET`)
- [x] Port user-management module (CRUD, permissions, roles, last-admin guard)
- [x] Mobile token flow (`/api/mobile-auth/*`) ported
- [x] Seed default admin (`mikhmon`/`1234`)
- [x] Build verified (`nest build` → EXIT=0)
- [ ] BFF login/session wired to auth-service (Phase 6)

## Phase 2 — MikroTik Control (`mikrotik-go-service`)
- [x] Scaffold Go gRPC server; DB `db_router`
- [x] Entity: `router_sessions` (password encrypted at rest)
- [x] gRPC methods: `AddHotspotUser`, `RemoveHotspotUser`, `GetDashboard`,
      `ListActiveHotspotUsers`, `ListHotspotUsers`, `ListHotspotProfiles`,
      `GetHotspotProfile`, `GetSystemResource`, `GetInterfaces`, `TestConnect`
- [x] Port logic from `mikrotik.service.ts` (node-routeros) → `internal/mikrotik/client.go`
      (RouterOS binary API: login MD5 challenge, length-prefixed frames, sentences)
- [x] Health + metrics endpoints (`:8081/healthz`)
- [x] Redis consumer wired (`voucher.batch.created`) → `internal/redis/consumer.go`
- [x] Postgres store wired (`internal/store/store.go`, `db_router`)
- [x] Build verified (`go build ./...` → EXIT=0) and `go vet` clean
- [ ] PPPoE ops (pppoe.service.ts) — port pending
- [ ] `voucher.batch.created` consumer → actually call `AddHotspotUser` per user (Phase 4 producer)

## Phase 3 — Payment & Billing (`payment-service`)
- [x] Scaffold NestJS + TypeORM; DB `db_payment`
- [x] Entities (QRIS core): `payment_config`, `voucher_orders`, `payhook_callback_logs`, `payment_outbox`
- [x] Port `payment-config.*`, QRIS/payhook flow (`VoucherOrderService`), scheduler, notifier
- [x] Replace direct Mikrotik/Telegram/VoucherType calls with gRPC → Go, Redis outbox → bot, REST → erp
- [x] Implement outbox publisher on settle (`payment.order.paid` / `payment.order.settled`)
- [x] Admin verify / stats / callback monitor endpoints
- [x] Build verified (`nest build` → EXIT=0, JS emitted, proto copied to `dist/proto`)
- [ ] Billing/reseller entities (`billing_customers`, `invoices`, `settlements`,
      `resellers`, `topup_requests`) — deferred to a later sub-step
- [ ] Midtrans/Duitku gateway modules — deferred

## Phase 4 — ERP / Voucher / Report (`erp-node-service`)
- [x] Scaffold NestJS + TypeORM; DB `db_erp`
- [x] Entities: `voucher_types`, `voucher_batches`, `profile_meta`
- [x] Port voucher-types, voucher-batch, profile-meta modules (report deferred)
- [x] Publish `voucher.batch.created` → Go pushes to router (Redis)
- [x] gRPC → Go for router ops (TestConnect, ListHotspotUsers, RemoveHotspotUser, ListHotspotProfiles)
- [x] JWT guard validates via auth-node-service (`POST /auth/validate-token`)
- [x] Build verified (`nest build` → EXIT=0, JS emitted, proto copied to `dist/proto`)
- [ ] Report module (selling/live/resume) — deferred; needs raw `/system/script` gRPC access
- [ ] Consume `payment.order.paid` to decrement voucher stock — pending (event-driven, Phase 7)

## Phase 5 — Bot / Telegram / WA (`bot-py-service`) ✅
- [x] Scaffold Python service; DB `db_bot`
- [x] Models: `BotReseller`, `TopupLog`, `TelegramConfig` (SQLAlchemy, `db.py` + `models.py`)
- [x] `services/reseller_service.py` — CRUD, saldo topup/deduct, topup logs (port of `BotResellerService`)
- [x] `services/tg_config_service.py` — DB-backed telegram configs + in-memory topup-request store
- [x] `services/tg_api.py` — Telegram Bot API client (`sendMessage`, `editMessage`, `answerCallback`, `getUpdates`)
- [x] `services/notifier.py` — WhatsApp voucher delivery (Fonnte/Wablas) with fallback (port of `PayhookNotifierService`)
- [x] `services/redis_consumer.py` — consumes `payment.order.paid/settled/failed`, `billing.invoice.overdue`
- [x] `services/tg_bot.py` — full Telegram long-polling bot: reseller + admin commands, inline flows, topup approve/reject
- [x] `clients/erp_client.py` — HTTP → erp-service for active voucher types
- [x] `clients/mikrotik_grpc.py` — gRPC → Go (degraded gracefully until stubs generated)
- [x] `config.py` — env-driven (Redis, Postgres, health port, cross-service endpoints, WA defaults)
- [x] `main.py` — bootstrap, Redis consumer thread, Telegram bot polling, HTTP health endpoint
- [x] `Dockerfile` — python:3.11-slim, builds and runs
- [x] `requirements.txt` — redis, psycopg2-binary, SQLAlchemy, requests, grpcio(+tools)
- [x] **Verification** — `python3 -m py_compile` on all modules → EXIT=0

## Phase 6 — Gateway / BFF (`main-node-service`) ✅
- [x] Scaffold NestJS + Eta views (stateless)
- [x] Move views + static assets from `nodemon/`
- [x] Replace direct service calls with REST/gRPC/Redis (aggregate proxy)
- [x] Wire auth guard to validate JWT from auth-service (session + validate-token)
- [x] Remove all `@Optional()` cross-module injections (BFF holds no DB; proxy only)
- [ ] Full app.js API-path mapping to the BFF proxy (deferred → Phase 7)
- [ ] In-memory session → Redis store for horizontal scaling (deferred)

## Phase 7 — Cutover & Cleanup
- [ ] Shadow traffic / parallel run (monolith + microservices)
- [ ] Migrate live data per table (SQL dumps per DB)
- [ ] Remove monolith, shared SQLite, `.patch` files
- [ ] Final verification + smoke tests
