import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ROUTER, svc } from '../router.config';

const AUTH_SESSION_KEY = process.env.BFF_AUTH_SESSION_KEY || 'mikhmon.jwt';

/**
 * BFF auth service. Delegates credential verification to the downstream
 * auth-service (which owns the users DB) and caches the returned JWT in the
 * cookie session, so the browser itself never has to manage a token.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly http: HttpService) {}

  /**
   * Calls auth-service POST /api/auth/login. On success stores the JWT +
   * user context in the express session. Returns the service response.
   */
  async login(
    username: string,
    password: string,
    session: any,
  ): Promise<{ success: boolean; message?: string; user?: any }> {
    try {
      const resp = await firstValueFrom(
        this.http.post(
          svc(ROUTER.auth, '/api/auth/login'),
          { username, password },
          { timeout: 10000 },
        ),
      );
      const data = resp.data || {};
      if (data.success && data.token) {
        session[AUTH_SESSION_KEY] = data.token;
        session.user = data.user || { username };
        session.userPerms = data.user?.permissions || {};
        await new Promise<void>((res, rej) =>
          session.save((e: any) => (e ? rej(e) : res())),
        );
      }
      return data;
    } catch (e: any) {
      this.logger.error(`auth-service login call failed: ${e.message}`);
      return { success: false, message: 'Auth service tidak dapat dijangkau' };
    }
  }

  /** Clears the cached JWT from the session (logout). */
  async logout(session: any): Promise<void> {
    await new Promise<void>((res) => session.destroy(() => res()));
  }

  /** Returns the cached JWT (if any); null otherwise. */
  getToken(session: any): string | null {
    return session[AUTH_SESSION_KEY] || null;
  }

  /** Returns whether the request has a cached (trusted) session. */
  isAuthenticated(session: any): boolean {
    return !!session[AUTH_SESSION_KEY] && !!session.user;
  }

  /**
   * Re-validates the cached token against auth-service each request so
   * revocations/logouts on the auth side take effect immediately.
   */
  async validate(session: any): Promise<boolean> {
    const token = this.getToken(session);
    if (!token) return false;
    try {
      const resp = await firstValueFrom(
        this.http.post(
          svc(ROUTER.auth, '/api/auth/validate-token'),
          {},
          { headers: { authorization: `Bearer ${token}` }, timeout: 10000 },
        ),
      );
      if (resp.data?.success && resp.data?.payload) {
        session.user = resp.data.payload;
        session.userPerms = resp.data.payload.permissions || {};
      }
      return !!resp.data?.success;
    } catch (e: any) {
      this.logger.warn(`token validation failed: ${e.message}`);
      return false;
    }
  }

  /** Returns the (masked-free) session user context. */
  getUser(session: any): any {
    return (
      session.user || {
        username: (session as any).user?.username || 'GUEST',
        role: 'guest',
        permissions: {},
      }
    );
  }
}

