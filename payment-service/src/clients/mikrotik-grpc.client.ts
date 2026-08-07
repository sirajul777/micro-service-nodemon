import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { loadPackageDefinition } from '@grpc/grpc-js';
import { join } from 'path';

/**
 * gRPC client → mikrotik-go-service (RouterService).
 *
 * In the monolith `VoucherOrderService.settleOrder()` created the hotspot user
 * directly via `MikrotikService`. In microservices the router is owned by the
 * Go service, so we call its `AddHotspotUser` RPC synchronously — voucher
 * provisioning must succeed before we mark the order PAID (the same critical
 * path as the monolith).
 *
 * The proto is loaded from the shared `router.proto`. Path resolution: the
 * compiled output lives in `dist/`, and the proto is copied alongside during
 * build (see postbuild) or referenced from the repo root.
 *
 * If the Go service is unreachable, `addHotspotUser` throws so the caller can
 * roll the order back to 'pending' and alert the admin — never mark paid
 * without a working voucher.
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
        keepCase: true,
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
   * Create a hotspot user on the router via gRPC.
   * @throws if the Go service is unreachable or the RPC reports failure.
   */
  addHotspotUser(params: {
    sessionId: string;
    name: string;
    password: string;
    profile: string;
    comment?: string;
    limitUptime?: string;
  }): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('mikrotik gRPC client not initialized'));
        return;
      }
      const req = {
        sessionId: params.sessionId,
        name: params.name,
        password: params.password,
        profile: params.profile,
        comment: params.comment || '',
        limitUptime: params.limitUptime || '',
      };
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 15);
      this.client.AddHotspotUser(
        req,
        { deadline },
        (err: any, resp: any) => {
          if (err) {
            reject(new Error(`mikrotik gRPC AddHotspotUser failed: ${err.message}`));
            return;
          }
          if (!resp?.success) {
            reject(new Error(resp?.error || 'mikrotik AddHotspotUser reported failure'));
            return;
          }
          resolve({ success: true });
        },
      );
    });
  }
}
