import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { loadPackageDefinition } from '@grpc/grpc-js';
import { join } from 'path';

export interface ReportScript {
  id: string;
  name: string;
  owner: string;
  comment: string;
}

export class ReportRouterClient {
  private readonly client: any;

  constructor() {
    const protoPath =
      process.env.ROUTER_PROTO_PATH ||
      join(__dirname, '..', 'proto', 'router.proto');
    const packageDef = protoLoader.loadSync(protoPath, {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const proto = loadPackageDefinition(packageDef) as any;
    const Service = proto.router?.RouterService;
    if (!Service) throw new Error('RouterService not found in proto');
    this.client = new Service(
      process.env.MIKROTIK_GRPC_ADDR || 'localhost:50051',
      grpc.credentials.createInsecure(),
    );
  }

  private call(method: string, request: Record<string, string>): Promise<any> {
    return new Promise((resolve, reject) => {
      const deadline = new Date(Date.now() + 30_000);
      const fn = this.client?.[method];
      if (typeof fn !== 'function') {
        return reject(new Error(`gRPC method ${method} is not available in RouterService`));
      }
      fn.call(this.client, request, { deadline }, (err: any, response: any) => {
        if (err) return reject(err);
        if (!response?.success) return reject(new Error(response?.error || `${method} failed`));
        resolve(response);
      });
    });
  }

  async listScripts(
    sessionId: string,
    filter: { idhr?: string; idbl?: string } = {},
  ): Promise<ReportScript[]> {
    const response = await this.call('ListSellingScripts', {
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

  async deleteScripts(
    sessionId: string,
    filter: { idhr?: string; idbl?: string } = {},
  ): Promise<{ deleted: number }> {
    const response = await this.call('DeleteSellingScripts', {
      sessionId,
      idhr: filter.idhr || '',
      idbl: filter.idbl || '',
    });
    return { deleted: Number(response.deleted || 0) };
  }
}
