import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AuthService } from './auth/auth.service';

@Controller()
export class InternalGrpcController {
  constructor(private readonly authService: AuthService) {}

  @GrpcMethod('AuthService', 'Login')
  async login(request: { username: string; password: string }) {
    try {
      const result = await this.authService.login(request.username, request.password);
      return {
        success: true,
        message: '',
        token: result.token,
        user: {
          id: result.user?.id || result.user?.userId || '',
          username: result.user?.username || '',
          name: result.user?.name || '',
          role: result.user?.role || '',
          permissions: result.user?.permissions || {},
          allowedSessions: result.user?.allowedSessions || [],
        },
      };
    } catch (error: any) {
      return { success: false, message: error?.message || 'Login gagal', token: '', user: null };
    }
  }

  @GrpcMethod('AuthService', 'ValidateToken')
  async validateToken(request: { token: string }) {
    try {
      const payload = await this.authService.validateToken(request.token);
      return {
        success: true,
        message: '',
        payload: {
          id: payload.sub,
          username: payload.username,
          name: payload.name,
          role: payload.role,
          permissions: payload.permissions || {},
          allowedSessions: payload.allowedSessions || [],
        },
      };
    } catch (error: any) {
      return { success: false, message: error?.message || 'Token tidak valid', payload: null };
    }
  }
}
