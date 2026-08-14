import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
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

  private get address(): string {
    return process.env.MIKROTIK_GRPC_ADDR || 'localhost:50051';
  }

  private get protoPath(): string {
    return process.env.ROUTER_PROTO_PATH || join(__dirname, '..', 'proto', 'router.proto');
  }

  onModuleInit() {
    this.initClientOnce().catch((e) => {
      this.logger.warn(`[mikrotik-grpc] initial init failed (${e?.message || e})`);
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
    if (!svc) throw new Error('RouterService not found in proto');
    this.client = new svc(this.address, this.creds);
    await new Promise<void>((resolve, reject) => {
      const deadline = new Date(Date.now() + 3000);
      this.client.waitForReady(deadline, (err: any) => {
        if (err) {
          try { this.client.close(); } catch (_) {}
          this.client = null;
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  private async ensureClientReady(): Promise<boolean> {
    if (this.client) {
      return new Promise<boolean>((resolve) => {
        const deadline = new Date(Date.now() + 1000);
        this.client.waitForReady(deadline, (err: any) => {
          if (!err) return resolve(true);
          try { this.client.close(); } catch (_) {}
          this.client = null;
          resolve(false);
        });
      });
    }
    let backoff = this.initialBackoffMs;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        await this.initClientOnce();
        return true;
      } catch (e: any) {
        this.logger.warn(`[mikrotik-grpc] connect attempt #${attempt + 1} failed: ${e?.message || e}`);
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

  listSchedulers(sessionId: string): Promise<{ success: boolean; schedulers?: any[]; error?: string }> {
    return new Promise((resolve) => {
      (async () => {
        const ready = await this.ensureClientReady();
        if (!ready) {
          resolve({ success: false, error: `mikrotik gRPC client not initialized (target ${this.address})` });
          return;
        }
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 15);
        this.client.ListSchedulers({ sessionId }, { deadline }, (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `gRPC ListSchedulers failed: ${err.message}` });
            return;
          }
          if (!resp?.success) {
            resolve({ success: false, error: resp?.error || 'ListSchedulers reported failure' });
            return;
          }
          resolve({ success: true, schedulers: resp.schedulers || [] });
        });
      })();
    });
  }

  // Existing methods remain below in the original implementation.
}
