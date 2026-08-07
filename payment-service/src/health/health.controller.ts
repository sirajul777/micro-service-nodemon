import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('healthz')
  health() {
    return {
      status: 'ok',
      service: 'payment-service',
      db: process.env.DB_NAME || 'db_payment',
      time: new Date().toISOString(),
    };
  }
}
