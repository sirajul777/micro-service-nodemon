# MikHMon — Microservice Architecture & Migration Checklist

> **Status:** Planning (Option 4) — this document defines the target architecture and the
> step-by-step migration from the current monolith (`../nodemon/`).
> **Database strategy:** **Separate database per service** (database-per-service pattern).

---

## 1. Current State (Monolith)

The current app `../nodemon/` is a single NestJS process using **one SQLite database**
(`data/mikhmon.db`) with **17 TypeORM entities** and server-rendered Eta views. All modules
communicate through in-process DI (`@Optional()` injection), sharing one DB connection and
one session store.

### Boundary problem today
- `VoucherOrderService` (payment) directly calls `MikrotikService`, `TelegramService`,
  `VoucherTypeService`, `ConfigService`, `PaymentConfigService` — all in-process.
- `RouterSessionEntity` (router credentials) is single-source-of-truth used by every module.
- One DB = one deployment; no independent scaling, no fault isolation, no team separation.

---

## 2. Target Architecture

```
                        ┌─────────────────────────┐
                        │   api-gateway (nginx)   │  :80  (single public entry)
                        │  TLS, rate-limit, JWT   │
                        └───────────┬─────────────┘
                                    │ HTTP / gRPC / WS
        ┌───────────────┬───────────┴──────┬──────────────────┬──────────────┐
        │               │                  │                  │              │
 ┌──────▼──────┐ ┌──────▼──────┐ ┌─────────▼──────┐ ┌─────────▼─────┐ ┌───────▼──────┐
 │ main-node   │ │ auth-node   │ │ erp-node       │ │ payment       │ │ bot-py       │
 │ (Gateway/BFF│ │ (NestJS)    │ │ (NestJS)       │ │ (NestJS)      │ │ (Python)     │
 │  UI + views)│ │ Auth/Users  │ │ Voucher/Report │ │ Fin/Reseller  │ │ TG/WA bot    │
 └──────┬──────┘ └──────┬──────┘ └──────┬───────┘ └──────┬─────────┘ └──────┬──────┘
        │               │               │               │                  │
        │               │               │               │                  │
 ┌──────▼──────┐        │               │               │                  │
 │ mikrotik-go │        │               │               │                  │
 │ (gRPC server│        │               │               │                  │
 │  + Redis)   │        │               │               │                  │
 └─────────────┘        └───────────────┼───────────────┘                  │
                                        │                                  │
                              ┌─────────▼─────────┐               ┌────────▼────────┐
                              │ postgres (×N)     │               │ redis (broker)  │
                              │ one DB per service│               │ cache + events  │
                              └───────────────────┘               └─────────────────┘
```

### Service ownership table

| Service | Language/FW | Own DB | Own entities | Public contract |
|---------|-------------|--------|--------------|-----------------|
| **main-node-service** (Gateway/BFF) | NestJS + Eta | none (stateless) | none | serves UI, proxies/aggregates |
| **auth-node-service** | NestJS + Prisma | `db_auth` | `users`, `app_config`, `mobile_tokens` | REST `/auth/*`, issues JWT |
| **erp-node-service** | NestJS + TypeORM | `db_erp` | `voucher_types`, `voucher_batches`, `profile_meta` | REST `/voucher/*`, `/report/*` |
| **payment-service** | NestJS + TypeORM | `db_payment` | `payment_config`, `voucher_orders`, `payhook_callback_logs`, `billing_customers`, `invoices`, `settlements`, `resellers`, `topup_requests` | REST `/payments/*`, `/api/qris/*` |
| **mikrotik-go-service** | Go + gRPC | `db_router` | `router_sessions` | gRPC `RouterService` (create client, add user, list, etc.) |
| **bot-py-service** | Python | `db_bot` | `bot_resellers`, `topup_logs`, `telegram_configs` | Telegram/WA gateway + Redis consumers |

