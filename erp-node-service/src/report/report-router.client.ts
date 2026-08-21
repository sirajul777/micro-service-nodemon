import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { loadPackageDefinition } from '@grpc/grpc-js';
import { existsSync } from 'fs';
import { join } from 'path';

export interface ReportScript {
  id: string;
  name: string;
  owner: string;
  comment: string;
}

export class ReportRouterClient {
  private readonly client: any;
  private readonly routerClient: any;

  constructor() {
    const reportProtoPath = process.env.REPORT_ROUTER_PROTO_PATH || join(__dirname, '..', 'proto', 'report_router.proto');
    const reportPackageDef = protoLoader.loadSync(reportProtoPath, {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const reportProto = loadPackageDefinition(reportPackageDef) as any;
    const ReportService = reportProto.report?.router?.ReportRouterService;
    if (!ReportService) throw new Error('ReportRouterService not found in proto');

    const addr = process.env.MIKROTIK_GRPC_ADDR || 'localhost:50051';
    this.client = new ReportService(addr, grpc.credentials.createInsecure());

    // DeleteSellingScripts remains part of RouterService for backwards compatibility.
    // Reads for live-report use the dedicated ReportRouterService above.
    const routerProtoCandidates = [
      process.env.ROUTER_PROTO_PATH,
      join(__dirname, '..', 'proto', 'router.proto'),
      '/app/proto/router.proto',
    ].filter(Boolean) as string[];
    const routerProtoPath = routerProtoCandidates.find((path) => existsSync(path));
    if (!routerProtoPath) throw new Error(`Router gRPC proto not found; checked: ${routerProtoCandidates.join(', ')}`);
    const routerPackageDef = protoLoader.loadSync(routerProtoPath, {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const routerProto = loadPackageDefinition(routerPackageDef) as any;
    const RouterService = routerProto.router?.RouterService;
    if (!RouterService) throw new Error('RouterService not found in proto');
    this.routerClient = new RouterService(addr, grpc.credentials.createInsecure());
  }

  private callReport(method: string, request: Record<string, string>, timeoutMs = 90000): Promise<any> {
    return new Promise((resolve, reject) => {
      const deadline = new Date(Date.now() + timeoutMs);
      const fn = this.client?.[method];
      if (typeof fn !== 'function') return reject(new Error(`gRPC method ${method} is not available in ReportRouterService`));
      fn.call(this.client, request, { deadline }, (err: any, response: any) => {
        if (err) return reject(new Error(`gRPC ${method} failed: ${err.message}`));
        if (!response?.success) return reject(new Error(response?.error || `${method} failed`));
        resolve(response);
      });
    });
  }

  private callRouter(method: string, request: Record<string, string>, timeoutMs = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
      const deadline = new Date(Date.now() + timeoutMs);
      const fn = this.routerClient?.[method];
      if (typeof fn !== 'function') return reject(new Error(`gRPC method ${method} is not available in RouterService`));
      fn.call(this.routerClient, request, { deadline }, (err: any, response: any) => {
        if (err) return reject(new Error(`gRPC ${method} failed: ${err.message}`));
        if (!response?.success) return reject(new Error(response?.error || `${method} failed`));
        resolve(response);
      });
    });
  }

  async listScripts(sessionId: string, filter: { idhr?: string; idbl?: string } = {}): Promise<ReportScript[]> {
    const response = await this.callReport('ListSellingScripts', {
      sessionId,
      idhr: filter.idhr || '',
      idbl: filter.idbl || '',
    });
    return (response.scripts || []).map((row: any) => {
      const date = row.date || '';
      const time = row.time || '';
      const username = row.username || '';
      const price = Number(row.price || 0);
      const profile = row.profile || '';
      const comment = row.comment || '';
      return {
        id: row.id || '',
        name: `${date}-|-${time}-|-${username}-|-${price}-|-0-|-0-|-0-|-${profile}-|-${comment}`,
        owner: profile,
        comment,
      };
    });
  }

  async deleteScripts(sessionId: string, filter: { idhr?: string; idbl?: string } = {}): Promise<{ deleted: number }> {
    const response = await this.callRouter('DeleteSellingScripts', {
      sessionId,
      idhr: filter.idhr || '',
      idbl: filter.idbl || '',
    });
    return { deleted: Number(response.deleted || 0) };
  }

  close() {
    this.client?.close?.();
    this.routerClient?.close?.();
  }
}
