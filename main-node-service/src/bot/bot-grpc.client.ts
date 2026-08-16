import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { credentials, loadPackageDefinition, ServiceError } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { existsSync } from 'fs';
import { join } from 'path';

@Injectable()
export class BotGrpcClient implements OnModuleDestroy {
  private readonly client: any;

  constructor() {
    const candidates = [
      process.env.BOT_GRPC_PROTO_PATH,
      join(process.cwd(), 'proto', 'bot_internal.proto'),
      join(process.cwd(), '..', 'bot-py-service', 'proto', 'bot_internal.proto'),
      '/app/bot-proto/bot_internal.proto',
    ].filter(Boolean) as string[];
    const protoPath = candidates.find((path) => existsSync(path));
    if (!protoPath) throw new Error(`Bot gRPC proto not found; checked: ${candidates.join(', ')}`);

    const packageDef = loadSync(protoPath, {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const pkg = loadPackageDefinition(packageDef) as any;
    const Service = pkg.bot?.internal?.BotInternalService || pkg.bot?.BotInternalService;
    if (!Service) throw new Error('BotInternalService gRPC definition not found');

    this.client = new Service(
      process.env.BOT_GRPC_ADDR || 'bot-py-service:50055',
      credentials.createInsecure(),
    );
  }

  private call(method: string, request: Record<string, any>, timeoutMs = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const deadline = new Date(Date.now() + timeoutMs);
      this.client[method](request, { deadline }, (err: ServiceError | null, response: any) => {
        if (err) return reject(err);
        resolve(response);
      });
    });
  }

  listResellers(bot = true) { return this.call('ListResellers', { bot }); }
  getReseller(id: string, bot = true) { return this.call('GetReseller', { id, bot }); }
  upsertReseller(reseller: any, bot = true) { return this.call('UpsertReseller', { reseller, bot }); }
  deleteReseller(id: string, bot = true) { return this.call('DeleteReseller', { id, bot }); }
  topupReseller(id: string, amount: number, note = '', by = 'admin') { return this.call('TopupReseller', { id, amount, note, by }); }
  listResellerLogs(resellerId = '', limit = 100) { return this.call('ListResellerLogs', { resellerId, limit }); }

  listTelegramConfigs() { return this.call('ListTelegramConfigs', {}); }
  getTelegramConfig(id: string) { return this.call('GetTelegramConfig', { id }); }
  saveTelegramConfig(config: any) { return this.call('SaveTelegramConfig', { config }); }
  deleteTelegramConfig(id: string) { return this.call('DeleteTelegramConfig', { id }); }
  testTelegram(id: string, chatId = '', message = '') { return this.call('TestTelegram', { id, chatId, message }); }
  listTelegramLogs() { return this.call('ListTelegramLogs', {}); }

  close() { this.client?.close?.(); }
  onModuleDestroy() { this.close(); }
}
