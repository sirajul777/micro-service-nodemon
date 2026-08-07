import { Body, Controller, Get, Post } from '@nestjs/common';
import { PaymentConfigService } from './payment-config.service';
import { PaymentConfigEntity } from './entities/payment-config.entity';

/**
 * Payment settings CRUD (QRIS GoPay Merchant + Midtrans/Duitku gateway config).
 * In the microservice these are domain endpoints behind the api-gateway; the
 * gateway validates the admin JWT before proxying here.
 */
@Controller('api/payment-config')
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
