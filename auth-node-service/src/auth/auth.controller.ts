import { Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: { username: string; password: string }) {
    if (!body.username || !body.password) {
      return { success: false, message: 'Username dan password wajib diisi' };
    }
    try {
      const { token, user } = await this.authService.login(body.username, body.password);
      return { success: true, token, user };
    } catch (e: any) {
      return { success: false, message: e.message || 'Login gagal' };
    }
  }

  /** Downstream services / BFF validate a bearer token without re-login. */
  @Post('validate-token')
  async validateToken(@Headers('authorization') authorization?: string) {
    const token = this.extractToken(authorization);
    if (!token) throw new UnauthorizedException('Bearer token diperlukan');
    const payload = await this.authService.validateToken(token);
    return { success: true, payload };
  }

  @Get('me')
  async me(@Headers('authorization') authorization?: string) {
    const token = this.extractToken(authorization);
    if (!token) return { authenticated: false };
    try {
      const payload = await this.authService.validateToken(token);
      return { authenticated: true, ...payload };
    } catch {
      return { authenticated: false };
    }
  }

  @Post('change-password')
  async changePassword(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { oldPassword: string; newPassword: string },
  ) {
    const token = this.extractToken(authorization);
    if (!token) throw new UnauthorizedException('Tidak terautentikasi');
    const payload = await this.authService.validateToken(token);
    if (!body.oldPassword || !body.newPassword) {
      return { error: 'oldPassword dan newPassword wajib diisi' };
    }
    if (body.newPassword.length < 4) {
      return { error: 'Password minimal 4 karakter' };
    }
    const ok = await this.authService.changePassword(
      payload.username,
      body.oldPassword,
      body.newPassword,
    );
    return ok ? { success: true } : { error: 'Password lama tidak sesuai' };
  }

  private extractToken(authorization?: string): string {
    if (!authorization) return '';
    return authorization.startsWith('Bearer ') ? authorization.slice(7) : authorization;
  }
}
