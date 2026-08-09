# Phase 10 — Grand Finale: Integrated Build Verification, E2E & Cleanup

Companion to `TODO.md`. Closes out the remaining runtime/verification work and
deletes the dev artifacts. The `/api/sessions` feature (the last functional gap
before this phase) is already wired end-to-end across the stack; this phase
**proves** it compiles and runs, then cleans up.

## Steps
- [ ] 1. Build verification — all 6 services compile with the sessions feature:
      - [x] `mikrotik-go-service`: `go build ./...` + `go vet ./...`
      - [x] `erp-node-service`: `npm run build`
      - [x] `main-node-service`: `npm run build`
      - [x] `auth-node-service`: `npm run build`
      - [x] `payment-service`: `npm run build`
      - [x] `bot-py-service`: `python3 -m compileall` on all modules
- [x] 2. `nginx -t` validation — config valid; local check only fails on unresolvable Docker hostnames (not a config error); validated in-container during live step
- [x] 3. Extend `scripts/verify-e2e.sh` with a Sessions feature test section:
      - [x] `GET /api/sessions` (authenticated → 200 / array)
      - [x] `POST /api/sessions` (create)
      - [x] `GET /api/mikrotik/:id/connect/test` (test button)
      - [x] `DELETE /api/sessions/:id`
- [x] 4. Live run — `docker compose build` + `up -d --force-recreate` on the
      3 changed services (erp, main, mikrotik); `scripts/verify-e2e.sh` →
      **15/15 pass** including the new Sessions section (10a–10e).
- [x] 5. Cleanup: removed `.patch` dev artifacts + `backup-*` files
- [x] 6. Update `TODO.md` — Phase 10 section added and marked complete
