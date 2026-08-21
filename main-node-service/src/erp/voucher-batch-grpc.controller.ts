import { Controller, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { VoucherBatchGrpcClient } from './voucher-batch-grpc.client';

@Controller('api/batches')
export class VoucherBatchGrpcController {
  constructor(private readonly auth: AuthService, private readonly batches: VoucherBatchGrpcClient) {}

  private async requireSession(req: Request) {
    const session = (req as any).session;
    if (!(session && this.auth.isAuthenticated(session))) throw new UnauthorizedException('Please login first');
    if (!(await this.auth.validate(session))) throw new UnauthorizedException('Session token tidak valid atau kadaluarsa');
  }

  @Post(':session/auto-sync-used')
  async autoSync(@Req() req: Request, @Param('session') session: string) {
    await this.requireSession(req);
    const response = await this.batches.autoSyncUsed(decodeURIComponent(session));
    if (!response?.success) return { success: false, error: response?.error || 'ERP gRPC auto-sync-used failed' };
    return response;
  }
}
