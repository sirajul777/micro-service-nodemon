import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { credentials, loadPackageDefinition, ServiceError } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { existsSync } from 'fs';
import { join } from 'path';

@Injectable()
export class PaymentAuthGrpcClient implements OnModuleDestroy {
  private readonly client: any;

  constructor() {
    const candidates = [
      process.env.AUTH_GRPC_PROTO_PATH,
      join(process.cwd(), 'proto', 'auth.proto'),
      '/app/auth-proto/auth.proto',
      join(process.cwd(), '..', 'auth-node-service', 'proto', 'auth.proto'),
    ].filter(Boolean) as string[];
    const protoPath = candidates.find((path) => existsSync(path));
    if (!protoPath) throw new Error(`Auth gRPC proto not found; checked: ${candidates.join(', ')}`);
    const packageDef = loadSync(protoPath, {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const pkg = loadPackageDefinition(packageDef) as any;
    const Service = pkg.auth?.AuthService;
    if (!Service) throw new Error('AuthService gRPC definition not found');

    this.client = new Service(
      process.env.AUTH_GRPC_ADDR || 'auth-node-service:50052',
      credentials.createInsecure(),
    );
  }

  validateToken(token: string) {
    return new Promise<any>((resolve, reject) => {
      const deadline = new Date(Date.now() + 5000);
      this.client.ValidateToken({ token }, { deadline }, (err: ServiceError | null, response: any) => {
        if (err) return reject(err);
        resolve(response);
      });
    });
  }

  close() {
    this.client?.close?.();
  }

  onModuleDestroy() {
    this.close();
  }
}
