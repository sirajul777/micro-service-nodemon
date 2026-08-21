# Phase 12 — Live Cutover & Final Verification

Closes out the remaining live-cutover work for the microservice stack. The runtime stack, live E2E path, Redis event flow, and migration generator are now implemented. Final database row-count verification remains environment-dependent because the source SQLite database must be available where the restore is performed.

## Steps
- [x] 1. Bring up the full stack — `docker compose up -d --build` (gateway, BFF,
       auth, erp, payment, mikrotik-go, bot-py + postgres/redis) and confirm
       every container reports healthy. (9/9 containers Up; postgres + redis healthy)
- [x] 2. Run live E2E — `GATEWAY_PORT=80 ./scripts/verify-e2e.sh` → **15/15 pass**
       (nginx/BFF health, login→session→me, auth-guard, proxied payment-config,
       QRIS webhook, Redis reachability, security headers, rate-limit smoke,
       Sessions CRUD).
- [x] 3. Data migration generator — `scripts/migrate-sqlite-to-pg.sh` now emits
       COPY data with SELECT order matching the target column order, handles
       schema drift by omitting source-missing columns, and fails clearly when
       required source data is unavailable. This fixes the previous silent
       column-shift risk in payment/router/bot migration output.
- [ ] 4. Final data restore verification — run the generator against the actual
       `mikhmon.db`, execute `scripts/restore_from_out.sh`, then compare row
       counts and representative payment rows between SQLite and PostgreSQL.
       The current repository state cannot claim this step complete without the
       source DB and running PostgreSQL instance in the execution environment.
- [x] 5. Event-flow proof — published a test `payment.order.settled` event to
       the Redis stream; `ms_python_bot` consumer received & dispatched it
       (`[event] payment.order.settled -> {...}` logged). Redis event →
       bot-py voucher-delivery path confirmed end-to-end.
- [x] 6. Cleanup — removed obsolete patch/backup artifacts from the migration
       work. Repository working tree is expected to remain clean after the
       final verification step.

## Current verification command

```bash
bash scripts/migrate-sqlite-to-pg.sh ../nodemon/data/mikhmon.db
./scripts/restore_from_out.sh
```

Then verify the payment database with:

```sql
SELECT COUNT(*) FROM payment_config;
SELECT COUNT(*) FROM voucher_orders;
SELECT COUNT(*) FROM payhook_callback_logs;
```
