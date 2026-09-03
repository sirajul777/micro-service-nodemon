# Phase 11 — Monolith Route Parity (Option A: full backend implementation)

Goal: make every route the monolith frontend (`../nodemon/public/assets/app.js`)
calls work against the microservice stack. The BFF aliases already exist; the
downstream controllers now implement the tracked route areas.

## Route audit (monolith `app.js` → BFF alias → downstream target)

| Frontend call | BFF alias | Downstream | Status |
|---|---|---|---|
| `/api/auth/*` | auth | auth-service | ✅ done |
| `/api/sessions*`, `/api/mikrotik/:id/connect/test` | sessions/mikrotik | erp RouterSessionController | ✅ done |
| `/api/voucher-types*` | voucher-types | erp `/voucher/types*` | ✅ done |
| `/api/batches/*` | batches | erp `/voucher/batches*` | ✅ done |
| `/api/voucher/:cs/profiles` | voucher | erp `/voucher/batches/:cs/import/profiles` | ✅ done |
| `/api/users*` | users | auth `/api/users*` | ✅ done |
| `/api/qris/*` | qris | payment | ✅ done |
| `/api/resellers*`, `/api/bot-resellers*`, `/api/telegram*` | — | bot rest_api.py | ✅ done |
| `/payments/payhook/app-webhook`, `/qris/status/:id` | — | payment / BFF | ✅ done |
| `POST /api/session/router`, `GET /api/session/active` | BFF-local SessionController | main-node-service session | ✅ done |
| `/api/mikrotik/:cs/dashboard\|hotspot/*\|interfaces\|interface/traffic/:if\|log\|scheduler\|dhcp/leases\|system/resource\|connect/test` | mikrotik→erp | erp HotspotController + gRPC clients | ✅ done |
| `/api/pppoe/:cs/*` (active/secrets/profiles/pools) | pppoe→erp | erp PppoeController + Go RouterService | ✅ done |
| `/api/report/:cs/selling\|live\|resume\|DELETE` | report→erp | erp ReportController + Router report RPC | ✅ done |
| `/api/voucher/generate`, `/api/voucher/generate/csv` | voucher→erp | erp VoucherGenerateController | ✅ done |
| `/api/billing/:cs/*` (customers/invoices/stats/settlements/run-overdue/import-users) | billing→payment | payment BillingController + BillingService | ✅ done |
| `/api/payments*` (list/stats/config/test/detail/check) | payments→payment | payment PaymentsController + VoucherOrderService | ✅ done |

## Implementation notes

### Session state
`POST /api/session/router` and `GET /api/session/active` are intentionally BFF-local because the active router is stored in the cookie session.

### ERP router operations
Hotspot, PPPoE, reporting, voucher generation, scheduler, DHCP, interfaces, system-resource, and related routes use the existing Go RouterService / report gRPC contracts. GET endpoints return the response shapes expected by the legacy frontend.

### Billing
Billing entities and service cover customer CRUD, invoice generation/manual creation/payment/reminders, overdue suspension/re-enable, settlements, collector summaries, and route/session scoping. Router import remains an explicit no-op response until a dedicated import workflow is available; the route itself is implemented and does not silently proxy elsewhere.

### Payments
The payments admin surface is backed by QRIS voucher orders and payment configuration, with list/stats/config/test/detail/check endpoints exposed through the BFF.

## Verification state
- Route parity implementation is present for the previously tracked TODO areas.
- Full live deployment verification is still environment-dependent; see `TODO-PHASE12.md` for the final data-restore verification step.

## Build + E2E
The repository should be rebuilt and exercised with:

```bash
docker compose up -d --build
GATEWAY_PORT=80 ./scripts/verify-e2e.sh
```

The final data restore verification remains environment-dependent and requires the actual source `mikhmon.db` and target PostgreSQL instance.

## Notes
- Follow existing patterns: JwtAuthGuard + RequirePermission on controllers.
- BFF canonical path mapping must match downstream controllers.
- Go proto regeneration is required whenever the shared RouterService contract changes.
