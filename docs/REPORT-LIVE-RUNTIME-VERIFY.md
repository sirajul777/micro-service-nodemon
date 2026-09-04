# Report / Live Runtime Verification

The report `live` route is implemented through the canonical RouterService contract. The repository still requires deployment-time verification because GitHub source inspection cannot validate the active container/image or a live RouterOS connection.

## Verification sequence

1. Rebuild the canonical report/router service and its consumers together:
   - `mikrotik-go-service`
   - `erp-node-service`
   - `main-node-service`

2. Validate protobuf artifacts are regenerated/copied from the canonical contracts.

3. Run the deployed E2E verification script:

```bash
GATEWAY_PORT=80 ./scripts/verify-e2e.sh
```

4. Verify the runtime endpoint with an authenticated request:

```bash
GET /api/report/<session>/live
```

5. Confirm the response contains `today`, `month`, `currency`, and `isIndo`.

6. If `invalid wire type` occurs after a clean rebuild, inspect the running container image/binary and the active `getSellingRows()` path before changing the protobuf contract.

## Current source facts

- `mikrotik-go-service` exposes the report query over the canonical RouterService contract.
- ERP builds copy the canonical RouterService and ReportRouterService proto files before compiling.
- The ERP report controller uses the ReportRouter client for the live report path.

This document is a runtime verification checklist, not evidence that a live deployment check has already passed.
