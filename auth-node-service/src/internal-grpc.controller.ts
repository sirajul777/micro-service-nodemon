import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AuthService } from './auth/auth.service';
import { UserService } from './user/user.service';

const safe = (u: any) => u ? ({ id: u.id || '', username: u.username || '', name: u.name || '', role: u.role || '', active: !!u.active, allowedSessions: u.allowedSessions || [], permissions: u.permissions || {}, createdAt: u.createdAt || '', lastLogin: u.lastLogin || '', note: u.note || '' }) : null;

@Controller()
export class InternalGrpcController {
  constructor(private readonly authService: AuthService, private readonly userService: UserService) {}

  @GrpcMethod('AuthService', 'Login')
  async login(r: { username: string; password: string }) {
    try { const x = await this.authService.login(r.username, r.password); return { success: true, message: '', token: x.token, user: { id: x.user?.id || '', username: x.user?.username || '', name: x.user?.name || '', role: x.user?.role || '', permissions: x.user?.permissions || {}, allowedSessions: x.user?.allowedSessions || [] } }; }
    catch (e: any) { return { success: false, message: e?.message || 'Login gagal', token: '', user: null }; }
  }

  @GrpcMethod('AuthService', 'ValidateToken')
  async validateToken(r: { token: string }) {
    try { const p = await this.authService.validateToken(r.token); return { success: true, message: '', payload: { id: p.sub, username: p.username, name: p.name, role: p.role, permissions: p.permissions || {}, allowedSessions: p.allowedSessions || [] } }; }
    catch (e: any) { return { success: false, message: e?.message || 'Token tidak valid', payload: null }; }
  }

  @GrpcMethod('AuthService', 'ChangePassword')
  async changePassword(r: { token: string; oldPassword: string; newPassword: string }) {
    try { const p = await this.authService.validateToken(r.token); const ok = await this.authService.changePassword(p.username, r.oldPassword, r.newPassword); return { success: !!ok, message: ok ? 'Password berhasil diubah' : 'Password lama salah atau perubahan gagal' }; }
    catch (e: any) { return { success: false, message: e?.message || 'Gagal mengubah password' }; }
  }

  @GrpcMethod('AuthService', 'ListUsers')
  async listUsers() { try { return { success: true, message: '', users: (await this.userService.getAll()).map(safe) }; } catch (e: any) { return { success: false, message: e?.message || 'Gagal mengambil user', users: [] }; } }
  @GrpcMethod('AuthService', 'GetUser')
  async getUser(r: { id: string }) { try { const u = await this.userService.getById(r.id); return u ? { success: true, message: '', user: safe(u) } : { success: false, message: 'Not found', user: null }; } catch (e: any) { return { success: false, message: e?.message || 'Gagal mengambil user', user: null }; } }
  @GrpcMethod('AuthService', 'CreateUser')
  async createUser(r: any) { try { const u = await this.userService.create({ username: r.username, password: r.password, name: r.name, role: r.role, allowedSessions: r.allowedSessions || [], permissions: r.permissions || {}, note: r.note || '' }); return { success: true, message: '', user: safe(u) }; } catch (e: any) { return { success: false, message: e?.message || 'Gagal membuat user', user: null }; } }
  @GrpcMethod('AuthService', 'UpdateUser')
  async updateUser(r: any) { try { const d: any = {}; if (r.name) d.name = r.name; if (r.role) d.role = r.role; if (r.has_active) d.active = !!r.active; if (r.has_allowed_sessions) d.allowedSessions = r.allowedSessions || []; if (r.has_permissions) d.permissions = r.permissions || {}; if (r.has_note) d.note = r.note || ''; const u = await this.userService.update(r.id, d); return u ? { success: true, message: '', user: safe(u) } : { success: false, message: 'Not found', user: null }; } catch (e: any) { return { success: false, message: e?.message || 'Gagal memperbarui user', user: null }; } }
  @GrpcMethod('AuthService', 'DeleteUser')
  async deleteUser(r: { id: string }) { try { const deleted = await this.userService.delete(r.id); return { success: deleted, message: deleted ? '' : 'Not found', deleted }; } catch (e: any) { return { success: false, message: e?.message || 'Gagal menghapus user', deleted: false }; } }
  @GrpcMethod('AuthService', 'ToggleUser')
  async toggleUser(r: { id: string }) { try { const active = await this.userService.toggleActive(r.id); return active === null ? { success: false, message: 'Not found', active: false } : { success: true, message: '', active }; } catch (e: any) { return { success: false, message: e?.message || 'Gagal mengubah status user', active: false }; } }
  @GrpcMethod('AuthService', 'ResetUserPassword')
  async resetUserPassword(r: { id: string; newPassword: string }) { try { const success = await this.userService.resetPassword(r.id, r.newPassword); return { success, message: success ? '' : 'Not found' }; } catch (e: any) { return { success: false, message: e?.message || 'Gagal reset password' }; } }
  @GrpcMethod('AuthService', 'GetRoleDefaults')
  async getRoleDefaults(r: { role: any }) { try { return { success: true, message: '', permissions: this.userService.getRoleDefaults(r.role) as any }; } catch (e: any) { return { success: false, message: e?.message || 'Gagal mengambil role defaults', permissions: {} }; } }
}
