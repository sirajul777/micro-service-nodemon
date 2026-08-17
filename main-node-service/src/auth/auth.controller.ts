import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
      allowedSessions: (session.user?.allowedSessions as any) || [],
    };
  }

  @Post('change-password')
  async changePassword(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: { oldPassword: string; newPassword: string },
  ) {
    const token = this.authService.getToken((req as any).session);
    if (!token) return res.status(401).json({ error: 'Tidak terautentikasi' });
    if (!body.oldPassword || !body.newPassword) {
      return res.status(400).json({ error: 'oldPassword dan newPassword wajib diisi' });
    }
    if (body.newPassword.length < 4) {
      return res.status(400).json({ error: 'Password minimal 4 karakter' });
    }
    const result = await this.authService.changePassword(
      token,
      body.oldPassword,
      body.newPassword,
    );
    if (!result?.success) {
      return res.status(400).json({ error: result?.message || 'Gagal mengubah password' });
    }
    return res.status(200).json(result);
  }
}
