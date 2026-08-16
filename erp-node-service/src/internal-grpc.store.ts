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

  async create(request: Record<string, any>) {
    const id = String(request.id || '').trim();
    const name = String(request.name || '').trim();
    const ip = String(request.ip || '').trim();
    const password = String(request.password || '').trim();
    if (!id || !name || !ip) return { success: false, error: 'id, name, dan ip wajib diisi' };
    if (!password) return { success: false, error: 'password wajib diisi' };
    const existing = await this.mikrotik.getSession(id);
    if (existing.success) return { success: false, error: 'session id sudah digunakan' };
    const resp = await this.mikrotik.createSession({
      id, name, ip, port: Number(request.port) || 0, user: String(request.user || ''), password,
      hotspotName: String(request.hotspotName || request.hotspot_name || ''),
      dnsName: String(request.dnsName || request.dns_name || ''), currency: String(request.currency || ''),
      reloadInterval: Number(request.reloadInterval ?? request.reload_interval) || 0,
      iface: String(request.iface || ''), idleTo: Number(request.idleTo ?? request.idle_to) || 0,
      livereport: String(request.livereport || ''),
    });
    return { success: !!resp.success, error: resp.error, session: resp.session };
  }

  async update(request: Record<string, any>) {
    const id = String(request.id || '').trim();
    const name = String(request.name || '').trim();
    const ip = String(request.ip || '').trim();
    if (!id || !name || !ip) return { success: false, error: 'id, name, dan ip wajib diisi' };
    const existing = await this.mikrotik.getSession(id);
    if (!existing.success) return { success: false, error: 'router session tidak ditemukan' };
    const resp = await this.mikrotik.updateSession({
      id, name, ip, port: Number(request.port) || 0, user: String(request.user || ''), password: String(request.password || ''),
      hotspotName: String(request.hotspotName || request.hotspot_name || ''),
      dnsName: String(request.dnsName || request.dns_name || ''), currency: String(request.currency || ''),
      reloadInterval: Number(request.reloadInterval ?? request.reload_interval) || 0,
      iface: String(request.iface || ''), idleTo: Number(request.idleTo ?? request.idle_to) || 0,
      livereport: String(request.livereport || ''),
    });
    return { success: !!resp.success, error: resp.error, session: resp.session };
  }

  async remove(id: string) {
    const value = String(id || '').trim();
    if (!value) return { success: false, error: 'id wajib diisi' };
    const resp = await this.mikrotik.deleteSession(value);
    return { success: !!resp.success, error: resp.error };
  }
}
