import { Injectable, Logger } from '@nestjs/common';
import { AuthGrpcClient } from './auth-grpc.client';

const AUTH_SESSION_KEY = process.env.BFF_AUTH_SESSION_KEY || 'mikhmon.jwt';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly grpc: AuthGrpcClient) {}

  async login(
    username: string,
    password: string,
    session: any,
  ): Promise<{ success: boolean; message?: string; user?: any }> {
    try {
      const data = await this.grpc.login(username, password);
      if (data?.success && data?.token) {
        session[AUTH_SESSION_KEY] = data.token;
        session.user = data.user || { username };
        session.userPerms = data.user?.permissions || {};
        await new Promise<void>((res, rej) =>
          session.save((e: any) => (e ? rej(e) : res())),
        );
      }
      return data || { success: false, message: 'Auth service tidak merespons' };
    } catch (e: any) {
      this.logger.error(`auth gRPC login failed: ${e.message}`);
      return { success: false, message: 'Auth service tidak dapat dijangkau' };
    }
  }

  async logout(session: any): Promise<void> {
    await new Promise<void>((res) => session.destroy(() => res()));
  }

  getToken(session: any): string | null {
    return session[AUTH_SESSION_KEY] || null;
  }

  isAuthenticated(session: any): boolean {
    return !!session[AUTH_SESSION_KEY] && !!session.user;
  }

  async validate(session: any): Promise<boolean> {
    const token = this.getToken(session);
    if (!token) return false;
    try {
      const resp = await this.grpc.validateToken(token);
      if (resp?.success && resp?.payload) {
        session.user = resp.payload;
        session.userPerms = resp.payload.permissions || {};
      }
      return !!resp?.success;
    } catch (e: any) {
      this.logger.warn(`token validation gRPC failed: ${e.message}`);
      return false;
    }
  }

  async changePassword(token: string, oldPassword: string, newPassword: string) {
    try {
      return await this.grpc.changePassword(token, oldPassword, newPassword);
    } catch (e: any) {
      this.logger.error(`auth gRPC change-password failed: ${e.message}`);
      return { success: false, message: 'Auth service tidak dapat dijangkau' };
    }
  }

  getUser(session: any): any {
    return (
      session.user || {
        username: 'GUEST',
        role: 'guest',
        permissions: {},
      }
    );
  }
}
