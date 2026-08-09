# Phase 11 — Monolith Route Parity (Option A: full backend implementation)

Goal: make every route the monolith frontend (`../nodemon/public/assets/app.js`)
calls work against the microservice stack. The BFF aliases already exist; the
missing piece is the **downstream controllers** that implement the business
logic. This phase implements them.

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
| `POST /api/session/router`, `GET /api/session/active` | ❌ NO ALIAS | — | **TODO #1** |
| `/api/mikrotik/:cs/dashboard\|hotspot/*\|interfaces\|interface/traffic/:if\|log\|scheduler\|dhcp/leases\|system/resource\|connect/test` | mikrotik→erp | erp HotspotController | **TODO #2** |
| `/api/pppoe/:cs/*` (active/secrets/profiles/pools) | pppoe→erp | erp PppoeController | **TODO #3** |
| `/api/report/:cs/selling\|live\|resume\|DELETE` | report→erp | erp ReportController | **TODO #4** |
| `/api/voucher/generate`, `/api/voucher/generate/csv` | voucher→erp | erp VoucherGenerateController | **TODO #5** |
| `/api/billing/:cs/*` (customers/invoices/stats/settlements/run-overdue/import-users) | billing→payment | payment BillingController | **TODO #6** |
| `/api/payments*` (list/stats/config/test/detail/check) | payments→payment | payment PaymentsController | **TODO #7** |

## Implementation steps

### 1. BFF: add `session` target alias
- Add `session: 'erp'` (or handle in BFF locally) for `POST /api/session/router`
  and `GET /api/session/active`.
- These set/read `req.session.activeRouter` — best handled **in the BFF itself**
  (session is available there). Add a `SessionController` in main-node-service.

### 2. ERP: HotspotController (`/mikrotik/:session/*`)
Uses existing Go gRPC RPCs (TestConnect, GetDashboard, ListActiveHotspotUsers,
ListHotspotUsers, AddHotspotUser, RemoveHotspotUser, ListHotspotProfiles,
GetHotspotProfile, GetSystemResource, GetInterfaces).
- `GET /mikrotik/:cs/dashboard` → GetDashboard
- `GET /mikrotik/:cs/hotspot/active` → ListActiveHotspotUsers
- `GET /mikrotik/:cs/hotspot/users` → ListHotspotUsers
- `POST /mikrotik/:cs/hotspot/users` → AddHotspotUser
- `DELETE /mikrotik/:cs/hotspot/users/:name` → RemoveHotspotUser (+ bulk-delete)
- `GET /mikrotik/:cs/hotspot/profiles(/:name)` → List/GetHotspotProfile
- `GET /mikrotik/:cs/interfaces` → GetInterfaces
- `GET /mikrotik/:cs/interface/traffic/:name` → needs new Go RPC or best-effort
- `GET /mikrotik/:cs/hotspot/log`, `scheduler`, `dhcp/leases`, `system/resource`
  → best-effort via existing RPCs / stub

### 3. ERP: PppoeController (`/pppoe/:session/*`)
Requires new Go gRPC RPCs (PPP secrets/profiles/active). Add to proto + Go server:
- ListPppSecrets, GetPppSecret, AddPppSecret, UpdatePppSecret, DeletePppSecret,
  EnablePppSecret, DisablePppSecret
- ListPppProfiles, GetPppProfile, AddPppProfile, UpdatePppProfile, DeletePppProfile
- ListPppActive, DisconnectPppActive, ListPppPools
Then erp PppoeController wraps them.

### 4. ERP: ReportController (`/report/:session/*`)
- `GET /report/:cs/live` — aggregate from voucher batches (today/month income/vouchers)
- `GET /report/:cs/selling` — selling records from batches + reseller filter
- `GET /report/:cs/resume` — daily income summary
- `DELETE /report/:cs/selling` — clear report data

### 5. ERP: VoucherGenerateController (`/voucher/generate*`)
- `POST /voucher/generate` — generate batch of vouchers, save as batch
- `POST /voucher/generate/csv` — generate + return CSV

### 6. Payment: BillingController (`/billing/:session/*`)
Add BillingCustomer, Invoice, Settlement, TopupRequest entities + service.
- customers CRUD, invoices (list/generate/pay/manual/send-reminder),
  run-overdue, re-enable, import-users, settlements, collector profile/summary

### 7. Payment: PaymentsController (`/payments*`)
- list transactions, stats, config (get/save), test, detail, check status
- Reuse existing payment-config + voucher-order services; add a payments
  controller aggregating whatever is available.

### 8. Build + E2E
- Rebuild erp, payment, main, Go (proto regen), bot.
- Extend `verify-e2e.sh` with route-parity smoke tests for each area.
- Verify all pass.

## Notes
- Follow existing patterns: JwtAuthGuard + RequirePermission on controllers.
- BFF canonical path mapping must match downstream controllers.
- Go proto regen required for PPPoE RPCs.
