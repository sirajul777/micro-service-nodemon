# Payment reliability notes

## Current guarantees

- PayHook callbacks use `event_id` as a unique idempotency key when supplied.
- Voucher settlement atomically claims an order (`pending` → `processing`) before router provisioning.
- Paid settlement and `payment.order.settled` / `payment.order.paid` outbox rows are committed in the same transaction.
- Redis Streams consumers only acknowledge (`XACK`) events after the handler reports success; failed handlers remain pending for retry.

## Operational caveat

The QRIS webhook endpoint can still receive a valid payment for an order that has already expired. Such a callback is recorded as unmatched because matching is restricted to non-expired pending orders. Manual verification is then required after the payment/order is reconciled.
