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

const REPORT_SCRIPTS_MARKER = '__REPORT_SCRIPTS__';
const REPORT_DELETE_MARKER = '__REPORT_DELETE__';

/**
 * Report-only gRPC adapter. It intentionally uses the already deployed
 * ListHotspotUsers/RemoveHotspotUser RPCs as a compatibility transport so
 * report parity can be deployed without requiring a protobuf regeneration
 * across every service at the same time.
 */
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
      this.client[method](request, { deadline }, (err: any, response: any) => {
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
    const marker = [
      REPORT_SCRIPTS_MARKER,
      `idhr=${filter.idhr || ''}`,
      `idbl=${filter.idbl || ''}`,
    ].join('|');
    const response = await this.call('ListHotspotUsers', {
      sessionId,
      profile: marker,
      comment: '',
    });
    return (response.users || []).map((row: any) => ({
      id: row.id || '',
      name: row.name || '',
      owner: row.profile || '',
      comment: row.comment || '',
    }));
  }

  async deleteScripts(
    sessionId: string,
    filter: { idhr?: string; idbl?: string } = {},
  ): Promise<void> {
    const marker = [
      REPORT_DELETE_MARKER,
      `|idhr=${filter.idhr || ''}`,
      `|idbl=${filter.idbl || ''}`,
    ].join('');
    await this.call('RemoveHotspotUser', {
      sessionId,
      name: marker,
    });
  }
}
