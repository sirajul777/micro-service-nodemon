import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { credentials, loadPackageDefinition, ServiceError } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { existsSync } from 'fs';
import { join } from 'path';

@Injectable()
export class AuthGrpcClient implements OnModuleDestroy {
  private readonly client: any;

  constructor() {
    const candidates = [
      process.env.AUTH_GRPC_PROTO_PATH,
      join(process.cwd(), 'auth-proto', 'auth.proto'),
      join(process.cwd(), '..', 'auth-node-service', 'proto', 'auth.proto'),
      '/app/auth-proto/auth.proto',
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

  private call(method: string, request: Record<string, any>, timeoutMs = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const deadline = new Date(Date.now() + timeoutMs);
      const fn = this.client?.[method];
      if (typeof fn !== 'function') {
        return reject(new Error(`gRPC method ${method} is not available in AuthService`));
      }
      fn.call(this.client, request, { deadline }, (err: ServiceError | null, response: any) => {
        if (err) return reject(err);
        resolve(response);
      });
    });
  }

  login(username: string, password: string) {
    return this.call('Login', { username, password }, 10000);
  }

  validateToken(token: string) {
    return this.call('ValidateToken', { token }, 10000);
  }

  changePassword(token: string, oldPassword: string, newPassword: string) {
    return this.call('ChangePassword', { token, oldPassword, newPassword }, 10000);
  }

  close() {
    this.client?.close?.();
  }

  onModuleDestroy() {
    this.close();
  }
}
