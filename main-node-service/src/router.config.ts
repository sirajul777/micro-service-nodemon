/**
 * Downstream service endpoints for the BFF. All URLs are overridable via
 * env so the same image works in docker-compose (service names) or local
 * dev (localhost).
 */
export const ROUTER = {
  auth: process.env.AUTH_SERVICE_URL || 'http://auth-node-service:3001',
  erp: process.env.ERP_SERVICE_URL || 'http://erp-node-service:3003',
  payment: process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3002',
  mikrotikGrpc: process.env.MIKROTIK_GRPC_SERVER || 'mikrotik-go-service:50051',
  bot: process.env.BOT_SERVICE_URL || 'http://bot-py-service:5000',
};

export function svc(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

