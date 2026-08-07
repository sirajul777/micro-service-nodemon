# Phase 4 — ERP / Voucher / Report Service (`erp-node-service`)

> Focus: voucher-types + profile-meta + voucher-batch (the ERP core).
> Report module deferred to a follow-up sub-step (needs raw `/system/script` gRPC
> access which the Go proto doesn't expose yet).

## Steps
- [x] 1. Add dependencies (@nestjs/axios, @grpc/grpc-js, @grpc/proto-loader,
        ioredis, class-validator, class-transformer)
- [x] 2. Entities: `voucher_types`, `voucher_batches`, `profile_meta`
- [x] 3. `auth/` — JWT guard + permissions decorator (validate via auth-node-service)
- [x] 4. `clients/mikrotik-grpc.client.ts` — gRPC → Go (TestConnect, ListHotspotUsers,
        RemoveHotspotUser, ListHotspotProfiles)
- [x] 5. `redis/` — RedisPublisher + VoucherBatchPublisher (publish `voucher.batch.created`)
- [x] 6. `voucher-type/` — service + controller (CRUD, toggle, active)
- [x] 7. `profile-meta/` — service + controller (hotspot/pppoe meta)
- [x] 8. `voucher-batch/` — service + controller (CRUD, sync-used, delete w/ router,
        import profiles, publish outbox on save)
- [x] 9. Wire `app.module.ts` (TypeORM db_erp + modules) + `main.ts` (ValidationPipe + CORS)
- [x] 10. Copy `proto/router.proto` for gRPC client; update package.json build scripts
- [x] 11. Build verify (`nest build` → EXIT=0, JS emitted, dist/main.js present)

## Notes / gotchas
- **Stale `tsconfig.tsbuildinfo`** caused Phase 3's silent no-emit build. Deleted the
  stale file and added `*.tsbuildinfo` to `.dockerignore`.
- gRPC calls to `mikrotik-go-service` degrade gracefully (Go not deployed yet
  = clear error, not crash). Callers catch and return `{ success: false, error }`.
- `payment-service`'s `VoucherTypeClient` expects `GET /voucher/types/:id` returning
  either `{ success, data }`, `{ voucherType }`, or the raw entity shape — the ERP
  controller returns the raw entity on success (matches).
- **Router-session resolution**: the monolith's `ConfigService.getDecryptedSession`
  (which resolved router credentials) is now owned by mikrotik-go-service. All router
  ops (delete w/ router, sync-used, import) go through gRPC by `sessionId` — the Go
  service resolves the credentials internally.
- Report module deferred: selling/live/resume need raw `/system/script` access which
  the Go proto doesn't expose yet. Will be a follow-up sub-step.
