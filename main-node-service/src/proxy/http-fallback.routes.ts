import { Response } from 'express';
import { HttpProxyFallbackService } from './http-proxy-fallback.service';

/**
 * Keep the legacy HTTP transport isolated from migrated gRPC routes.
 * No gRPC-migrated ERP/Auth/Bot/Payment path should call this helper.
 */
export async function forwardRemainingHttpRoute(
  fallback: HttpProxyFallbackService,
  res: Response,
  target: 'auth' | 'erp' | 'payment' | 'bot',
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  token: string | null,
  body?: unknown,
  query?: unknown,
) {
  const response = await fallback.forward(target, path, method, token, body, query);
  const { status, body: data } = fallback.respond(response);
  return res.status(status).json(data);
}
