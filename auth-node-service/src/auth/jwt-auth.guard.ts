import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { PERMISSIONS_KEY, PermissionKey } from './permissions.decorator';

/**
 * JWT guard for the auth service. Validates the bearer token and enforces
 * the `manageSystem`-level permission declared via @RequirePermission.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
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
      payload = await this.authService.validateToken(token);
    } catch {
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
