import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { credentials, loadPackageDefinition, ServiceError } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { existsSync } from 'fs';
import { join } from 'path';

@Injectable()
export class VoucherGrpcClient implements OnModuleDestroy {
  private readonly client: any;

  constructor() {
    const candidates = [
      process.env.MIKROTIK_GRPC_PROTO_PATH,
      join(process.cwd(), 'src', 'proto', 'router.proto'),
      join(process.cwd(), 'router-proto', 'router.proto'),
      '/app/router-proto/router.proto',
    ].filter(Boolean) as string[];
    const protoPath = candidates.find((path) => existsSync(path));
    if (!protoPath) throw new Error(`Router gRPC proto not found; checked: ${candidates.join(', ')}`);
    const packageDef = loadSync(protoPath, { keepCase: false, longs: String, enums: String, defaults: true, oneofs: true });
    const pkg = loadPackageDefinition(packageDef) as any;
    const Service = pkg.router?.RouterService;
    if (!Service) throw new Error('RouterService gRPC definition not found');
    this.client = new Service(
      process.env.MIKROTIK_GRPC_SERVER || process.env.MIKROTIK_GRPC_ADDR || 'mikrotik-go-service:50051',
      credentials.createInsecure(),
    );
  }

  private call(method: string, request: Record<string, any>, timeoutMs = 30000): Promise<any> {
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

  listHotspotUsers(sessionId: string, profile = '', comment = '') { return this.call('ListHotspotUsers', { sessionId, profile, comment }, 30000); }
  listHotspotProfiles(sessionId: string) { return this.call('ListHotspotProfiles', { sessionId }, 30000); }

  close() { this.client?.close?.(); }
  onModuleDestroy() { this.close(); }
}
