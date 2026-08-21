import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { credentials, loadPackageDefinition, ServiceError } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { existsSync } from 'fs';
import { join } from 'path';

@Injectable()
export class ReportGrpcClient implements OnModuleDestroy {
  private readonly client: any;

  constructor() {
    const candidates = [
      process.env.REPORT_GRPC_PROTO_PATH,
      join(process.cwd(), 'src', 'proto', 'report_internal.proto'),
      join(process.cwd(), 'report-proto', 'report_internal.proto'),
      '/app/report-proto/report_internal.proto',
    ].filter(Boolean) as string[];
    const protoPath = candidates.find((path) => existsSync(path));
    if (!protoPath) throw new Error(`Report gRPC proto not found; checked: ${candidates.join(', ')}`);

    const definition = loadSync(protoPath, {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const pkg = loadPackageDefinition(definition) as any;
    const Service = pkg.report?.internal?.ReportInternalService;
    if (!Service) throw new Error('ReportInternalService gRPC definition not found');

    this.client = new Service(
      process.env.REPORT_GRPC_ADDR || 'erp-node-service:50056',
      credentials.createInsecure(),
    );
  }

  getLiveReport(session: string) {
    return new Promise<any>((resolve, reject) => {
      const raw = Number.parseInt(process.env.REPORT_GRPC_TIMEOUT_MS || '90000', 10);
      const timeoutMs = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 120000) : 90000;
      const deadline = new Date(Date.now() + timeoutMs);
      this.client.GetLiveReport({ session }, { deadline }, (err: ServiceError | null, response: any) => {
        if (err) return reject(err);
        resolve(response);
      });
    });
  }

  close() { this.client?.close?.(); }
  onModuleDestroy() { this.close(); }
}