> **Note:** The current `docker-compose.yml` only declares auth/payment/mikrotik/wa and names
> contexts `./auth-service`, `./wa-service`. It must be updated to add `main-node-service` and
> `erp-node-service`, and to match the actual folder names (`auth-node-service`, `bot-py-service`,
> `mikrotik-go-service`). See §8.

---

## 3. Service Contracts (inter-service communication)

All services talk over the Docker network. Three transport styles:

### 3.1 REST (synchronous, for gateway → domain)
Handled by `main-node-service` (BFF) calling other services. Example endpoints:

| Caller | Target | Method/Path | Purpose |
|--------|--------|-------------|---------|
| BFF | auth | `POST /auth/validate-token` | validate JWT |
| BFF | auth | `POST /auth/login`, `POST /auth/logout` | session |
| BFF | erp | `GET /voucher/types` | list voucher types |
| BFF | erp | `GET /report/:session/selling` | selling report |
| BFF | payment | `GET /api/qris/orders` | order list |
| BFF | payment | `POST /payments/payhook/app-webhook` | payment webhook |
| BFF | mikrotik | gRPC `GetDashboard`, `ListActiveUsers` | router data |

### 3.2 Redis pub/sub (asynchronous, event-driven)
Broker topics (channels) for cross-service events:

| Topic | Producer | Consumers | Payload (key fields) |
|-------|----------|-----------|----------------------|
| `payment.order.paid` | payment-service | bot-py (notify), erp (stock), mikrotik-go (provision) | `{ orderId, uniqueAmount, voucherName, profile }` |
| `payment.order.settled` | payment-service | bot-py (WA/TG delivery) | `{ orderId, username, password, phone }` |
| `payment.failed` | payment-service | bot-py (admin alert) | `{ orderId, reason }` |
| `voucher.batch.created` | erp-service | mikrotik-go (push to router) | `{ batchId, sessionId, vouchers[] }` |
| `mikrotik.user.created` | mikrotik-go | bot-py (confirm) | `{ username, sessionId, ok }` |
| `billing.invoice.overdue` | payment-service | bot-py (reminder) | `{ invoiceId, customerId }` |

### 3.3 gRPC (synchronous, for router control)
`mikrotik-go-service` exposes a gRPC `RouterService`. Protobuf sketch:

```proto
syntax = "proto3";
service RouterService {
  rpc CreateClient(ClientRequest) returns (ClientReply);
  rpc AddHotspotUser(HotspotUserRequest) returns (HotspotUserReply);
  rpc GetDashboard(DashboardRequest) returns (DashboardReply);
  rpc ListActiveUsers(SessionRequest) returns (ActiveUsersReply);
}
```

Other services obtain a router client **by sessionId** (transferred from the mikrotik service
via gRPC) rather than reading credentials directly — credentials stay in `db_router`.

---

## 4. Database-per-Service Schema Split

Each service owns its own Postgres database. The gateway and mikrotik-go also need a
**router-session lookup**; to avoid duplicating credentials, the mikrotik-go service owns
`router_sessions` and exposes a gRPC auth handshake. The gateway keeps only a **session id →
public metadata** cache (name, hotspotName, currency) so it can render the UI without secrets.

### 4.1 `db_auth` (auth-node-service)
```sql
users               (id, username UNIQUE, password, name, role, active, allowedSessions json, permissions json, note)
app_config          (key PK, adminUser, adminPass, currency)
mobile_tokens       (id, token UNIQUE, userId, username, name, role, permissions json, sessionId, expiresAt)
```

### 4.2 `db_erp` (erp-node-service)
```sql
voucher_types       (id, name, price, profile, duration, codeLength, codeFormat, maxPerOrder, userType, active)
voucher_batches     (id, sessionId, profileName, profileColor, price, totalPrice, validity, caption, nasName,
                     createdBy, vouchers json, resellerId, resellerName)
profile_meta        (id, kind, sessionId, profileName, price, validity, profileColor, caption, active)
```

