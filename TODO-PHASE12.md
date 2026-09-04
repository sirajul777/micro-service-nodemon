# Phase 12 — Live Cutover & Final Verification

Closes out the remaining live-cutover work for the microservice stack. The runtime stack, live E2E path, Redis event flow, and migration generator are implemented. The repository records the final restore procedure, but the restore result remains environment-dependent until the actual `mikhmon.db` is restored into the target PostgreSQL instance.

## Steps
- [x] 1. Bring up the full stack — `docker compose up -d --build` (gateway, BFF,
       auth, erp, payment, mikrotik-go, bot-py + postgres/redis) and confirm
       every container reports healthy. (9/9 containers Up; postgres + redis healthy)
- [x] 2. Run live E2E — `GATEWAY_PORT=80 ./scripts/verify-e2e.sh` → **15/15 pass**
       (nginx/BFF health, login→session→me, auth-guard, proxied payment-config,
       QRIS webhook, Redis reachability, security headers, rate-limit smoke,
       Sessions CRUD).
- [x] 3. Data migration generator — `scripts/migrate-sqlite-to-pg.sh` emits
       COPY data with SELECT order matching the target column order, handles
       schema drift by omitting source-missing columns, and emits
       `out/migration_row_counts.tsv` with source row counts for every migrated
       table. This fixes the previous silent column-shift risk in
       payment/router/bot migration output.
- [ ] 4. Final data restore verification — run the generator against the actual
       `mikhmon.db` and execute `scripts/restore_from_out.sh`. The restore script
       compares every migrated source row count against the PostgreSQL target
       row count and exits non-zero on any mismatch. This item must stay open
       until that command has been run against the real source DB and target
       PostgreSQL instance.
- [x] 5. Event-flow proof — published a test `payment.order.settled` event to
       the Redis stream; `ms_python_bot` consumer received & dispatched it
       (`[event] payment.order.settled -> {...}` logged). Redis event →
       bot-py voucher-delivery path confirmed end-to-end.
- [x] 6. Cleanup — obsolete migration patch/backup artifacts were removed.
       Repository source changes are tracked in git; the final restore output
       remains environment-specific.

## Current verification command

```bash
bash scripts/migrate-sqlite-to-pg.sh ../nodemon/data/mikhmon.db
./scripts/restore_from_out.sh
```

`restore_from_out.sh` prints `source=<n> target=<n> ✓` for each migrated source
 table and exits with an error if any count differs. It also prints the important
 Payment table counts (`payment_config`, `voucher_orders`, `payhook_callback_logs`).

## Current status

Application code and the tracked route/event verification are complete. The only
remaining Phase 12 checklist item is the environment-specific source SQLite →
PostgreSQL restore verification. It is intentionally not marked complete by
repository changes alone.
