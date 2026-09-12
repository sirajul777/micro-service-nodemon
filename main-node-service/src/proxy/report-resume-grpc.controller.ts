import { Controller, Get, Param, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { ReportRouterGrpcClient } from '../erp/report-router-grpc.client';

@Controller('api/report/:session/resume')
export class ReportResumeGrpcController {
  constructor(
    private readonly authService: AuthService,
    private readonly reportRouterGrpc: ReportRouterGrpcClient,
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
  async resume(
    @Req() req: Request,
    @Param('session') sessionId: string,
    @Query('idbl') idbl: string | undefined,
    @Res() res: Response,
  ) {
    await this.authorize(req);
    try {
      const response = await this.reportRouterGrpc.getResumeReport(decodeURIComponent(sessionId), String(idbl || ''));
      if (!response?.success) {
        return res.status(502).json({ success: false, message: response?.error || 'Report gRPC resume failed' });
      }
      return res.status(200).json({
        daily: (response.daily || []).map((row: any) => ({
          date: String(row.date || ''),
          vouchers: Number(row.vouchers || 0),
          total: Number(row.total || 0),
        })),
        summary: {
          totalVouchers: Number(response.totalVouchers || 0),
          totalIncome: Number(response.totalIncome || 0),
          currency: String(response.currency || 'Rp'),
          isIndo: Boolean(response.isIndo),
          month: String(response.month || ''),
          year: String(response.year || ''),
        },
      });
    } catch (err: any) {
      return res.status(502).json({ success: false, message: `Report gRPC unavailable: ${err?.message || err}` });
    }
  }
}
