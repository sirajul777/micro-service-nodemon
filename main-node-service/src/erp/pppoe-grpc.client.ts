import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { credentials, loadPackageDefinition, ServiceError } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { existsSync } from 'fs';
import { join } from 'path';

@Injectable()
export class PppoeGrpcClient implements OnModuleDestroy {
  private readonly client: any;

  constructor() {
    const candidates = [
      process.env.MIKROTIK_GRPC_PROTO_PATH,
      join(process.cwd(), 'src', 'proto', 'router.proto'),
      join(process.cwd(), 'router-proto', 'router.proto'),
      '/app/router-proto/router.proto',
    ].filter(Boolean) as string[];

    const protoPath = candidates.find((path) => existsSync(path));
    if (!protoPath) {
      throw new Error(`Router gRPC proto not found; checked: ${candidates.join(', ')}`);
    }

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

  listProfiles(sessionId: string): Promise<{ success: boolean; profiles?: any[]; error?: string }> {
    return new Promise((resolve) => {
      const deadline = new Date(Date.now() + 30000);
      this.client.ListPppProfiles(
        { sessionId },
        { deadline },
        (err: ServiceError | null, response: any) => {
          if (err) {
            return resolve({
              success: false,
              error: `gRPC ListPppProfiles failed: ${err.message}`,
            });
          }
          if (!response?.success) {
            return resolve({
              success: false,
              error: response?.error || 'ListPppProfiles reported failure',
            });
          }
          resolve({
            success: true,
            profiles: response.profiles || [],
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
