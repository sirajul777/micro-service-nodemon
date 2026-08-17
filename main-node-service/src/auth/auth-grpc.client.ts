import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { credentials, loadPackageDefinition, ServiceError } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { join } from 'path';

@Injectable()
export class AuthGrpcClient implements OnModuleDestroy {
  private readonly client: any;

  constructor() {
    const protoPath = process.env.AUTH_GRPC_PROTO_PATH || join(process.cwd(), '..', 'auth-node-service', 'proto', 'auth.proto');
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
      this.client[method](request, { deadline }, (err: ServiceError | null, response: any) => {
        if (err) return reject(err);
        resolve(response);
      });
    });
  }

  login(username: string, password: string) {
    return this.call('Login', { username, password });
  }

  validateToken(token: string) {
    return this.call('ValidateToken', { token });
  }

  changePassword(token: string, oldPassword: string, newPassword: string) {
    return this.call('ChangePassword', {
      token,
      oldPassword,
      newPassword,
    });
  }

  close() {
    this.client?.close?.();
  }

  onModuleDestroy() {
    this.close();
  }
}
