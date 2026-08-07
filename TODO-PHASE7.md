# ✅ Phase 7 — Cutover & Cleanup (in progress)

The microservice stack is fully scaffolded, all six services build, and the
monolith-to-Postgres data path is tooled. Remaining work is the live cutover
(needs Docker running + a maintenance window).

## Done & verified

### 1. All 6 services build cleanly
| Service | Language | Build check | Result |
|---------|----------|-------------|--------|
| `auth-node-service` | NestJS/TS | `npm run build` | EXIT 0 |
| `erp-node-service` | NestJS/TS | `npm run build` (incl. copy:proto) | EXIT 0 |
| `payment-service` | NestJS/TS | `npm run build` (incl. copy:proto) | EXIT 0 |
| `main-node-service` | NestJS/TS (BFF) | `npm run build` | EXIT 0 |
| `mikrotik-go-service` | Go | `go build ./...` | OK |
| `bot-py-service` | Python | `python3 -m py_compile *.py services/*.py clients/*.py` | OK |

### 2. SQLite → Postgres seed extractor
- `scripts/migrate-sqlite-to-pg.sh` reads `nodemon/data/mikhmon.db` and emits one
  file per service DB:
  - `out/db_auth.sql`    → users, app_config, mobile_user_tokens
  - `out/db_erp.sql`     → voucher_types, voucher_batches, profile_meta
  - `out/db_payment.sql` → payment_config, voucher_orders, payhook_callback_logs,
    payhook_payment_transactions, midtrans_payment_transactions,
    payment_transactions, billing_customers, invoices, settlements, topup_requests
  - `out/db_router.sql`  → router_sessions
  - `out/db_bot.sql`     → bot_resellers, bot_topup_logs, telegram_configs

### 3. Row-preservation check
Confirmed the admin user (`USR-ADMIN,mikhmon,...`, bcrypt hash + permissions)
extracts correctly. Current live DB is small: 1 user, 1 payment_config row;
the transaction/voucher tables are empty, so the cutover is low-risk.

### 4. Compose config valid
`docker compose config --quiet` exits 0 — all 9 services resolve on the
`net-mikrotik-cluster` network with correct build contexts.

## Remaining (requires running infra / a maintenance window)

- [ ] `docker compose up` smoke test — verify nginx → BFF → auth/erp/payment
      health, and BFF login proxies a JWT to `auth-node-service`.
- [ ] Shadow traffic / parallel run — run microservices beside the monolith,
      compare behaviour on the QRIS flow before freezing the monolith.
- [ ] Full ETL — wrap the CSV extracts into per-entity `COPY`/`INSERT` matching
      each service's exact TypeORM/SQLAlchemy schema (booleans, uuid PKs,
      timestamps). `annotate` the emitted CSVs against the entity columns.
- [ ] Load seeds into Postgres (`psql ... -d db_x -f out/db_x.sql`) after
      services have auto-created their schema.
- [ ] Remove the monolith (`nodemon/`), shared SQLite (`data/mikhmon.db`), and
      the `.patch` files.
- [ ] Final end-to-end verification (login → dashboard → voucher sale → QRIS
      webhook → voucher delivery) plus smoke tests.

## Cutover checklist
1. Back up `nodemon/data/mikhmon.db`.
2. `docker compose up -d` → wait for postgres + all services healthy.
3. Run `scripts/migrate-sqlite-to-pg.sh` → load seeds into each DB.
4. Test BFF login (`mikhmon` / existing password) → dashboard renders.
5. Exercise the QRIS purchase flow end-to-end.
6. Freeze the monolith, migrate remaining live deltas, then delete it.
