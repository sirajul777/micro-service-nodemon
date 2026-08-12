import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../user/user.service';
import { ConfigService } from '../config/config.service';

const FULL_ADMIN_PERMISSIONS = {
  viewDashboard: true,
  manageVoucher: true,
  manageBilling: true,
  manageReseller: true,
  managePppoe: true,
  manageHotspot: true,
  viewReport: true,
  manageSystem: true,
};

export interface AuthTokenPayload {
  sub: string;
  username: string;
  name: string;
  role: string;
  permissions: Record<string, boolean>;
  allowedSessions: string[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUserFull(
    username: string,
    password: string,
  ): Promise<Omit<Record<string, any>, 'password'> | null> {
    const u = await this.userService.validate(username, password);
    if (u) return u as any;

    if (await this.configService.validateAdmin(username, password)) {
      return {
        id: 'legacy-admin',
        userId: 'legacy-admin',
        username,
        name: username,
        role: 'admin',
        active: true,
        allowedSessions: [],
        permissions: FULL_ADMIN_PERMISSIONS,
      };
    }
    return null;
  }

  async login(username: string, password: string): Promise<{ token: string; user: any }> {
    const user = await this.validateUserFull(username, password);
    if (!user) {
      throw new UnauthorizedException('Username atau password salah');
    }
    const payload: AuthTokenPayload = {
      sub: user.id || user.userId,
      username: user.username,
      name: user.name,
      role: user.role,
      permissions: user.permissions || {},
      allowedSessions: user.allowedSessions || [],
    };
    const token = await this.jwtService.signAsync(payload);
    const { password: _pw, ...safe } = user;
    return { token, user: safe };
  }

  /**
   * Verify the JWT and then rehydrate the current user state from the auth DB.
   * This makes deactivation, permission changes and session restrictions take
   * effect immediately instead of waiting for the JWT's 24h expiry.
   */
  async validateToken(token: string): Promise<AuthTokenPayload> {
    let signed: AuthTokenPayload;
    try {
      signed = await this.jwtService.verifyAsync<AuthTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Token tidak valid atau kadaluarsa');
    }

    // The legacy single-admin identity is stored in app_config rather than
    // the users table, so preserve its signed JWT context. New multi-users
    // are always rehydrated from the authoritative users table below.
    if (signed.sub === 'legacy-admin') {
      return {
        ...signed,
        permissions: FULL_ADMIN_PERMISSIONS,
        allowedSessions: [],
      };
    }

    const user = await this.userService.getById(signed.sub);
    if (!user || !user.active) {
      throw new UnauthorizedException('User tidak aktif atau tidak ditemukan');
    }

    return {
      sub: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      permissions: user.permissions || {},
      allowedSessions: user.allowedSessions || [],
    };
  }

  async changePassword(
    username: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    const multiUser = await this.userService.getByUsername(username);
    if (multiUser) {
      return this.userService.changePassword(multiUser.id, oldPassword, newPassword);
    }
    if (await this.configService.validateAdmin(username, oldPassword)) {
      return this.configService.changeAdminPassword(username, newPassword);
    }
    return false;
  }
}
