import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('healthz')
  health() {
    return {
      status: 'ok',
      service: 'auth-node-service',
      db: process.env.DB_NAME || 'db_auth',
      time: new Date().toISOString(),
    };
  }
}
