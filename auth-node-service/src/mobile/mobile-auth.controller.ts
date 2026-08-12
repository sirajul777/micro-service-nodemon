import { Body, Controller, Get, Headers, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { MobileTokenService } from './mobile-token.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/permissions.decorator';

/**
 * Mobile API auth: validates credentials, then issues a long-lived mobile
 * token (stored in DB), mirroring the monolith's mobile-token flow.
 */
@Controller('api/mobile-auth')
export class MobileAuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: MobileTokenService,
  ) {}

  @Post('login')
  async login(@Body() body: { username: string; password: string }) {
    const user = await this.authService.validateUserFull(body.username, body.password);
    if (!user) {
      return { success: false, message: 'Username atau password salah' };
    }
    const token = await this.tokenService.generate(
      user.id || user.userId,
      user.username,
      user.name,
      user.role,
      user.permissions || {},
      user.allowedSessions || [],
    );
    return { success: true, token };
  }

  @Get('tokens')
  @UseGuards(JwtAuthGuard)
  @RequirePermission('manageSystem')
  async tokens() {
    return { success: true, tokens: await this.tokenService.loadAll() };
  }

  @Post('logout')
  async logout(@Headers('authorization') authorization?: string) {
    const token = this.extractToken(authorization);
    if (token) await this.tokenService.revoke(token);
    return { success: true };
  }

  @Post('validate')
  async validate(@Headers('authorization') authorization?: string) {
    const token = this.extractToken(authorization);
    if (!token) throw new UnauthorizedException('Bearer token diperlukan');
    const decoded = await this.tokenService.verify(token);
    if (!decoded) throw new UnauthorizedException('Sesi telah berakhir atau tidak valid');
    return { success: true, user: decoded };
  }

  private extractToken(authorization?: string): string {
    if (!authorization) return '';
    return authorization.startsWith('Bearer ') ? authorization.slice(7) : authorization;
  }
}
