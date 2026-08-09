# TODO — Phase 9: Gateway route reconciliation (fix monolith-routed 404s)

Goal: make the frontend's monolith-style `/api/*` calls that have real microservice
backends route correctly through the BFF (session/JWT injection) instead of 404.

## Routes with real backends to wire through the BFF proxy (TARGETS)
- [x] `batches` → erp `/voucher/batches/*`
- [x] `voucher-types` → erp `/voucher/types/*`
- [x] `voucher` → erp `/voucher/*` (for `/api/voucher/:cs/profiles` → `/voucher/batches/:cs/import/profiles`)
- [x] `users` → auth `/api/users`
- [x] `payment` → `/api/payment-config`

## nginx routing fixes
- [x] Route `/api/voucher-types/` through BFF (main_upstream)
- [x] Route `/api/voucher/` through BFF (main_upstream); removed direct-to-erp regex
- [x] Route `/api/users/` through BFF (main_upstream)
- [x] Confirm `/api/batches/` through BFF
- [x] Keep `/payments/*`, `/qris/*`, `/healthz` direct-to-upstream (public)

## Verification
- [ ] Rebuild + restart BFF and nginx
- [ ] `GET /api/voucher-types` returns 401 (auth) not 404
- [ ] `GET /api/voucher/SIWARNET/profiles` returns 401 (auth) not 404
- [ ] `GET /api/users` returns 401 (auth) not 404
- [ ] `GET /api/batches/SIWARNET` returns 401 (auth) not 404
