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

  /**
   * Validate against the multi-user system first, then fall back to the
   * legacy single admin in app_config. Returns the safe user object.
   */
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

  async validateToken(token: string): Promise<AuthTokenPayload> {
    try {
      return await this.jwtService.verifyAsync<AuthTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Token tidak valid atau kadaluarsa');
    }
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
