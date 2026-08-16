import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { credentials, loadPackageDefinition, ServiceError } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { existsSync } from 'fs';
import { join } from 'path';

@Injectable()
export class ErpDashboardGrpcClient implements OnModuleDestroy {
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

    const packageDef = loadSync(protoPath, {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const pkg = loadPackageDefinition(packageDef) as any;
    const Service = pkg.router?.RouterService;
    if (!Service) throw new Error('RouterService gRPC definition not found');

    this.client = new Service(
      process.env.MIKROTIK_GRPC_SERVER || process.env.MIKROTIK_GRPC_ADDR || 'mikrotik-go-service:50051',
      credentials.createInsecure(),
    );
  }

  private call(method: string, request: Record<string, any>, timeoutMs = 15000): Promise<any> {
    return new Promise((resolve, reject) => {
      const deadline = new Date(Date.now() + timeoutMs);
      const fn = this.client?.[method];
      if (typeof fn !== 'function') return reject(new Error(`gRPC method ${method} is not available in RouterService`));
      fn.call(this.client, request, { deadline }, (err: ServiceError | null, response: any) => {
        if (err) return reject(err);
        resolve(response);
      });
    });
  }

  getDashboard(sessionId: string) { return this.call('GetDashboard', { sessionId }, 30000); }
  listPppSecrets(sessionId: string, profile = '', name = '') { return this.call('ListPppSecrets', { sessionId, profile, name }, 30000); }
  getPppSecret(sessionId: string, name: string) { return this.call('GetPppSecret', { sessionId, name }, 15000); }
  listPppActive(sessionId: string) { return this.call('ListPppActive', { sessionId }, 30000); }
  listLogs(sessionId: string, topics = '') { return this.call('ListLogs', { sessionId, topics }, 15000); }
  getSystemResource(sessionId: string) { return this.call('GetSystemResource', { sessionId }, 15000); }
  getInterfaces(sessionId: string) { return this.call('GetInterfaces', { sessionId }, 15000); }

  addPppSecret(params: Record<string, any>) { return this.call('AddPppSecret', params, 15000); }
  updatePppSecret(params: Record<string, any>) { return this.call('UpdatePppSecret', params, 15000); }
  deletePppSecret(sessionId: string, name: string) { return this.call('DeletePppSecret', { sessionId, name }, 15000); }
  disconnectPppActive(sessionId: string, name: string) { return this.call('DisconnectPppActive', { sessionId, name }, 15000); }
  addPppProfile(params: Record<string, any>) { return this.call('AddPppProfile', params, 15000); }
  updatePppProfile(params: Record<string, any>) { return this.call('UpdatePppProfile', params, 15000); }
  deletePppProfile(sessionId: string, name: string) { return this.call('DeletePppProfile', { sessionId, name }, 15000); }

  close() { this.client?.close?.(); }
  onModuleDestroy() { this.close(); }
}
