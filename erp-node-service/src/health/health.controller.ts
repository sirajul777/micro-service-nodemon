import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('healthz')
  health() {
    return {
      status: 'ok',
      service: 'erp-node-service',
      db: process.env.DB_NAME || 'db_erp',
      time: new Date().toISOString(),
    };
  }
}
