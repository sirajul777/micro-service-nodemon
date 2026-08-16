import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PaymentAuthGrpcClient } from './auth-grpc.client';
import { PERMISSIONS_KEY, PermissionKey } from './permissions.decorator';

/**
 * JWT guard for the payment service.
 *
 * Validates the Bearer token against auth-node-service over internal gRPC,
 * then enforces feature permissions and router-session tenancy.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly authGrpc: PaymentAuthGrpcClient,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
    if (!token) {
      throw new UnauthorizedException('Bearer token diperlukan');
    }

    let payload: any;
    try {
      const res = await this.authGrpc.validateToken(token);
      if (!res?.success || !res?.payload) {
        throw new UnauthorizedException(res?.message || 'Token tidak valid atau kadaluarsa');
      }
      payload = res.payload;
    } catch (e: any) {
      this.logger.warn(`Token validation gRPC failed: ${e.message}`);
      throw new UnauthorizedException('Token tidak valid atau kadaluarsa');
    }

    req.user = payload;

    const required = this.reflector.getAllAndOverride<PermissionKey[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (required && required.length > 0 && payload.role !== 'admin') {
      const perms = payload.permissions || {};
      const allowed = required.some((p) => perms[p] === true);
      if (!allowed) {
        throw new ForbiddenException('Anda tidak memiliki akses ke fitur ini');
      }
    }

    const session = req.params?.session;
    if (session && payload.role !== 'admin') {
      const allowedSessions = Array.isArray(payload.allowedSessions)
        ? payload.allowedSessions.map(String)
        : [];
      if (!allowedSessions.includes(String(session))) {
        throw new ForbiddenException('Anda tidak memiliki akses ke router session ini');
      }
    }

    return true;
  }
}
