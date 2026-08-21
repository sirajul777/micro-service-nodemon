import { Controller, Get, Param, Req, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { PppoeGrpcClient } from './pppoe-grpc.client';

@Controller('api/pppoe')
export class PppoeGrpcController {
  constructor(
    private readonly auth: AuthService,
    private readonly pppoe: PppoeGrpcClient,
  ) {}

  private async requireSession(req: Request) {
    const session = (req as any).session;
    if (!(session && this.auth.isAuthenticated(session))) {
      throw new UnauthorizedException('Please login first');
    }
    if (!(await this.auth.validate(session))) {
      throw new UnauthorizedException('Session token tidak valid atau kadaluarsa');
    }
  }

  @Get(':session/profiles')
  async profiles(@Req() req: Request, @Param('session') session: string) {
    await this.requireSession(req);
    const response = await this.pppoe.listProfiles(decodeURIComponent(session));
    if (!response?.success) {
      throw new ServiceUnavailableException(
        response?.error || 'Router gRPC PPPoE profiles failed',
      );
    }
    return response.profiles || [];
  }
}
