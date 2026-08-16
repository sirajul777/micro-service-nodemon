import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGrpcClient } from './auth-grpc.client';
import { PERMISSIONS_KEY, PermissionKey } from './permissions.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly authGrpc: AuthGrpcClient,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
    if (!token) throw new UnauthorizedException('Bearer token diperlukan');

    let payload: any;
    try {
      const response = await this.authGrpc.validateToken(token);
      if (!response?.success || !response?.payload) {
        throw new UnauthorizedException(response?.message || 'Token tidak valid atau kadaluarsa');
      }
      payload = response.payload;
    } catch (e: any) {
      this.logger.warn(`Token validation via gRPC failed: ${e.message}`);
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException('Auth service tidak dapat dijangkau');
    }

    req.user = payload;

    const required = this.reflector.getAllAndOverride<PermissionKey[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (required && required.length > 0 && payload.role !== 'admin') {
      const perms = payload.permissions || {};
      const allowed = required.some((p) => perms[p] === true);
      if (!allowed) throw new ForbiddenException('Anda tidak memiliki akses ke fitur ini');
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
