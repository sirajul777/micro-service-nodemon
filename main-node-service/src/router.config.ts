/**
 * Downstream service endpoints used only by the explicitly allow-listed
 * legacy HTTP live-report fallback. All migrated internal paths use gRPC.
 */
export const ROUTER = {
  auth: process.env.AUTH_SERVICE_URL || 'http://auth-node-service:3001',
  erp: process.env.ERP_SERVICE_URL || 'http://erp-node-service:3003',
  payment: process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3002',
  bot: process.env.BOT_SERVICE_URL || 'http://bot-py-service:8082',
};

export function svc(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}
