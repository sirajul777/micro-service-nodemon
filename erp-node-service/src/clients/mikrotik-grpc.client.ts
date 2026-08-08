import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { loadPackageDefinition } from '@grpc/grpc-js';
import { join } from 'path';

/**
 * gRPC client → mikrotik-go-service (RouterService).
 *
 * Provides typed access to MikroTik operations needed by the ERP service:
 *   - TestConnect (resolve session + test connectivity)
 *   - ListHotspotUsers (by profile/comment filter)
 *   - RemoveHotspotUser (delete a user from router)
 *   - ListHotspotProfiles (fetch profile metadata)
 *
 * Graceful degradation: if the Go service is unreachable, methods return
 * a clear error rather than crashing the caller.
 */
@Injectable()
export class MikrotikGrpcClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MikrotikGrpcClient.name);
  private client: any = null;
  private creds: grpc.ChannelCredentials = grpc.credentials.createInsecure();

  private get address(): string {
    return process.env.MIKROTIK_GRPC_ADDR || 'localhost:50051';
  }

  private get protoPath(): string {
    return (
      process.env.ROUTER_PROTO_PATH ||
      join(__dirname, '..', '..', 'proto', 'router.proto')
    );
  }

  onModuleInit() {
    try {
      const packageDef = protoLoader.loadSync(this.protoPath, {
        keepCase: false,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });
      const proto = loadPackageDefinition(packageDef) as any;
      const svc = proto.router?.RouterService;
      if (!svc) {
        this.logger.warn('[mikrotik-grpc] RouterService not found in proto');
        return;
      }
      this.client = new svc(this.address, this.creds);
      this.logger.log(`[mikrotik-grpc] connected to ${this.address}`);
    } catch (e: any) {
      this.logger.warn(`[mikrotik-grpc] init failed (${e.message}) — will retry per call`);
      this.client = null;
    }
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
  }

  /**
   * Test connectivity to a MikroTik router via the Go service.
   * Returns the router identity on success, or a clear error on failure.
   */
  testConnect(sessionId: string): Promise<{ success: boolean; identity?: string; error?: string }> {
    return new Promise((resolve) => {
      if (!this.client) {
        resolve({ success: false, error: 'mikrotik gRPC client not initialized' });
        return;
      }
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 15);
      this.client.TestConnect(
        { sessionId },
        { deadline },
        (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC TestConnect failed: ${err.message}` });
            return;
          }
          if (!resp?.success) {
            resolve({ success: false, error: resp?.error || 'TestConnect reported failure' });
            return;
          }
          resolve({ success: true, identity: resp.identity });
        },
      );
    });
  }

  /**
   * List hotspot users on a router, optionally filtered by profile and/or comment.
   */
  listHotspotUsers(params: {
    sessionId: string;
    profile?: string;
    comment?: string;
  }): Promise<{ success: boolean; users?: any[]; error?: string }> {
    return new Promise((resolve) => {
      if (!this.client) {
        resolve({ success: false, error: 'mikrotik gRPC client not initialized' });
        return;
      }
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 30);
      this.client.ListHotspotUsers(
        { sessionId: params.sessionId, profile: params.profile || '', comment: params.comment || '' },
        { deadline },
        (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC ListHotspotUsers failed: ${err.message}` });
            return;
          }
          resolve({ success: true, users: resp?.users || [] });
        },
      );
    });
  }

  /**
   * Remove a hotspot user from the router by name.
   */
  removeHotspotUser(sessionId: string, name: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.client) {
        resolve({ success: false, error: 'mikrotik gRPC client not initialized' });
        return;
      }
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 15);
      this.client.RemoveHotspotUser(
        { sessionId, name },
        { deadline },
        (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC RemoveHotspotUser failed: ${err.message}` });
            return;
          }
          if (!resp?.success) {
            resolve({ success: false, error: resp?.error || 'RemoveHotspotUser reported failure' });
            return;
          }
          resolve({ success: true });
        },
      );
    });
  }

  /**
   * List all router sessions (connection profiles). Passwords are never
   * returned by the Go service for list/get.
   */
  listSessions(): Promise<{ success: boolean; sessions?: any[]; error?: string }> {
    return new Promise((resolve) => {
      if (!this.client) {
        resolve({ success: false, error: 'mikrotik gRPC client not initialized' });
        return;
      }
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 15);
      this.client.ListSessions({}, { deadline }, (err: any, resp: any) => {
        if (err) {
          resolve({ success: false, error: `gRPC ListSessions failed: ${err.message}` });
          return;
        }
        if (!resp?.success) {
          resolve({ success: false, error: resp?.error || 'ListSessions reported failure' });
          return;
        }
        resolve({ success: true, sessions: resp.sessions || [] });
      });
    });
  }

  /**
   * Get a single router session by id (no password included).
   */
  getSession(id: string): Promise<{ success: boolean; session?: any; error?: string }> {
    return new Promise((resolve) => {
      if (!this.client) {
        resolve({ success: false, error: 'mikrotik gRPC client not initialized' });
        return;
      }
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 15);
      this.client.GetSession({ id }, { deadline }, (err: any, resp: any) => {
        if (err) {
          resolve({ success: false, error: `gRPC GetSession failed: ${err.message}` });
          return;
        }
        if (!resp?.success) {
          resolve({ success: false, error: resp?.error || 'Session tidak ditemukan' });
          return;
        }
        resolve({ success: true, session: resp.session });
      });
    });
  }

  /**
   * Create a new router session (connection profile).
   */
  createSession(params: Record<string, any>): Promise<{ success: boolean; session?: any; error?: string }> {
    return new Promise((resolve) => {
      if (!this.client) {
        resolve({ success: false, error: 'mikrotik gRPC client not initialized' });
        return;
      }
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 15);
      this.client.CreateSession(params, { deadline }, (err: any, resp: any) => {
        if (err) {
          resolve({ success: false, error: `gRPC CreateSession failed: ${err.message}` });
          return;
        }
        if (!resp?.success) {
          resolve({ success: false, error: resp?.error || 'CreateSession reported failure' });
          return;
        }
        resolve({ success: true, session: resp.session });
      });
    });
  }

  /**
   * Update an existing router session. Empty/omitted `password` keeps the
   * existing password (also honors the UI's "***" sentinel).
   */
  updateSession(params: Record<string, any>): Promise<{ success: boolean; session?: any; error?: string }> {
    return new Promise((resolve) => {
      if (!this.client) {
        resolve({ success: false, error: 'mikrotik gRPC client not initialized' });
        return;
      }
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 15);
      this.client.UpdateSession(params, { deadline }, (err: any, resp: any) => {
        if (err) {
          resolve({ success: false, error: `gRPC UpdateSession failed: ${err.message}` });
          return;
        }
        if (!resp?.success) {
          resolve({ success: false, error: resp?.error || 'UpdateSession reported failure' });
          return;
        }
        resolve({ success: true, session: resp.session });
      });
    });
  }

  /**
   * Delete a router session by id.
   */
  deleteSession(id: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.client) {
        resolve({ success: false, error: 'mikrotik gRPC client not initialized' });
        return;
      }
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 15);
      this.client.DeleteSession({ id }, { deadline }, (err: any, resp: any) => {
        if (err) {
          resolve({ success: false, error: `gRPC DeleteSession failed: ${err.message}` });
          return;
        }
        if (!resp?.success) {
          resolve({ success: false, error: resp?.error || 'DeleteSession reported failure' });
          return;
        }
        resolve({ success: true });
      });
    });
  }

  /**
   * List hotspot profiles on a router.
   */
  listHotspotProfiles(sessionId: string): Promise<{ success: boolean; profiles?: any[]; error?: string }> {
    return new Promise((resolve) => {
      if (!this.client) {
        resolve({ success: false, error: 'mikrotik gRPC client not initialized' });
        return;
      }
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 15);
      this.client.ListHotspotProfiles(
        { sessionId },
        { deadline },
        (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC ListHotspotProfiles failed: ${err.message}` });
            return;
          }
          resolve({ success: true, profiles: resp?.profiles || [] });
        },
      );
    });
  }
}