### 4.3 `db_payment` (payment-service)
```sql
payment_config      (singleton key='default': midtrans/duitku creds, QRIS GoPay fields, webhook auth)
voucher_orders      (orderId UNIQUE, voucherTypeId, voucherName, profile, sessionId, price, uniqueCode,
                     uniqueAmount, qrString, qrImage, customerName, phone, status, voucherUsername,
                     voucherPassword, paidAt, expiresAt, note)
payhook_callback_logs (eventId, source, amount, status, matched, matchedOrderId, rawPayload, processedAt)
billing_customers   (id, name, phone, telegramId, address, type, mikrotikUser, sessionId, profile, price, ...)
invoices            (id, customerId, customerName, sessionId, type, mikrotikUser, profile, amount, period, ...)
settlements         (id, collectorId, collectorName, sessionId, amount, status)
resellers           (id, name, phone, address, discount, router)
topup_requests      (id, resellerId, resellerName, telegramId, amount, note, status)
```

### 4.4 `db_router` (mikrotik-go-service)
```sql
router_sessions     (id, name, ip, port, user, password ENC, hotspotName, dnsName, currency, reloadInterval, iface, idleTo, livereport)
```
> Password is **encrypted at rest** (AES-256-GCM) and only decrypted inside the Go service.

### 4.5 `db_bot` (bot-py-service)
```sql
bot_resellers       (id, name, username, telegramId UNIQUE, sessionId, saldo, totalVoucher, totalIncome, status, markup, discount)
topup_logs          (id, reselerId, amount, type, note, by, at, balanceBefore, balanceAfter)
telegram_configs    (id, token, chatId, sessionId, notifSale, notifDaily, dailyTime, botEnabled, allowedUsers json, ...)
```

---

## 5. Cross-cutting concerns

### 5.1 Authentication / Authorization
- **auth-node-service** issues signed **JWTs** (or opaque tokens) on login.
- Every other service validates the JWT via a **shared public key / JWKS** (gateway validates
  sessions; domain services validate permissions via a lightweight guard).
- **Same-origin vs cross-origin:** BFF terminates the Eta session; downstream services only
  accept bearer tokens, never shared cookies.

### 5.2 Secrets
- Router credentials → `db_router`, encrypted at rest, decrypted only in Go.
- Payment gateway keys → `db_payment` (already DB-backed today).
- Use Vault/`.env` per service for infrastructure secrets (JWT secret, DB creds, Redis pass).

### 5.3 Idempotency & consistency
- `voucher_orders.uniqueAmount` matching stays idempotent (already implemented).
- Cross-service settlements use **outbox pattern** on `payment-service` (event table + Redis
  publisher) so a crash between "mark paid" and "publish `payment.order.settled`" doesn't drop
  the notification or voucher provisioning.
- Redis pub/sub is **at-most-once** by default; consumers must be idempotent (natural key:
  `orderId`, `eventId`).

### 5.4 Observability
- Add `pino` structured logging per service + correlation-id header propagated end-to-end.
- Expose `/healthz` and `/metrics` (Prometheus) from every service.
- Nginx logs + tracing (optional Jaeger) later.

---

## 6. Migration Strategy (Monolith → Microservices)

Recommended **strangler-fig** approach — extract one service at a time while the monolith keeps
running. End state: monolith deleted; BFF replaces its UI.

### Phase 0 — Infrastructure (no code logic)
- [ ] Fix `docker-compose.yml` service names/contexts to match real folders.
- [ ] Add `nginx.conf` (reverse proxy + TLS + route table).
- [ ] Add per-service Postgres DBs (init scripts) + Redis with auth.
- [ ] Add local dev `.env` per service.

### Phase 1 — Auth service (lowest risk, fewest deps)
- [ ] Scaffold `auth-node-service` (NestJS + Prisma/TypeORM) with `users`, `app_config`, `mobile_tokens`.
- [ ] Implement `POST /auth/login`, `POST /auth/logout`, `POST /auth/validate-token`, JWT signing.
- [ ] Point BFF login/session to auth-service.
- [ ] Migrate `user-management` module logic.

