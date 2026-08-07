import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ProxyService } from '../proxy/proxy.service';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly proxyService: ProxyService,
  ) {}

  @Post('login')
  async login(
    @Body() body: { username: string; password: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!body.username || !body.password) {
      return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' });
    }
    const result = await this.authService.login(body.username, body.password, (req as any).session);
    if (!result.success) {
      return res.status(401).json({ success: false, message: result.message || 'Login gagal' });
    }
    return res.json({ success: true, user: result.user });
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request) {
    await this.authService.logout((req as any).session);
    return { success: true };
  }

  @Get('me')
  async me(@Req() req: Request) {
    const session = (req as any).session;
    if (!this.authService.isAuthenticated(session)) {
      return { authenticated: false };
    }
    return {
      authenticated: true,
      ...this.authService.getUser(session),
      allowedSessions:
        (session.user?.allowedSessions as any) || [],
    };
  }

  @Post('change-password')
  async changePassword(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: { oldPassword: string; newPassword: string },
  ) {
    const session = (req as any).session;
    const token = this.authService.getToken(session);
    if (!token) {
      return res.status(401).json({ error: 'Tidak terautentikasi' });
    }
    if (!body.oldPassword || !body.newPassword) {
      return res.status(400).json({ error: 'oldPassword dan newPassword wajib diisi' });
    }
    if (body.newPassword.length < 4) {
      return res.status(400).json({ error: 'Password minimal 4 karakter' });
    }
    const resp = await this.proxyService.forward(
      'auth',
      '/api/auth/change-password',
      'POST',
      token,
      { oldPassword: body.oldPassword, newPassword: body.newPassword },
    );
    const { status, body: data } = this.proxyService.respond(resp);
    return res.status(status).json(data);
  }
}


