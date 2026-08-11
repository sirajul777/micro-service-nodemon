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
  private protoLoaded = false;

  // Retry/backoff configuration
  private maxRetries = 6;
  private initialBackoffMs = 500; // 0.5s
  private backoffFactor = 2;
  private maxBackoffMs = 10000; // 10s

  private get address(): string {
    return process.env.MIKROTIK_GRPC_ADDR || 'localhost:50051';
  }

  private get protoPath(): string {
    // Compiled location is dist/clients/mikrotik-grpc.client.js, and
    // `npm run build` copies the proto to dist/proto/router.proto (see
    // package.json's copy:proto script) — so this only needs to go up ONE
    // level (dist/clients → dist), not two. The previous '..', '..' landed
    // at /app/proto/router.proto (outside dist/ entirely, and never
    // copied into the Docker runtime image, which only COPYs dist/), which
    // is what caused the "ENOENT ... /app/proto/router.proto" warning and
    // every gRPC call (including the /api/sessions endpoints) failing.
    return (
      process.env.ROUTER_PROTO_PATH ||
      join(__dirname, '..', 'proto', 'router.proto')
    );
  }

  onModuleInit() {
    // Try a single immediate init; if it fails we'll retry on demand per-call.
    this.initClientOnce().catch((e) => {
      this.logger.warn(`[mikrotik-grpc] initial init failed (${e?.message || e}) — will retry on calls`);
      this.client = null;
    });
  }

  private async initClientOnce(): Promise<void> {
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
      throw new Error('RouterService not found in proto');
    }
    this.client = new svc(this.address, this.creds);
    // waitForReady verifies connectivity; give a short timeout for init
    await new Promise<void>((resolve, reject) => {
      const deadline = new Date(Date.now() + 3000);
      try {
        this.client.waitForReady(deadline, (err: any) => {
          if (err) {
            try { this.client.close(); } catch (_) {}
            this.client = null;
            reject(err);
            return;
          }
          this.logger.log(`[mikrotik-grpc] connected to ${this.address}`);
          resolve();
        });
      } catch (e) {
        try { this.client.close(); } catch (_) {}
        this.client = null;
        reject(e);
      }
    });
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  private async ensureClientReady(): Promise<boolean> {
    if (this.client) {
      // quick readiness check
      return new Promise<boolean>((resolve) => {
        const deadline = new Date(Date.now() + 1000);
        try {
          this.client.waitForReady(deadline, (err: any) => {
            if (!err) return resolve(true);
            try { this.client.close(); } catch (_) {}
            this.client = null;
            resolve(false);
          });
        } catch (e) {
          try { this.client.close(); } catch (_) {}
          this.client = null;
          resolve(false);
        }
      });
    }

    // attempt to init with exponential backoff
    let backoff = this.initialBackoffMs;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        await this.initClientOnce();
        return true;
      } catch (e: any) {
        this.logger.warn(`[mikrotik-grpc] connect attempt #${attempt + 1} to ${this.address} failed: ${e?.message || e}`);
        if (attempt === this.maxRetries - 1) break;
        await this.sleep(backoff);
        backoff = Math.min(backoff * this.backoffFactor, this.maxBackoffMs);
      }
    }
    return false;
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
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.TestConnect({ sessionId }, { deadline }, (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC TestConnect failed: ${err.message}` });
            return;
          }
          if (!resp?.success) {
            resolve({ success: false, error: resp?.error || 'TestConnect reported failure' });
            return;
          }
          resolve({ success: true, identity: resp.identity });
        });
      })();
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
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 30);
        this.client.ListHotspotUsers({ sessionId: params.sessionId, profile: params.profile || '', comment: params.comment || '' }, { deadline }, (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC ListHotspotUsers failed: ${err.message}` });
            return;
          }
          resolve({ success: true, users: resp?.users || [] });
        });
      })();
    });
  }

  /**
   * Remove a hotspot user from the router by name.
   */
  removeHotspotUser(sessionId: string, name: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.RemoveHotspotUser({ sessionId, name }, { deadline }, (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC RemoveHotspotUser failed: ${err.message}` });
            return;
          }
          if (!resp?.success) {
            resolve({ success: false, error: resp?.error || 'RemoveHotspotUser reported failure' });
            return;
          }
          resolve({ success: true });
        });
      })();
    });
  }

  /**
   * List all router sessions (connection profiles). Passwords are never
   * returned by the Go service for list/get.
   */
  listSessions(): Promise<{ success: boolean; sessions?: any[]; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
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
      })();
    });
  }

  /**
   * Get a single router session by id (no password included).
   */
  getSession(id: string): Promise<{ success: boolean; session?: any; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
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
      })();
    });
  }

  /**
   * Create a new router session (connection profile).
   */
  createSession(params: Record<string, any>): Promise<{ success: boolean; session?: any; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
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
      })();
    });
  }

  /**
   * Update an existing router session. Empty/omitted `password` keeps the
   * existing password (also honors the UI's "***" sentinel).
   */
  updateSession(params: Record<string, any>): Promise<{ success: boolean; session?: any; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
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
      })();
    });
  }

  /**
   * Delete a router session by id.
   */
  deleteSession(id: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
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
      })();
    });
  }

/**
   * List hotspot profiles on a router.
   */
  listHotspotProfiles(sessionId: string): Promise<{ success: boolean; profiles?: any[]; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.ListHotspotProfiles({ sessionId }, { deadline }, (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC ListHotspotProfiles failed: ${err.message}` });
            return;
          }
          resolve({ success: true, profiles: resp?.profiles || [] });
        });
      })();
    });
  }

  /**
   * Get a single hotspot profile by name.
   */
  getHotspotProfile(sessionId: string, name: string): Promise<{ success: boolean; profile?: any; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.GetHotspotProfile({ sessionId, name }, { deadline }, (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC GetHotspotProfile failed: ${err.message}` });
            return;
          }
          if (!resp?.success) {
            resolve({ success: false, error: resp?.error || 'Profile tidak ditemukan' });
            return;
          }
          resolve({ success: true, profile: resp.profile });
        });
      })();
    });
  }

  addHotspotProfile(params: {
    sessionId: string;
    name: string;
    onLogin?: string;
    sessionTimeout?: string;
    idleTimeout?: string;
    rateLimit?: string;
    sharedUsers?: string;
    addressPool?: string;
  }): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.AddHotspotProfile(
          {
            sessionId: params.sessionId,
            name: params.name,
            onLogin: params.onLogin || '',
            sessionTimeout: params.sessionTimeout || '',
            idleTimeout: params.idleTimeout || '',
            rateLimit: params.rateLimit || '',
            sharedUsers: params.sharedUsers || '',
            addressPool: params.addressPool || '',
          },
          { deadline },
          (err: any, resp: any) => {
            if (err) {
              resolve({ success: false, error: `gRPC AddHotspotProfile failed: ${err.message}` });
              return;
            }
            resolve({ success: !!resp?.success, error: resp?.success ? undefined : resp?.error });
          },
        );
      })();
    });
  }

  updateHotspotProfile(params: {
    sessionId: string;
    name: string;
    onLogin?: string;
    sessionTimeout?: string;
    idleTimeout?: string;
    rateLimit?: string;
    sharedUsers?: string;
    addressPool?: string;
  }): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.UpdateHotspotProfile(
          {
            sessionId: params.sessionId,
            name: params.name,
            onLogin: params.onLogin || '',
            sessionTimeout: params.sessionTimeout || '',
            idleTimeout: params.idleTimeout || '',
            rateLimit: params.rateLimit || '',
            sharedUsers: params.sharedUsers || '',
            addressPool: params.addressPool || '',
          },
          { deadline },
          (err: any, resp: any) => {
            if (err) {
              resolve({ success: false, error: `gRPC UpdateHotspotProfile failed: ${err.message}` });
              return;
            }
            resolve({ success: !!resp?.success, error: resp?.success ? undefined : resp?.error });
          },
        );
      })();
    });
  }

  deleteHotspotProfile(sessionId: string, name: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.DeleteHotspotProfile({ sessionId, name }, { deadline }, (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC DeleteHotspotProfile failed: ${err.message}` });
            return;
          }
          resolve({ success: !!resp?.success, error: resp?.success ? undefined : resp?.error });
        });
      })();
    });
  }

  bulkRemoveHotspotUsers(
    sessionId: string,
    names: string[],
  ): Promise<{ success: boolean; removed?: number; failedNames?: string[]; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 30);
        this.client.BulkRemoveHotspotUsers({ sessionId, names }, { deadline }, (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC BulkRemoveHotspotUsers failed: ${err.message}` });
            return;
          }
          resolve({
            success: !!resp?.success,
            removed: resp?.removed || 0,
            failedNames: resp?.failedNames || [],
            error: resp?.error,
          });
        });
      })();
    });
  }

  /** Fire-and-forget-ish: caller doesn't need to block the response on this. */
  setupExpiryScheduler(sessionId: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.SetupExpiryScheduler({ sessionId }, { deadline }, (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC SetupExpiryScheduler failed: ${err.message}` });
            return;
          }
          resolve({ success: !!resp?.success, error: resp?.success ? undefined : resp?.error });
        });
      })();
    });
  }

  /**
   * Fetch the router dashboard summary.
   */
  getDashboard(sessionId: string): Promise<{ success: boolean; error?: string; [k: string]: any }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.GetDashboard({ sessionId }, { deadline }, (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC GetDashboard failed: ${err.message}` });
            return;
          }
          resolve(resp || { success: false, error: 'empty response' });
        });
      })();
    });
  }

  /**
   * List currently-active hotspot users (sessions on the router).
   */
  listActiveHotspotUsers(sessionId: string, server: string): Promise<{ success: boolean; users?: any[]; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.ListActiveHotspotUsers({ sessionId, server }, { deadline }, (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC ListActiveHotspotUsers failed: ${err.message}` });
            return;
          }
          resolve({ success: true, users: resp?.users || [] });
        });
      })();
    });
  }

  /**
   * Add a hotspot user to the router.
   */
  addHotspotUser(params: {
    sessionId: string;
    name: string;
    password: string;
    profile: string;
    comment: string;
    limitUptime: string;
  }): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.AddHotspotUser(
          {
            sessionId: params.sessionId,
            name: params.name,
            password: params.password,
            profile: params.profile,
            comment: params.comment,
            limitUptime: params.limitUptime,
          },
          { deadline },
          (err: any, resp: any) => {
            if (err) {
              resolve({ success: false, error: `gRPC AddHotspotUser failed: ${err.message}` });
              return;
            }
            resolve({ success: resp?.success, error: resp?.error });
          },
        );
      })();
    });
  }

  /**
   * Fetch the router system resource (CPU, memory, HDD, uptime).
   */
  getSystemResource(sessionId: string): Promise<{ success: boolean; error?: string; [k: string]: any }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.GetSystemResource({ sessionId }, { deadline }, (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC GetSystemResource failed: ${err.message}` });
            return;
          }
          resolve(resp || { success: false, error: 'empty response' });
        });
      })();
    });
  }

/**
   * List router interfaces.
   */
  getInterfaces(sessionId: string): Promise<{ success: boolean; interfaces?: any[]; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.GetInterfaces({ sessionId }, { deadline }, (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC GetInterfaces failed: ${err.message}` });
            return;
          }
          resolve({ success: true, interfaces: resp?.interfaces || [] });
        });
      })();
    });
  }

  /**
   * List PPPoE secrets on a router, optionally filtered by profile/name.
   */
  listPppSecrets(sessionId: string, profile?: string, name?: string): Promise<{ success: boolean; secrets?: any[]; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 30);
        this.client.ListPppSecrets({ sessionId, profile: profile || '', name: name || '' }, { deadline }, (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC ListPppSecrets failed: ${err.message}` });
            return;
          }
          resolve({ success: resp?.success, secrets: resp?.secrets || [], error: resp?.error });
        });
      })();
    });
  }

  /**
   * Get a single PPPoE secret by name.
   */
  getPppSecret(sessionId: string, name: string): Promise<{ success: boolean; secret?: any; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.GetPppSecret({ sessionId, name }, { deadline }, (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC GetPppSecret failed: ${err.message}` });
            return;
          }
          resolve({ success: resp?.success, secret: resp?.secret, error: resp?.error });
        });
      })();
    });
  }

  /**
   * Add a new PPPoE secret to the router.
   */
  addPppSecret(params: {
    sessionId: string;
    name: string;
    password: string;
    service?: string;
    profile?: string;
    localAddress?: string;
    remoteAddress?: string;
    comment?: string;
  }): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.AddPppSecret(
          {
            sessionId: params.sessionId,
            name: params.name,
            password: params.password,
            service: params.service || '',
            profile: params.profile || '',
            localAddress: params.localAddress || '',
            remoteAddress: params.remoteAddress || '',
            comment: params.comment || '',
          },
          { deadline },
          (err: any, resp: any) => {
            if (err) {
              resolve({ success: false, error: `gRPC AddPppSecret failed: ${err.message}` });
              return;
            }
            resolve({ success: resp?.success, error: resp?.error });
          },
        );
      })();
    });
  }

  /**
   * Update an existing PPPoE secret on the router.
   */
  updatePppSecret(params: {
    sessionId: string;
    name: string;
    password?: string;
    service?: string;
    profile?: string;
    localAddress?: string;
    remoteAddress?: string;
    comment?: string;
  }): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.UpdatePppSecret(
          {
            sessionId: params.sessionId,
            name: params.name,
            password: params.password || '',
            service: params.service || '',
            profile: params.profile || '',
            localAddress: params.localAddress || '',
            remoteAddress: params.remoteAddress || '',
            comment: params.comment || '',
          },
          { deadline },
          (err: any, resp: any) => {
            if (err) {
              resolve({ success: false, error: `gRPC UpdatePppSecret failed: ${err.message}` });
              return;
            }
            resolve({ success: resp?.success, error: resp?.error });
          },
        );
      })();
    });
  }

  /**
   * Delete a PPPoE secret from the router by name.
   */
  deletePppSecret(sessionId: string, name: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.DeletePppSecret({ sessionId, name }, { deadline }, (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC DeletePppSecret failed: ${err.message}` });
            return;
          }
          resolve({ success: resp?.success, error: resp?.error });
        });
      })();
    });
  }

  /**
   * Enable a PPPoE secret on the router.
   */
  enablePppSecret(sessionId: string, name: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.EnablePppSecret({ sessionId, name }, { deadline }, (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC EnablePppSecret failed: ${err.message}` });
            return;
          }
          resolve({ success: resp?.success, error: resp?.error });
        });
      })();
    });
  }

  /**
   * Disable a PPPoE secret on the router.
   */
  disablePppSecret(sessionId: string, name: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.DisablePppSecret({ sessionId, name }, { deadline }, (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC DisablePppSecret failed: ${err.message}` });
            return;
          }
          resolve({ success: resp?.success, error: resp?.error });
        });
      })();
    });
  }

  /**
   * List PPPoE profiles on a router.
   */
  listPppProfiles(sessionId: string): Promise<{ success: boolean; profiles?: any[]; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.ListPppProfiles({ sessionId }, { deadline }, (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC ListPppProfiles failed: ${err.message}` });
            return;
          }
          resolve({ success: resp?.success, profiles: resp?.profiles || [], error: resp?.error });
        });
      })();
    });
  }

  /**
   * Add a PPPoE profile on the router.
   */
  addPppProfile(params: {
    sessionId: string;
    name: string;
    localAddress?: string;
    remoteAddress?: string;
    dns?: string;
    rateLimit?: string;
    bridge?: string;
    onlyOne?: string;
    changeTcpMss?: string;
  }): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.AddPppProfile(
          {
            sessionId: params.sessionId,
            name: params.name,
            localAddress: params.localAddress || '',
            remoteAddress: params.remoteAddress || '',
            dns: params.dns || '',
            rateLimit: params.rateLimit || '',
            bridge: params.bridge || '',
            onlyOne: params.onlyOne || '',
            changeTcpMss: params.changeTcpMss || '',
          },
          { deadline },
          (err: any, resp: any) => {
            if (err) {
              resolve({ success: false, error: `gRPC AddPppProfile failed: ${err.message}` });
              return;
            }
            resolve({ success: resp?.success, error: resp?.error });
          },
        );
      })();
    });
  }

  /**
   * Update a PPPoE profile on the router.
   */
  updatePppProfile(params: {
    sessionId: string;
    name: string;
    localAddress?: string;
    remoteAddress?: string;
    dns?: string;
    rateLimit?: string;
    bridge?: string;
    onlyOne?: string;
    changeTcpMss?: string;
  }): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.UpdatePppProfile(
          {
            sessionId: params.sessionId,
            name: params.name,
            localAddress: params.localAddress || '',
            remoteAddress: params.remoteAddress || '',
            dns: params.dns || '',
            rateLimit: params.rateLimit || '',
            bridge: params.bridge || '',
            onlyOne: params.onlyOne || '',
            changeTcpMss: params.changeTcpMss || '',
          },
          { deadline },
          (err: any, resp: any) => {
            if (err) {
              resolve({ success: false, error: `gRPC UpdatePppProfile failed: ${err.message}` });
              return;
            }
            resolve({ success: resp?.success, error: resp?.error });
          },
        );
      })();
    });
  }

  /**
   * Delete a PPPoE profile from the router by name.
   */
  deletePppProfile(sessionId: string, name: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.DeletePppProfile({ sessionId, name }, { deadline }, (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC DeletePppProfile failed: ${err.message}` });
            return;
          }
          resolve({ success: resp?.success, error: resp?.error });
        });
      })();
    });
  }

  /**
   * List currently-active PPPoE connections on the router.
   */
  listPppActive(sessionId: string): Promise<{ success: boolean; connections?: any[]; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.ListPppActive({ sessionId }, { deadline }, (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC ListPppActive failed: ${err.message}` });
            return;
          }
          resolve({ success: resp?.success, connections: resp?.connections || [], error: resp?.error });
        });
      })();
    });
  }

  /**
   * Disconnect a PPPoE active connection by name.
   */
  disconnectPppActive(sessionId: string, name: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.DisconnectPppActive({ sessionId, name }, { deadline }, (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC DisconnectPppActive failed: ${err.message}` });
            return;
          }
          resolve({ success: resp?.success, error: resp?.error });
        });
      })();
    });
  }

  /**
   * List PPPoE address pools (IP pools) on the router.
   */
  listPppPools(sessionId: string): Promise<{ success: boolean; pools?: any[]; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.ListPppPools({ sessionId }, { deadline }, (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC ListPppPools failed: ${err.message}` });
            return;
          }
          resolve({ success: resp?.success, pools: resp?.pools || [], error: resp?.error });
        });
      })();
    });
  }
}
