import {
  Injectable, Logger, OnModuleDestroy, OnModuleInit,
} from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { loadPackageDefinition } from '@grpc/grpc-js';
import { join } from 'path';

@Injectable()
export class MikrotikGrpcClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MikrotikGrpcClient.name);
  private client: any = null;
  private creds: grpc.ChannelCredentials = grpc.credentials.createInsecure();
  private maxRetries = 6;
  private initialBackoffMs = 500;
  private backoffFactor = 2;
  private maxBackoffMs = 10000;
  private get address(): string { return process.env.MIKROTIK_GRPC_ADDR || 'localhost:50051'; }
  private get protoPath(): string { return process.env.ROUTER_PROTO_PATH || join(__dirname, '..', 'proto', 'router.proto'); }

  onModuleInit() { this.initClientOnce().catch((e) => { this.logger.warn(`[mikrotik-grpc] initial init failed (${e?.message || e}) — will retry on calls`); this.client = null; }); }
  private async initClientOnce(): Promise<void> {
    const packageDef = protoLoader.loadSync(this.protoPath, { keepCase: false, longs: String, enums: String, defaults: true, oneofs: true });
    const proto = loadPackageDefinition(packageDef) as any;
    const svc = proto.router?.RouterService;
    if (!svc) throw new Error('RouterService not found in proto');
    this.client = new svc(this.address, this.creds);
    await new Promise<void>((resolve, reject) => {
      const deadline = new Date(Date.now() + 3000);
      try { this.client.waitForReady(deadline, (err: any) => { if (err) { try { this.client.close(); } catch (_) {} this.client = null; reject(err); return; } this.logger.log(`[mikrotik-grpc] connected to ${this.address}`); resolve(); }); }
      catch (e) { try { this.client.close(); } catch (_) {} this.client = null; reject(e); }
    });
  }
  private sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
  private async ensureClientReady(): Promise<boolean> {
    if (this.client) return new Promise<boolean>((resolve) => { const deadline = new Date(Date.now() + 1000); try { this.client.waitForReady(deadline, (err: any) => { if (!err) return resolve(true); try { this.client.close(); } catch (_) {} this.client = null; resolve(false); }); } catch (_) { try { this.client.close(); } catch (_) {} this.client = null; resolve(false); } });
    let backoff = this.initialBackoffMs;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) { try { await this.initClientOnce(); return true; } catch (e: any) { this.logger.warn(`[mikrotik-grpc] connect attempt #${attempt + 1} to ${this.address} failed: ${e?.message || e}`); if (attempt === this.maxRetries - 1) break; await this.sleep(backoff); backoff = Math.min(backoff * this.backoffFactor, this.maxBackoffMs); } }
    return false;
  }
  onModuleDestroy() { if (this.client) { this.client.close(); this.client = null; } }

  testConnect(sessionId: string): Promise<{ success: boolean; identity?: string; error?: string }> { return this.call('TestConnect', { sessionId }, 15000); }
  private call(method: string, payload: any, timeoutMs = 15000): Promise<any> { return new Promise((resolve) => { (async () => { const ready = await this.ensureClientReady(); if (!ready) return resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` }); const deadline = new Date(Date.now() + timeoutMs); this.client[method](payload, { deadline }, (err: any, resp: any) => { if (err) return resolve({ success: false, error: `gRPC ${method} failed: ${err.message}` }); resolve(resp || { success: false, error: `empty ${method} response` }); }); })(); }); }

  listHotspotUsers(params: { sessionId: string; profile?: string; comment?: string }) { return this.call('ListHotspotUsers', { sessionId: params.sessionId, profile: params.profile || '', comment: params.comment || '' }, 30000).then((resp) => ({ success: !!resp?.success, users: resp?.users || [], error: resp?.error })); }
  removeHotspotUser(sessionId: string, name: string) { return this.call('RemoveHotspotUser', { sessionId, name }).then((resp) => ({ success: !!resp?.success, error: resp?.error })); }
  listSessions() { return this.call('ListSessions').then((resp) => ({ success: !!resp?.success, sessions: resp?.sessions || [], error: resp?.error })); }
  getSession(id: string) { return this.call('GetSession', { id }).then((resp) => ({ success: !!resp?.success, session: resp?.session, error: resp?.error })); }
  createSession(params: Record<string, any>) { return this.call('CreateSession', params).then((resp) => ({ success: !!resp?.success, session: resp?.session, error: resp?.error })); }
  updateSession(params: Record<string, any>) { return this.call('UpdateSession', params).then((resp) => ({ success: !!resp?.success, session: resp?.session, error: resp?.error })); }
  deleteSession(id: string) { return this.call('DeleteSession', { id }).then((resp) => ({ success: !!resp?.success, error: resp?.error })); }
  listSchedulers(sessionId: string) { return this.call('ListSchedulers', { sessionId }).then((resp) => ({ success: !!resp?.success, schedulers: resp?.schedulers || [], error: resp?.error })); }
  listLogs(sessionId: string, topics?: string) { return this.call('ListLogs', { sessionId, topics: topics || '' }).then((resp) => ({ success: !!resp?.success, logs: resp?.logs || [], error: resp?.error })); }
  listDhcpLeases(sessionId: string) { return this.call('ListDhcpLeases', { sessionId }).then((resp) => ({ success: !!resp?.success, leases: resp?.leases || [], error: resp?.error })); }
  listHotspotProfiles(sessionId: string) { return this.call('ListHotspotProfiles', { sessionId }).then((resp) => ({ success: !!resp?.success, profiles: resp?.profiles || [], error: resp?.error })); }
  getHotspotProfile(sessionId: string, name: string) { return this.call('GetHotspotProfile', { sessionId, name }).then((resp) => ({ success: !!resp?.success, profile: resp?.profile, error: resp?.error })); }
  addHotspotProfile(params: any) { return this.call('AddHotspotProfile', params).then((resp) => ({ success: !!resp?.success, error: resp?.error })); }
  updateHotspotProfile(params: any) { return this.call('UpdateHotspotProfile', params).then((resp) => ({ success: !!resp?.success, error: resp?.error })); }
  deleteHotspotProfile(sessionId: string, name: string) { return this.call('DeleteHotspotProfile', { sessionId, name }).then((resp) => ({ success: !!resp?.success, error: resp?.error })); }
  bulkRemoveHotspotUsers(sessionId: string, names: string[]) { return this.call('BulkRemoveHotspotUsers', { sessionId, names }, 30000).then((resp) => ({ success: !!resp?.success, removed: resp?.removed || 0, failedNames: resp?.failedNames || [], error: resp?.error })); }
  setupExpiryScheduler(sessionId: string) { return this.call('SetupExpiryScheduler', { sessionId }).then((resp) => ({ success: !!resp?.success, error: resp?.error })); }
  getDashboard(sessionId: string) { return this.call('GetDashboard', { sessionId }); }
  listActiveHotspotUsers(sessionId: string, server: string) { return this.call('ListActiveHotspotUsers', { sessionId, server }).then((resp) => ({ success: !!resp?.success, users: resp?.users || [], error: resp?.error })); }
  getSystemResource(sessionId: string) { return this.call('GetSystemResource', { sessionId }); }
  getInterfaces(sessionId: string) { return this.call('GetInterfaces', { sessionId }); }

  listPppSecrets(sessionId: string, profile?: string, name?: string) { return this.call('ListPppSecrets', { sessionId, profile: profile || '', name: name || '' }, 30000).then((resp) => ({ success: !!resp?.success, secrets: resp?.secrets || [], error: resp?.error })); }
  getPppSecret(sessionId: string, name: string) { return this.call('GetPppSecret', { sessionId, name }).then((resp) => ({ success: !!resp?.success, secret: resp?.secret, error: resp?.error })); }
  addPppSecret(params: any) { return this.call('AddPppSecret', params).then((resp) => ({ success: !!resp?.success, error: resp?.error })); }
  updatePppSecret(params: any) { return this.call('UpdatePppSecret', params).then((resp) => ({ success: !!resp?.success, error: resp?.error })); }
  deletePppSecret(sessionId: string, name: string) { return this.call('DeletePppSecret', { sessionId, name }).then((resp) => ({ success: !!resp?.success, error: resp?.error })); }
  enablePppSecret(sessionId: string, name: string) { return this.call('EnablePppSecret', { sessionId, name }).then((resp) => ({ success: !!resp?.success, error: resp?.error })); }
  disablePppSecret(sessionId: string, name: string) { return this.call('DisablePppSecret', { sessionId, name }).then((resp) => ({ success: !!resp?.success, error: resp?.error })); }
  listPppProfiles(sessionId: string) { return this.call('ListPppProfiles', { sessionId }).then((resp) => ({ success: !!resp?.success, profiles: resp?.profiles || [], error: resp?.error })); }
  addPppProfile(params: any) { return this.call('AddPppProfile', params).then((resp) => ({ success: !!resp?.success, error: resp?.error })); }
  updatePppProfile(params: any) { return this.call('UpdatePppProfile', params).then((resp) => ({ success: !!resp?.success, error: resp?.error })); }
  deletePppProfile(sessionId: string, name: string) { return this.call('DeletePppProfile', { sessionId, name }).then((resp) => ({ success: !!resp?.success, error: resp?.error })); }
  listPppActive(sessionId: string) { return this.call('ListPppActive', { sessionId }).then((resp) => ({ success: !!resp?.success, connections: resp?.connections || [], error: resp?.error })); }
  disconnectPppActive(sessionId: string, name: string) { return this.call('DisconnectPppActive', { sessionId, name }).then((resp) => ({ success: !!resp?.success, error: resp?.error })); }
  listPppPools(sessionId: string) { return this.call('ListPppPools', { sessionId }).then((resp) => ({ success: !!resp?.success, pools: resp?.pools || [], error: resp?.error })); }
}
