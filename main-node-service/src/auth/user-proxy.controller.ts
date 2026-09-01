import { All, Body, Controller, Get, Param, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthGrpcClient } from './auth-grpc.client';
import { AuthService } from './auth.service';

@Controller('api/users')
export class UserProxyController {
  constructor(private readonly auth: AuthService, private readonly grpc: AuthGrpcClient) {}

  private async guard(req: Request) {
    const session = (req as any).session;
    if (!(session && this.auth.isAuthenticated(session))) throw new UnauthorizedException('Please login first');
    if (!(await this.auth.validate(session))) throw new UnauthorizedException('Session token tidak valid atau kadaluarsa');
    const user = this.auth.getUser(session);
    if (user?.role !== 'admin' && user?.permissions?.manageSystem !== true) {
      throw new UnauthorizedException('Permission manageSystem diperlukan');
    }
  }

  @Get()
  async list(@Req() req: Request) {
    await this.guard(req);
    const response = await this.grpc.listUsers();
    return response?.success === false ? { success: false, message: response.message || 'Gagal mengambil user', users: [] } : (response?.users || []);
  }

  @Get('roles/defaults')
  async roleDefaults(@Req() req: Request) {
    await this.guard(req);
    const roles = ['admin', 'reseller', 'collector'];
    const results = await Promise.all(roles.map(async (role) => [role, (await this.grpc.getRoleDefaults(role))?.permissions || {}]));
    return Object.fromEntries(results);
  }

  @Get(':id')
  async getOne(@Req() req: Request, @Param('id') id: string) {
    await this.guard(req);
    const response = await this.grpc.getUser(id);
    if (!response?.success) return { error: response?.message || 'Not found' };
    return response.user || null;
  }

  @All('')
  async create(@Req() req: Request, @Body() body: any) {
    await this.guard(req);
    if (req.method !== 'POST') return { error: 'Method not allowed' };
    if (!body?.username || !body?.password || !body?.name || !body?.role) return { error: 'username, password, name, role wajib diisi' };
    if (String(body.password).length < 4) return { error: 'Password minimal 4 karakter' };
    const response = await this.grpc.createUser({ username: String(body.username), password: String(body.password), name: String(body.name), role: String(body.role), allowedSessions: Array.isArray(body.allowedSessions) ? body.allowedSessions.map(String) : [], permissions: body.permissions || {}, note: String(body.note || '') });
    return response?.success ? response.user : { error: response?.message || 'Gagal membuat user' };
  }

  @All(':id')
  async mutate(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    await this.guard(req);
    if (req.method === 'PUT') {
      const update: any = {};
      if (body?.name !== undefined) update.name = String(body.name);
      if (body?.role !== undefined) update.role = String(body.role);
      if (body?.active !== undefined) { update.active = !!body.active; update.hasActive = true; }
      if (body?.allowedSessions !== undefined) { update.allowedSessions = Array.isArray(body.allowedSessions) ? body.allowedSessions.map(String) : []; update.hasAllowedSessions = true; }
      if (body?.permissions !== undefined) { update.permissions = body.permissions || {}; update.hasPermissions = true; }
      if (body?.note !== undefined) { update.note = String(body.note); update.hasNote = true; }
      const response = await this.grpc.updateUser(id, update);
      return response?.success ? response.user : { error: response?.message || 'Gagal memperbarui user' };
    }
    if (req.method === 'DELETE') {
      const response = await this.grpc.deleteUser(id);
      return response?.success ? { success: true } : { error: response?.message || 'Gagal menghapus user' };
    }
    if (req.method === 'PATCH' && req.path.endsWith('/toggle')) {
      const response = await this.grpc.toggleUser(id);
      return response?.success ? { success: true, active: response.active } : { error: response?.message || 'Gagal mengubah status user' };
    }
    if (req.method === 'POST' && req.path.endsWith('/reset-password')) {
      const newPassword = String(body?.newPassword || '');
      if (newPassword.length < 4) return { error: 'Password minimal 4 karakter' };
      const response = await this.grpc.resetUserPassword(id, newPassword);
      return response?.success ? { success: true } : { error: response?.message || 'Gagal reset password' };
    }
    return { error: 'Method not allowed' };
  }
}
