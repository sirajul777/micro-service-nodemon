import { GrpcMethod } from '@nestjs/microservices';
import { ErpSessionStore } from './internal-grpc.store';

export class InternalGrpcController {
  constructor(private readonly store: ErpSessionStore) {}

  @GrpcMethod('ErpInternalService', 'ListSessions')
  async listSessions() {
    const sessions = await this.store.list();
    return { success: true, sessions };
  }

  @GrpcMethod('ErpInternalService', 'GetSession')
  async getSession(request: { id: string }) {
    const session = await this.store.get(request.id);
    if (!session) return { success: false, error: 'router session tidak ditemukan' };
    return { success: true, session };
  }

  @GrpcMethod('ErpInternalService', 'CreateSession')
  async createSession(request: Record<string, any>) {
    return this.store.create(request);
  }

  @GrpcMethod('ErpInternalService', 'UpdateSession')
  async updateSession(request: Record<string, any>) {
    return this.store.update(request);
  }

  @GrpcMethod('ErpInternalService', 'DeleteSession')
  async deleteSession(request: { id: string }) {
    return this.store.remove(request.id);
  }
}
