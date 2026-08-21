import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { credentials, loadPackageDefinition, ServiceError } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { existsSync } from 'fs';
import { join } from 'path';

export interface VoucherTypeDto {
  id: string;
  name: string;
  price: number;
  profile: string;
  duration: string;
  codeLength: number;
  codeFormat: string;
  userType: string;
  active: boolean;
}

@Injectable()
export class GrpcVoucherTypeClient implements OnModuleDestroy {
  private readonly client: any;

  constructor() {
    const candidates = [
      process.env.ERP_GRPC_PROTO_PATH,
      join(process.cwd(), 'src', 'proto', 'erp_internal.proto'),
      join(process.cwd(), 'erp-proto', 'erp_internal.proto'),
      '/app/erp-proto/erp_internal.proto',
    ].filter(Boolean) as string[];
    const protoPath = candidates.find((path) => existsSync(path));
    if (!protoPath) {
      throw new Error(`ERP gRPC proto not found; checked: ${candidates.join(', ')}`);
    }

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

  getById(id: string): Promise<VoucherTypeDto | null> {
    return new Promise((resolve) => {
      const deadline = new Date(Date.now() + 5000);
      this.client.GetVoucherType(
        { id },
        { deadline },
        (err: ServiceError | null, response: any) => {
          if (err || !response?.success || !response?.voucherType) return resolve(null);
          const vt = response.voucherType;
          resolve({
            id: vt.id || id,
            name: vt.name || '',
            price: Math.round(Number(vt.price) || 0),
            profile: vt.profile || '',
            duration: vt.duration || '',
            codeLength: Number(vt.codeLength) || 6,
            codeFormat: vt.codeFormat || 'upper+digit',
            userType: vt.userType || 'up',
            active: vt.active ?? true,
          });
        },
      );
    });
  }

  close() {
    this.client?.close?.();
  }

  onModuleDestroy() {
    this.close();
  }
}
