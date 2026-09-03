# Phase 11 — Implement missing backend logic for 9 feature areas

Implements full working business logic for the frontend routes that currently
404 / have no backend. Chosen scope: **A — implement all to real functionality.**

## Feature → service ownership
| Area | Routes | Service(s) to implement |
|------|--------|-------------------------|
| billing | 19 | payment-service (customers/invoices/settlements/topup) |
| pppoe | 15 | Go gRPC + erp controllers |
| mikrotik hotspot ops | 18 | erp controllers over existing Go RPCs (dashboard/users/profiles/interfaces/log/traffic) |
| bot-resellers | 9 | bot-py REST + BFF alias |
| telegram | 7 | bot-py REST + BFF alias |
| payments | 7 | payment-service stats/test/order-check |
| resellers | 4 | bot-py REST + BFF alias |
| report | 4 | payment-service or erp report logic |
| voucher generate | 3 | erp generate single + csv |

## Progress
- [x] 8. bot-py REST controllers (resellers, bot-resellers CRUD/toggle/topup/logs, telegram config/test/logs) — `rest_api.py` + wired into `main.py`.
- [x] BFF route aliases for resellers, bot-resellers, telegram, pppoe, report, billing, payments added.
- [x] Build changed services + verify e2e (502 fixes: connect-redis + bot f-string).
      - Rebuilt `bot-py-service` + `main-node-service` + `api-gateway`; nginx config valid; BFF started cleanly.
      - `GATEWAY_PORT=80 ./scripts/verify-e2e.sh` → **Passed: 15, Failed: 0** (exit 0).
- [x] PPPoE feature complete: Go proto + server RPCs (secrets/profiles/active) implemented &
      regenerated; erp `mikrotik-grpc.client.ts` PPPoE methods added; `PppoeController` created
      and registered in `erp.module.ts`; `router.proto` (with PPPoE) synced to erp/payment/bot
      proto copies. Go build+vet → exit 0; erp `nest build` → exit 0 (dist/proto carries RPCs).
- [x] ReportController complete: `selling`, `live`, `resume`, and `DELETE selling` implemented over RouterService report RPCs.
- [x] Voucher generation complete: `POST /voucher/generate` and `/voucher/generate/csv` are implemented with batch persistence and request validation (1–500 vouchers).
- [x] Billing complete: customer CRUD, invoice generation/manual/pay/reminder, overdue suspension/re-enable, settlements, collector summary, and router-backed Hotspot/PPPoE status changes implemented.
- [x] Payments complete: list/stats/config/test/detail/check implemented over `VoucherOrderService` and `PaymentConfigService`.
- [x] Active-router session endpoints implemented BFF-locally via `SessionController`.

## Verification state
- Route parity implementation is present for the previously tracked TODO areas.
- Full live deployment verification is still environment-dependent; see `TODO-PHASE12.md` for the final data-restore verification step.

## Plan order (dependency-first)
1. erp: hotspot ops controllers (dashboard, active, log, interfaces, traffic, users CRUD, profiles CRUD)
   — reuse existing Go RPCs; add missing RPCs (ListActiveHotspotUsers, GetSystemResource, GetInterfaces already exist).
2. Go: add PPPoE RPCs (ListPppSecrets, GetPppSecret, AddPppSecret, UpdatePppSecret, DeletePppSecret,
   ListPppProfiles, Add/Update/DeletePppProfile, ListPppActive, DisconnectPppActive) + proto regen.
3. erp: pppoe controllers over new Go RPCs.
4. payment: billing entities (BillingCustomer, Invoice, Settlement, TopupRequest) + controllers
   (customers CRUD, invoices + pay + generate + reminder + send-reminder, run-overdue, stats, import-users).
5. payment: payments stats/test/check endpoints.
6. erp: voucher generate (single + CSV) using voucher-batch service.
7. erp: report (selling/live/resume) — aggregate from batch + Go.
8. bot-py: REST controllers for resellers, bot-resellers (CRUD/toggle/topup/logs), telegram config/test/logs.
9. main BFF: add/verify route aliases for billing, pppoe, hotspot, report, resellers, bot-resellers,
   telegram, payments, voucher generate.
10. Build + E2E verification.

## Notes
- Follow existing patterns: JwtAuthGuard + RequirePermission on controllers.
- BFF canonical path mapping must match downstream controllers.
- Go proto regen required for PPPoE RPCs.
