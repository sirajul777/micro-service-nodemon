import { Injectable } from '@nestjs/common';
import { MikrotikGrpcClient } from './clients/mikrotik-grpc.client';

@Injectable()
export class ErpSessionStore {
  constructor(private readonly mikrotik: MikrotikGrpcClient) {}

  async list() {
    const resp = await this.mikrotik.listSessions();
    if (!resp.success) throw new Error(resp.error || 'Gagal memuat daftar router');
    return resp.sessions || [];
  }

  async get(id: string) {
    const resp = await this.mikrotik.getSession(id);
    if (!resp.success) return null;
    return resp.session || null;
  }
}
