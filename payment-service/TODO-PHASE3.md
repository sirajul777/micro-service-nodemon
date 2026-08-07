# Phase 3 — Payment & Billing Service (`payment-service`)

> Focus: QRIS GoPay Merchant voucher-payment flow (the payment-service core).
> Billing/reseller entities deferred to a later sub-step.
> Provisioning via gRPC → Go (synchronous); notifications via Redis pub/sub (outbox).

## Steps
- [x] 1. Add dependencies (qrcode, class-validator, class-transformer, @nestjs/axios,
        @grpc/grpc-js, @grpc/proto-loader, ioredis, pg)
- [x] 2. Entities: `payment_config`, `voucher_orders`, `payhook_callback_logs`, `payment_outbox`
- [x] 3. `PaymentConfigService` (persist/mask DB-backed config)
- [x] 4. `QrisService` (dynamic QRIS, CRC16, toDataUrl)
- [x] 5. `VoucherTypeClient` (HTTP → erp) for price/profile lookup (graceful fallback)
- [x] 6. `MikrotikGrpcClient` (gRPC → Go) for `AddHotspotUser`
- [x] 7. `RedisPublisher` + `OutboxService` (outbox pattern)
- [x] 8. `VoucherOrderService` (port with external deps replaced by clients/outbox)
- [x] 9. `VoucherOrderController` (webhook, create, checkout, status, admin ops)
- [x] 10. `PayhookSchedulerService` (expire/prune sweep)
- [x] 11. `PaymentConfigController` (settings CRUD)
- [x] 12. Wire `payment.module.ts` + `app.module.ts` + `main.ts` (rawBody, ValidationPipe, CORS)
- [x] 13. Build verify (`nest build` → EXIT=0, JS emitted, proto copied to dist/proto)

## Notes / gotchas
- **Stale `tsconfig.tsbuildinfo`** caused `nest build`/`tsc` to "succeed" with NO JS
  output (incremental cache thought nothing changed). Fixed by deleting the stale
  `.tsbuildinfo`. The `tsbuildinfo` is excluded from Docker via `.dockerignore`.
- External service contracts are stubbed for now (graceful fallback):
  - Go `mikrotik-go-service` gRPC `AddHotspotUser` (proto loaded at runtime)
  - erp `GET /voucher/types/:id` (HTTP)
  - Redis outbox `payment.order.paid` / `payment.order.settled` (consumed by bot-py)
- This phase focuses on the **QRIS voucher-payment flow**. Midtrans/Duitku gateway
  modules and billing/reseller entities are deferred to later phases.
