import { Controller, Get, Param, Query, Req, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { HotspotGrpcClient } from './hotspot-grpc.client';

@Controller('api/mikrotik')
export class HotspotGrpcController {
  constructor(private readonly auth: AuthService, private readonly hotspot: HotspotGrpcClient) {}

  private async requireSession(req: Request) {
    const session = (req as any).session;
    if (!(session && this.auth.isAuthenticated(session))) throw new UnauthorizedException('Please login first');
    if (!(await this.auth.validate(session))) throw new UnauthorizedException('Session token tidak valid atau kadaluarsa');
  }

  @Get(':session/hotspot/active')
  async active(@Req() req: Request, @Param('session') session: string) {
    await this.requireSession(req);
    const response = await this.hotspot.listActiveUsers(decodeURIComponent(session));
    if (!response?.success) throw new ServiceUnavailableException(response?.error || 'Router gRPC active users failed');
    return response.users || [];
  }

  @Get(':session/hotspot/users')
  async users(@Req() req: Request, @Param('session') session: string, @Query('profile') profile?: string, @Query('comment') comment?: string) {
    await this.requireSession(req);
    const response = await this.hotspot.listUsers({ sessionId: decodeURIComponent(session), profile: profile || '', comment: comment || '' });
    if (!response?.success) throw new ServiceUnavailableException(response?.error || 'Router gRPC hotspot users failed');
    return response.users || [];
  }

  @Get(':session/hotspot/profiles')
  async profiles(@Req() req: Request, @Param('session') session: string) {
    await this.requireSession(req);
    const response = await this.hotspot.listProfiles(decodeURIComponent(session));
    if (!response?.success) throw new ServiceUnavailableException(response?.error || 'Router gRPC hotspot profiles failed');
    return response.profiles || [];
  }
}