### Phase 2 — Mikrotik Go service (isolate router I/O)
- [ ] Scaffold Go gRPC server + `router_sessions` table.
- [ ] Port `mikrotik.service.ts` (node-routeros calls) into Go gRPC methods.
- [ ] Implement `CreateClient`, `AddHotspotUser`, `GetDashboard`, `ListActiveUsers`, PPPoE ops.
- [ ] Encrypt router passwords at rest in Go.
- [ ] Expose health + metrics.

### Phase 3 — Payment service (business-critical, self-contained)
- [ ] Scaffold `payment-service` (NestJS + TypeORM) with `db_payment` entities.
- [ ] Port `payment-config.service.ts`, `payment.service.ts`, QRIS/payhook flow
      (`voucher-order.*`, `qris.service.ts`, `payhook-scheduler.service.ts`, `notifier`).
- [ ] Replace direct `MikrotikService`/`TelegramService`/`VoucherTypeService` calls with
      gRPC (→ Go) and Redis events (→ bot) / REST (→ erp).
- [ ] Implement Redis **outbox publisher** on settle.
- [ ] Implement admin verify, stats, callback monitor endpoints.

### Phase 4 — ERP service (voucher + report)
- [ ] Scaffold `erp-node-service` with `db_erp` entities.
- [ ] Port voucher-types, voucher-batch, profile-meta, report modules.
- [ ] Publish `voucher.batch.created` → Go pushes to router.
- [ ] Consume `payment.order.paid` to decrement voucher stock.

### Phase 5 — Bot service (Python)
- [ ] Scaffold `bot-py-service` with `db_bot` entities.
- [ ] Port Telegram/WA sending (uses Redis + gRPC to Go for router ops).
- [ ] Consume `payment.order.settled` → deliver voucher via WA/TG.
- [ ] Port reseller-bot (topup, purchase) logic.

### Phase 6 — Gateway/BFF (main-node)
- [ ] Scaffold `main-node-service` (NestJS + Eta views) — stateless.
- [ ] Move all Eta views + static assets from `nodemon/views` + `nodemon/public`.
- [ ] Replace direct service calls with REST/gRPC/Redis to the services above.
- [ ] Wire auth guard to validate JWT from auth-service.
- [ ] Remove `@Optional()` cross-module injections entirely.

### Phase 7 — Cutover & cleanup
- [ ] Run both monolith and microservices in parallel (shadow traffic) for verification.
- [ ] Migrate live data per table (SQL dumps per DB).
- [ ] Remove monolith, its shared SQLite, and the `.patch` files.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| **Data migration** SQLite → 5 Postgres DBs | Scripted per-entity export/import; dry-run first; work in Phase 7 behind a flag |
| **Event loss** (Redis at-most-once) | Outbox pattern on payment; idempotent consumers keyed by `orderId`/`eventId` |
| **Router credentials** spread | Single owner `db_router`; gRPC handshake; never persisted in BFF |
| **UI breakage** (Eta templates coupled to services) | BFF aggregates; feature-flag each page during migration |
| **Auth mismatch** (cookie session → JWT) | BFF keeps cookie session; downstream only bearer tokens; short transition window |
| **Operational complexity** | Clearly bounded services; docker-compose for dev; K8s later only if needed |

---

## 8. Immediate next steps (before coding)

1. **Update `docker-compose.yml`**:
   - Add `main-node-service` and `erp-node-service`.
   - Rename build contexts: `./auth-node-service`, `./bot-py-service`, `./mikrotik-go-service`.
2. **Create `nginx.conf`** (route table → services).
3. **Add one Postgres DB per service** (init scripts / extra `POSTGRES_DB` per service container).
4. Confirm **transport choices** (this doc proposes REST + Redis pub/sub + gRPC; all are
   already represented in your compose blueprint).
5. Begin **Phase 1 (auth)** as the first code deliverable.

---

*Document generated from analysis of the current monolith (`nodemon/`) data model and the
`mikro_service_nodemon/` docker-compose blueprint.*
