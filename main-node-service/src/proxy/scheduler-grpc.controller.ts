import { Body, Controller, Get, Param, Post, Put, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { ErpDashboardGrpcClient } from '../erp/erp-dashboard-grpc.client';

@Controller('api/mikrotik/:session/scheduler')
export class SchedulerGrpcController {
  constructor(
    private readonly authService: AuthService,
    private readonly erpDashboardGrpc: ErpDashboardGrpcClient,
  ) {}

  private async authorize(req: Request) {
    const session = (req as any).session;
    if (!(session && this.authService.isAuthenticated(session))) {
      throw new UnauthorizedException('Please login first');
    }
    if (!(await this.authService.validate(session))) {
      throw new UnauthorizedException('Session token tidak valid atau kadaluarsa');
    }
  }

  @Get()
  async list(@Req() req: Request, @Param('session') sessionId: string, @Res() res: Response) {
    await this.authorize(req);
    try {
      const response = await this.erpDashboardGrpc.listSchedulers(decodeURIComponent(sessionId));
      if (!response?.success) {
        return res.status(502).json({ success: false, message: response?.error || 'ERP gRPC scheduler list failed' });
      }
      return res.status(200).json(response.schedulers || []);
    } catch (err: any) {
      return res.status(502).json({ success: false, message: `ERP gRPC unavailable: ${err?.message || err}` });
    }
  }

  @Post()
  async add(@Req() req: Request, @Param('session') sessionId: string, @Body() body: any, @Res() res: Response) {
    await this.authorize(req);
    try {
      const response = await this.erpDashboardGrpc.addScheduler({
        sessionId: decodeURIComponent(sessionId),
        name: String(body?.name ?? ''),
        startDate: String(body?.startDate ?? body?.start_date ?? ''),
        startTime: String(body?.startTime ?? body?.start_time ?? ''),
        interval: String(body?.interval ?? ''),
        onEvent: String(body?.onEvent ?? body?.on_event ?? ''),
        disabled: String(body?.disabled ?? ''),
        comment: String(body?.comment ?? ''),
      });
      if (!response?.success) return res.status(400).json({ success: false, message: response?.error || 'AddScheduler failed' });
      return res.status(200).json(response);
    } catch (err: any) {
      return res.status(502).json({ success: false, message: `ERP gRPC unavailable: ${err?.message || err}` });
    }
  }

  @Put(':name')
  async update(@Req() req: Request, @Param('session') sessionId: string, @Param('name') name: string, @Body() body: any, @Res() res: Response) {
    await this.authorize(req);
    try {
      const response = await this.erpDashboardGrpc.updateScheduler({
        sessionId: decodeURIComponent(sessionId),
        name: decodeURIComponent(name),
        onEvent: String(body?.onEvent ?? body?.on_event ?? ''),
        disabled: String(body?.disabled ?? ''),
        comment: String(body?.comment ?? ''),
      });
      if (!response?.success) return res.status(400).json({ success: false, message: response?.error || 'UpdateScheduler failed' });
      return res.status(200).json(response);
    } catch (err: any) {
      return res.status(502).json({ success: false, message: `ERP gRPC unavailable: ${err?.message || err}` });
    }
  }
}
