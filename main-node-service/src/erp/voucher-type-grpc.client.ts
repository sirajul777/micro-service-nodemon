import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { credentials, loadPackageDefinition, ServiceError } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { existsSync } from 'fs';
import { join } from 'path';

@Injectable()
export class VoucherTypeGrpcClient implements OnModuleDestroy {
  private readonly client: any;

  constructor() {
    const candidates = [
      process.env.ERP_GRPC_PROTO_PATH,
      join(process.cwd(), 'src', 'proto', 'erp_internal.proto'),
      join(process.cwd(), 'erp-proto', 'erp_internal.proto'),
      '/app/erp-proto/erp_internal.proto',
    ].filter(Boolean) as string[];
    const protoPath = candidates.find((path) => existsSync(path));
    if (!protoPath) throw new Error(`ERP gRPC proto not found; checked: ${candidates.join(', ')}`);

    const packageDef = loadSync(protoPath, {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const pkg = loadPackageDefinition(packageDef) as any;
    const Service = pkg.erp?.internal?.ErpInternalService;
    if (!Service) throw new Error('ErpInternalService gRPC definition not found');
    this.client = new Service(
      process.env.ERP_GRPC_ADDR || 'erp-node-service:50053',
      credentials.createInsecure(),
    );
  }

  private call(method: string, request: Record<string, any>, timeoutMs = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const deadline = new Date(Date.now() + timeoutMs);
      const fn = this.client?.[method];
      if (typeof fn !== 'function') return reject(new Error(`gRPC method ${method} is not available`));
      fn.call(this.client, request, { deadline }, (err: ServiceError | null, response: any) => {
        if (err) return reject(err);
        resolve(response);
      });
    });
  }

  list() { return this.call('ListVoucherTypes', {}); }
  getActive() { return this.call('GetActiveVoucherTypes', {}); }
  get(id: string) { return this.call('GetVoucherType', { id }); }
  create(voucherType: Record<string, any>) { return this.call('CreateVoucherType', { voucherType }, 10000); }
  update(voucherType: Record<string, any>) { return this.call('UpdateVoucherType', { voucherType }, 10000); }
  remove(id: string) { return this.call('DeleteVoucherType', { id }); }
  toggle(id: string) { return this.call('ToggleVoucherType', { id }); }

  close() { this.client?.close?.(); }
  onModuleDestroy() { this.close(); }
}
