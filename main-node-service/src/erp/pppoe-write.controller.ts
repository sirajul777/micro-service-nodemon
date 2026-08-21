import { Body, Controller, Delete, Param, Post, Put, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { ErpDashboardGrpcClient } from './erp-dashboard-grpc.client';

@Controller('api/pppoe/:session')
export class PppoeWriteController {
  constructor(private readonly auth: AuthService, private readonly erp: ErpDashboardGrpcClient) {}

  private async guard(req: Request) {
    const session = (req as any).session;
    if (!(session && this.auth.isAuthenticated(session))) throw new UnauthorizedException('Please login first');
    if (!(await this.auth.validate(session))) throw new UnauthorizedException('Session token tidak valid atau kadaluarsa');
    return session;
  }

  @Post('secrets')
  async addSecret(@Param('session') session: string, @Body() body: any, @Req() req: Request) {
    await this.guard(req);
    return this.erp.addPppSecret({ sessionId: decodeURIComponent(session), ...body });
  }

  @Put('secrets/:name')
  async updateSecret(@Param('session') session: string, @Param('name') name: string, @Body() body: any, @Req() req: Request) {
    await this.guard(req);
    return this.erp.updatePppSecret({ sessionId: decodeURIComponent(session), name: decodeURIComponent(name), ...body });
  }

  @Delete('secrets/:name')
  async deleteSecret(@Param('session') session: string, @Param('name') name: string, @Req() req: Request) {
    await this.guard(req);
    return this.erp.deletePppSecret(decodeURIComponent(session), decodeURIComponent(name));
  }

  @Post('secrets/:name/enable')
  async enableSecret(@Param('session') session: string, @Param('name') name: string, @Req() req: Request) {
    await this.guard(req);
    return this.erp.enablePppSecret(decodeURIComponent(session), decodeURIComponent(name));
  }

  @Post('secrets/:name/disable')
  async disableSecret(@Param('session') session: string, @Param('name') name: string, @Req() req: Request) {
    await this.guard(req);
    return this.erp.disablePppSecret(decodeURIComponent(session), decodeURIComponent(name));
  }

  @Post('profiles')
  async addProfile(@Param('session') session: string, @Body() body: any, @Req() req: Request) {
    await this.guard(req);
    return this.erp.addPppProfile({ sessionId: decodeURIComponent(session), ...body });
  }

  @Put('profiles/:name')
  async updateProfile(@Param('session') session: string, @Param('name') name: string, @Body() body: any, @Req() req: Request) {
    await this.guard(req);
    return this.erp.updatePppProfile({ sessionId: decodeURIComponent(session), name: decodeURIComponent(name), ...body });
  }

  @Delete('profiles/:name')
  async deleteProfile(@Param('session') session: string, @Param('name') name: string, @Req() req: Request) {
    await this.guard(req);
    return this.erp.deletePppProfile(decodeURIComponent(session), decodeURIComponent(name));
  }
}
