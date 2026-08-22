# MikHMon — Microservice Migration Checklist

> Companion to `ARCHITECTURE.md`. Tracks migration work and remaining verification. Keep source-of-truth items aligned with the current codebase.

## Current architecture status

### Frontend
- [x] React/Vite frontend added as the primary admin UI.
- [x] Docker/Nginx serves React at `/` while `/api/*` remains on the BFF.
- [x] Hotspot CRUD migrated to React.
- [x] PPPoE CRUD migrated to React.
- [x] Voucher Batch and Voucher Type CRUD migrated to React.
- [x] Payment and QRIS operations migrated to React.
- [x] Shared search/pagination table controls added.

### Internal service communication
- [x] Main BFF routes migrated internal report/live access through gRPC; legacy HTTP fallback no longer performs internal HTTP calls.
- [x] ERP auth guard validates tokens through AuthService gRPC.
- [x] Payment auth guard validates tokens through AuthService gRPC.
- [x] Bot ERP client migrated from HTTP to ERP gRPC.
- [x] Bot auth validation migrated from HTTP to AuthService gRPC.
- [x] MikroTik Go service remains the RouterOS boundary and exposes Router/Report APIs over gRPC.
- [x] ERP build consumes canonical Router/Report proto contracts from `mikrotik-go-service` and validates wire-level parity during Docker build.

### ETL / PostgreSQL migration
- [x] SQLite migration generator emits runnable PostgreSQL `COPY ... FROM STDIN` files.
- [x] Column order is explicit and validated against `REMAP_*` mappings.
- [x] Missing source columns are skipped so newer PostgreSQL schema fields use defaults/NULL.
- [x] Migration produces `out/migration_row_counts.tsv` for source row counts.
- [x] Restore script performs source-vs-target row-count verification.
- [ ] Final restore verification must still be run against the operator's local `mikhmon.db` and PostgreSQL instance; repository code cannot claim those runtime counts until the command output is available.

## Known remaining engineering work

### Runtime report/live verification
- [ ] Rebuild/recreate `mikrotik-go-service`, `erp-node-service`, and `main-node-service` together after proto-contract changes.
- [ ] Verify `/api/report/<session>/live` returns successfully in the deployed stack.
- [ ] If `invalid wire type` persists after a clean rebuild, inspect the active container image/binary and RouterOS `getSellingRows()` path rather than changing the already-synced protobuf contract speculatively.

### Deployment validation
- [ ] Run `docker compose config` and full build on the deployment host.
- [ ] Run `scripts/verify-e2e.sh` after the latest migration changes.
- [ ] Validate `nginx -t`, Redis-backed session behavior with multiple BFF replicas, and shadow traffic before production cutover.

### Final cutover
- [ ] Shadow traffic / parallel run.
- [ ] Remove monolith-only runtime dependencies and shared SQLite after production verification.
- [ ] Final end-to-end smoke test and rollback rehearsal.
