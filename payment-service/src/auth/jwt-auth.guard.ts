import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PERMISSIONS_KEY, PermissionKey } from './permissions.decorator';

/**
 * JWT guard for the payment service.
 *
 * Validates the Bearer token by calling auth-node-service's
 * `POST /auth/validate-token` endpoint (same pattern as erp-node-service's
 * JwtAuthGuard). This is the defense-in-depth backstop behind the BFF:
 * even if a request reaches payment-service directly (bypassing the nginx
 * gateway / BFF session), it must carry a valid JWT signed by the auth
 * service and — when declared — the required permission.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly http: HttpService,
    private readonly reflector: Reflector,
  ) {}

  private get authServiceUrl(): string {
    return process.env.AUTH_SERVICE_URL || 'http://auth-node-service:3001';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
    if (!token) {
      throw new UnauthorizedException('Bearer token diperlukan');
    }

    // Validate the token against auth-node-service.
let payload: any;
    try {
      const res = await firstValueFrom(
        this.http.post(
          `${this.authServiceUrl}/api/auth/validate-token`,
          {},
          {
            headers: { authorization: `Bearer ${token}` },
            timeout: 5000,
          },
        ),
      );
      payload = res.data?.payload || res.data;
    } catch (e: any) {
      this.logger.warn(`Token validation failed: ${e.message}`);
      throw new UnauthorizedException('Token tidak valid atau kadaluarsa');
    }

    req.user = payload;

    // Permission enforcement (admin always passes).
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (required && required.length > 0) {
      if (payload.role === 'admin') return true;
      const perms = payload.permissions || {};
      const allowed = required.some((p) => perms[p] === true);
      if (!allowed) {
        throw new ForbiddenException('Anda tidak memiliki akses ke fitur ini');
      }
    }
    return true;
  }
}

