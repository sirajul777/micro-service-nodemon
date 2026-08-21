import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { credentials, loadPackageDefinition, ServiceError } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { existsSync } from 'fs';
import { join } from 'path';

@Injectable()
export class ErpGrpcClient implements OnModuleDestroy {
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

  private call(method: string, request: Record<string, any>, timeoutMs = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const deadline = new Date(Date.now() + timeoutMs);
      const fn = this.client?.[method];
      if (typeof fn !== 'function') {
        return reject(new Error(`gRPC method ${method} is not available in ErpInternalService`));
      }
      fn.call(this.client, request, { deadline }, (err: ServiceError | null, response: any) => {
        if (err) return reject(err);
        resolve(response);
      });
    });
  }

  async listSessions() {
    return this.call('ListSessions', {}, 10000);
  }

  async getSession(id: string) {
    return this.call('GetSession', { id }, 10000);
  }

  async getLiveReport(session: string) {
    return this.call('GetLiveReport', { session }, 35000);
  }

  close() {
    this.client?.close?.();
  }

  onModuleDestroy() {
    this.close();
  }
}
