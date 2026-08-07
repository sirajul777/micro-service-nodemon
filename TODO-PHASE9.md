# Phase 9 — Live Orchestration & End-to-End Verification

Brings the microservice stack together and validates the full flow. This phase
delivers the **orchestration + integration wiring** needed to actually run the
stack, plus the **data cutover** (runnable ETL) and the **verification harness**
for the end-to-end path.

> ⚠️ Docker daemon was not running on the dev machine during this phase, so the
> live `docker compose up` + HTTP smoke test could not be executed here. The
> static wiring, build validation, runnable ETL, and verification harness are
> complete and ready to run once Docker is started.

## Steps Completed

- [x] 1. **Compose integration fix** — `main-node-service` now receives
     `REDIS_URL` (Phase 8 shared Redis session store) and `BOT_SERVICE_URL`
     (bot-py-service), and `depends_on` redis-broker. `docker compose config`
     validates cleanly.
- [x] 2. **Full build chain re-verified** — all 4 Node services (`nest build`),
     Go service (`go build` + `go vet`), and Python bot (`py_compile`) compile
     cleanly. Go gRPC stubs regenerated from `proto/router.proto` and now
     compile against up-to-date grpc/protobuf.
- [x] 3. **Runnable data ETL** — `scripts/migrate-sqlite-to-pg.sh` upgraded from
     CSV-extract to emit **runnable Postgres `COPY ... FROM STDIN` blocks** with
     correct quoted column headers (from `pragma_table_info`), proper `\N` NULL
     handling, and per-service `.sql` files (`db_auth`, `db_erp`, `db_payment`
     ×10 tables, `db_router`, `db_bot`).
- [x] 4. **E2E verification harness** — `scripts/verify-e2e.sh`: nginx/BFF
     health, login→session→me, auth-guard rejection of anonymous protected
     routes, proxied payment-config, QRIS webhook routing, Redis reachability,
     security headers, rate-limit smoke test.
- [x] 5. **Docs** — this file + main `TODO.md` Phase 9 section.

## How to bring the stack up (once Docker is running)

```bash
cd mikro_service_nodemon
cp .env.example .env          # optional: override secrets/ports
docker compose up -d --build
# wait for healthchecks (postgres + redis gate the services)
docker compose ps
```

## How to run E2E verification

```bash
# after the stack is healthy:
GATEWAY_PORT=80 ./scripts/verify-e2e.sh
# or point at the BFF port if not using the nginx gateway:
GATEWAY_PORT=8080 ./scripts/verify-e2e.sh
```

## Data cutover (Phase 7 → Phase 9)

```bash
# 1. Generate runnable COPY files from the monolith SQLite DB
bash scripts/migrate-sqlite-to-pg.sh nodemon/data/mikhmon.db

# 2. After services have created their schemas (first boot of the stack),
#    load each DB's seed file:
psql 'postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432' -d db_auth    -f out/db_auth.sql
psql 'postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432' -d db_erp     -f out/db_erp.sql
psql 'postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432' -d db_payment -f out/db_payment.sql
psql 'postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432' -d db_router  -f out/db_router.sql
psql 'postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432' -d db_bot     -f out/db_bot.sql
```

> Boolean columns come over as SQLite `0/1`. If a target Postgres column is
> `BOOLEAN`, wrap the COPY table with a cast (e.g. a temp table + `UPDATE ... SET
> col = col::int::bool`), or use `CASE`. The emitting script keeps them as-is for
> schema portability.

## Remaining / blocked on Docker

- [ ] Actually run `docker compose up -d --build` and confirm all containers
      healthy.
- [ ] Execute `scripts/verify-e2e.sh` against the live stack and confirm all
      checks pass.
- [ ] Load the generated `out/*.sql` into Postgres and confirm row counts match
      the source SQLite DB.
- [ ] Confirm the Redis `payment.order.*` / `billing.invoice.*` events flow from
      payment-service to bot-py-service (end-to-end notification path).
