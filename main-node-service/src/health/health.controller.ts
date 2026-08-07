import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('healthz')
  health() {
const services = {
      auth: process.env.AUTH_SERVICE_URL || 'http://auth-node-service:3001',
      erp: process.env.ERP_SERVICE_URL || 'http://erp-node-service:3003',
      payment: process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3002',
      bot: process.env.BOT_SERVICE_URL || 'http://bot-py-service:5000',
      mikrotik_grpc: process.env.MIKROTIK_GRPC_SERVER || 'mikrotik-go-service:50051',
    };
    return {
      status: 'ok',
      service: 'main-node-service',
      downstream: services,
      time: new Date().toISOString(),
    };
  }
}
