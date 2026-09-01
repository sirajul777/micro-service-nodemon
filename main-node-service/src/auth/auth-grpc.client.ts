import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { credentials, loadPackageDefinition, ServiceError } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { existsSync } from 'fs';
import { join } from 'path';

@Injectable()
export class AuthGrpcClient implements OnModuleDestroy {
  private readonly client: any;
  constructor() {
    const candidates = [process.env.AUTH_GRPC_PROTO_PATH, join(process.cwd(), 'auth-proto', 'auth.proto'), join(process.cwd(), '..', 'auth-node-service', 'proto', 'auth.proto')].filter(Boolean) as string[];
    const protoPath = candidates.find((p) => existsSync(p));
    if (!protoPath) throw new Error(`Auth gRPC proto not found; checked: ${candidates.join(', ')}`);
    const pkg = loadPackageDefinition(loadSync(protoPath, { keepCase: false, longs: String, enums: String, defaults: true, oneofs: true })) as any;
    const Service = pkg.auth?.AuthService;
    if (!Service) throw new Error('AuthService gRPC definition not found');
    this.client = new Service(process.env.AUTH_GRPC_ADDR || 'auth-node-service:50052', credentials.createInsecure());
  }
  private call(method: string, request: Record<string, any>, timeoutMs = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const fn = this.client?.[method];
      if (typeof fn !== 'function') return reject(new Error(`gRPC method ${method} is not available`));
      fn.call(this.client, request, { deadline: new Date(Date.now() + timeoutMs) }, (err: ServiceError | null, response: any) => err ? reject(err) : resolve(response));
    });
  }
  login(username: string, password: string) { return this.call('Login', { username, password }); }
  validateToken(token: string) { return this.call('ValidateToken', { token }); }
  changePassword(token: string, oldPassword: string, newPassword: string) { return this.call('ChangePassword', { token, oldPassword, newPassword }, 10000); }
  listUsers() { return this.call('ListUsers', {}); }
  getUser(id: string) { return this.call('GetUser', { id }); }
  createUser(body: Record<string, any>) { return this.call('CreateUser', body, 10000); }
  updateUser(id: string, body: Record<string, any>) { return this.call('UpdateUser', { id, ...body }, 10000); }
  deleteUser(id: string) { return this.call('DeleteUser', { id }); }
  toggleUser(id: string) { return this.call('ToggleUser', { id }); }
  resetUserPassword(id: string, newPassword: string) { return this.call('ResetUserPassword', { id, newPassword }, 10000); }
  getRoleDefaults(role: string) { return this.call('GetRoleDefaults', { role }); }
  close() { this.client?.close?.(); }
  onModuleDestroy() { this.close(); }
}
