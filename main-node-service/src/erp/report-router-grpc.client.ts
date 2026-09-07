import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { credentials, loadPackageDefinition, ServiceError } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { existsSync } from 'fs';
import { join } from 'path';

@Injectable()
export class ReportRouterGrpcClient implements OnModuleDestroy {
  private readonly client: any;

  constructor() {
    const candidates = [
      process.env.REPORT_ROUTER_PROTO_PATH,
      join(process.cwd(), 'src', 'proto', 'report_router.proto'),
      join(process.cwd(), 'router-proto', 'report_router.proto'),
      '/app/router-proto/report_router.proto',
    ].filter(Boolean) as string[];
    const protoPath = candidates.find((path) => existsSync(path));
    if (!protoPath) throw new Error(`Report Router gRPC proto not found; checked: ${candidates.join(', ')}`);

    const definition = loadSync(protoPath, {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const pkg = loadPackageDefinition(definition) as any;
    const Service = pkg.report?.router?.ReportRouterService;
    if (!Service) throw new Error('ReportRouterService gRPC definition not found');

    this.client = new Service(
      process.env.MIKROTIK_GRPC_ADDR || process.env.MIKROTIK_GRPC_SERVER || 'mikrotik-go-service:50051',
      credentials.createInsecure(),
    );
  }

  listSellingScripts(sessionId: string, idhr = '', idbl = '') {
    return new Promise<any>((resolve, reject) => {
      const deadline = new Date(Date.now() + 90000);
      this.client.ListSellingScripts({ sessionId, idhr, idbl }, { deadline }, (err: ServiceError | null, response: any) => {
        if (err) return reject(err);
        resolve(response);
      });
    });
  }

  close() { this.client?.close?.(); }
  onModuleDestroy() { this.close(); }
}
