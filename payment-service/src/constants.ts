/**
 * Cross-service Redis pub/sub topics (broker channels).
 * See ARCHITECTURE.md §3.2 for the full event contract.
 */
export const PAYMENT_TOPIC = {
  /** Payment accepted & voucher provisioned successfully. */
  ORDER_PAID: 'payment.order.paid',
  /** Payment settled (voucher credentials generated) → bot delivers via WA/TG. */
  ORDER_SETTLED: 'payment.order.settled',
  /** Payment failed / could not settle → admin alert. */
  PAYMENT_FAILED: 'payment.failed',
  /** Billing invoice overdue → reminder. */
  INVOICE_OVERDUE: 'billing.invoice.overdue',
} as const;

/** Defines the RouterService gRPC contract (mirrors router.proto). */
export const ROUTER_GRPC_CONTRACT = {
  packageName: 'router',
  serviceName: 'RouterService',
  protoPath: 'proto/router.proto',
} as const;
