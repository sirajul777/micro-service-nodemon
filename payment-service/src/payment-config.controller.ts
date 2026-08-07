import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { PaymentConfigService } from './payment-config.service';
import { PaymentConfigEntity } from './entities/payment-config.entity';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RequirePermission } from './auth/permissions.decorator';

/**
 * Payment settings CRUD (QRIS GoPay Merchant + Midtrans/Duitku gateway config).
 * Protected by JwtAuthGuard (validates Bearer token against auth-node-service).
 * This is the defense-in-depth backstop: even a direct hit to payment-service
 * (bypassing the BFF) requires a valid JWT with `manageSystem`.
 */
@Controller('api/payment-config')
@UseGuards(JwtAuthGuard)
@RequirePermission('manageSystem')
export class PaymentConfigController {
  constructor(private readonly configService: PaymentConfigService) {}

  @Get()
  async get() {
    return { success: true, config: await this.configService.getConfigMasked() };
  }

  @Post()
  async save(@Body() body: Partial<PaymentConfigEntity>) {
    const saved = await this.configService.saveConfig(body || {});
    return { success: true, config: saved };
  }
}
