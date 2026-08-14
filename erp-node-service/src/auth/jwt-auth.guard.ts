import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PERMISSIONS_KEY, PermissionKey } from './permissions.decorator';

/**
 * JWT guard for the ERP service. Validates the bearer token against
 * auth-node-service and enforces feature permissions and router-session
 * tenancy. Admins may access all sessions; non-admin users must have an
 * explicit allowedSessions entry for a :session route.
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
