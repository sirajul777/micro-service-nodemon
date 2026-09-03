import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { loadPackageDefinition } from '@grpc/grpc-js';
import { join } from 'path';

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
      join(__dirname, '..', 'proto', 'router.proto')
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

  private getClient(): any {
    if (!this.client) throw new Error('mikrotik gRPC client not initialized');
    return this.client;
  }

  listHotspotUsers(sessionId: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      try {
        const client = this.getClient();
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 20);
        client.ListHotspotUsers(
          { sessionId },
          { deadline },
          (err: any, resp: any) => {
            if (err) {
              reject(new Error(`mikrotik gRPC ListHotspotUsers failed: ${err.message}`));
              return;
            }
            if (!resp?.success) {
              reject(new Error(String(resp?.error || 'mikrotik ListHotspotUsers failed')));
              return;
            }
            resolve(Array.isArray(resp.users) ? resp.users : []);
          },
        );
      } catch (error: any) {
        reject(error);
      }
    });
  }

  listPppSecrets(sessionId: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      try {
        const client = this.getClient();
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 20);
        client.ListPppSecrets(
          { sessionId },
          { deadline },
          (err: any, resp: any) => {
            if (err) {
              reject(new Error(`mikrotik gRPC ListPppSecrets failed: ${err.message}`));
              return;
            }
            if (!resp?.success) {
              reject(new Error(String(resp?.error || 'mikrotik ListPppSecrets failed')));
              return;
            }
            resolve(Array.isArray(resp.secrets) ? resp.secrets : []);
          },
        );
      } catch (error: any) {
        reject(error);
      }
    });
  }

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
            const message = String(resp?.error || 'mikrotik AddHotspotUser reported failure');
            if (/already\s+(have|exists|exist)|already.*name|duplicate/i.test(message)) {
              this.logger.warn(
                `[mikrotik-grpc] AddHotspotUser reported existing user ${params.name}; treating as idempotent success`,
              );
              resolve({ success: true });
              return;
            }
            reject(new Error(message));
            return;
          }
          resolve({ success: true });
        },
      );
    });
  }

  private callSimple(
    method: string,
    sessionId: string,
    name: string,
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.client) {
        resolve({ success: false, error: 'mikrotik gRPC client not initialized' });
        return;
      }
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 15);
      this.client[method](
        { sessionId, name },
        { deadline },
        (err: any, resp: any) => {
          if (err) {
            resolve({ success: false, error: `mikrotik gRPC ${method} failed: ${err.message}` });
            return;
          }
          resolve({ success: !!resp?.success, error: resp?.success ? undefined : resp?.error });
        },
      );
    });
  }

  disableHotspotUser(sessionId: string, name: string) {
    return this.callSimple('DisableHotspotUser', sessionId, name);
  }

  enableHotspotUser(sessionId: string, name: string) {
    return this.callSimple('EnableHotspotUser', sessionId, name);
  }

  disablePppSecret(sessionId: string, name: string) {
    return this.callSimple('DisablePppSecret', sessionId, name);
  }

  enablePppSecret(sessionId: string, name: string) {
    return this.callSimple('EnablePppSecret', sessionId, name);
  }
}
