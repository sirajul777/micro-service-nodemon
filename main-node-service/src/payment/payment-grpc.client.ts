import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { credentials, loadPackageDefinition, ServiceError } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { existsSync } from 'fs';

@Injectable()
export class PaymentGrpcClient implements OnModuleDestroy {
  private readonly client: any;

  constructor() {
    const candidates = [
      process.env.PAYMENT_GRPC_PROTO_PATH,
      '/app/payment-proto/payment_internal.proto',
      '/app/proto/payment_internal.proto',
    ].filter(Boolean) as string[];
    const protoPath = candidates.find((path) => existsSync(path));
    if (!protoPath) throw new Error(`Payment gRPC proto not found; checked: ${candidates.join(', ')}`);

    const packageDef = loadSync(protoPath, {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const pkg = loadPackageDefinition(packageDef) as any;
    const Service = pkg.payment?.internal?.PaymentInternalService;
    if (!Service) throw new Error('PaymentInternalService gRPC definition not found');

    this.client = new Service(
      process.env.PAYMENT_GRPC_ADDR || 'payment-service:50054',
      credentials.createInsecure(),
    );
  }

  private call(method: string, request: Record<string, any>, timeoutMs = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const fn = this.client?.[method];
      if (typeof fn !== 'function') return reject(new Error(`gRPC method ${method} is not available`));
      const deadline = new Date(Date.now() + timeoutMs);
      fn.call(this.client, request, { deadline }, (err: ServiceError | null, response: any) => {
        if (err) return reject(err);
        resolve(response);
      });
    });
  }

  list(status = '') { return this.call('ListPayments', { status }); }
  stats() { return this.call('GetPaymentStats', {}); }
  getConfig() { return this.call('GetPaymentConfig', {}); }
  saveConfig(values: Record<string, string>) { return this.call('SavePaymentConfig', { values }, 10000); }
  test(amount: number, profile: string) { return this.call('CreatePaymentTest', { amount, profile }, 15000); }
  get(orderId: string) { return this.call('GetPayment', { orderId }); }
  check(orderId: string) { return this.call('CheckPayment', { orderId }); }

  close() { this.client?.close?.(); }
  onModuleDestroy() { this.close(); }
}
