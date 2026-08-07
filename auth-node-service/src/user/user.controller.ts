import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { UserService, UserRole } from './user.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/permissions.decorator';

/**
 * User management (admin-only). In the microservice world this is exposed to
 * the BFF; the BFF (or gateway) enforces the manageSystem permission by
 * validating the JWT, then calls here. The guard is applied defensively.
 */
@Controller('api/users')
@UseGuards(JwtAuthGuard)
@RequirePermission('manageSystem')
export class UserController {
  constructor(private readonly userSvc: UserService) {}

  @Get()
  getAll() {
    return this.userSvc.getAll();
  }

  @Get('roles/defaults')
  getRoleDefaults() {
    return {
      admin: this.userSvc.getRoleDefaults('admin'),
      reseller: this.userSvc.getRoleDefaults('reseller'),
      collector: this.userSvc.getRoleDefaults('collector'),
    };
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const u = await this.userSvc.getById(id);
    if (!u) return { error: 'Not found' };
    const { password, ...safe } = u;
    return safe;
  }

  @Post()
  async create(
    @Body()
    body: {
      username: string;
      password: string;
      name: string;
      role: UserRole;
      allowedSessions?: string[];
      permissions?: any;
      note?: string;
    },
  ) {
    if (!body.username || !body.password || !body.name || !body.role) {
      return { error: 'username, password, name, role wajib diisi' };
    }
    if (body.password.length < 4) {
      return { error: 'Password minimal 4 karakter' };
    }
    try {
      return await this.userSvc.create(body);
    } catch (e: any) {
      return { error: e.message };
    }
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    try {
      const u = await this.userSvc.update(id, body);
      return u || { error: 'Not found' };
    } catch (e: any) {
      return { error: e.message };
    }
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    try {
      return { success: await this.userSvc.delete(id) };
    } catch (e: any) {
      return { error: e.message };
    }
  }

  @Patch(':id/toggle')
  async toggle(@Param('id') id: string) {
    try {
      const active = await this.userSvc.toggleActive(id);
      return active !== null ? { success: true, active } : { error: 'Not found' };
    } catch (e: any) {
      return { error: e.message };
    }
  }

  @Post(':id/reset-password')
  async resetPassword(@Param('id') id: string, @Body() body: { newPassword: string }) {
    if (!body.newPassword || body.newPassword.length < 4) {
      return { error: 'Password minimal 4 karakter' };
    }
    return { success: await this.userSvc.resetPassword(id, body.newPassword) };
  }
}
