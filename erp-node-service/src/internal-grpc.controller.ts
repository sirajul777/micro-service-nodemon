import { GrpcMethod } from '@nestjs/microservices';
import { ErpSessionStore } from './internal-grpc.store';
import { MikrotikGrpcClient } from './clients/mikrotik-grpc.client';
import { ReportRouterClient } from './report/report-router.client';

const INDO_CURRENCIES = ['RP', 'Rp', 'rp', 'IDR', 'idr', 'RP.', 'Rp.', 'rp.', 'IDR.', 'idr.'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function parseScriptName(name: string) {
  const parts = String(name || '').split('-|-');
  return { date: parts[0] || '', price: Number.parseFloat(parts[3] || '0') || 0 };
}

function currentIdbl(date = new Date()): string {
  return `${MONTHS[date.getMonth()]}${date.getFullYear()}`;
}

function currentIdhr(date = new Date()): string {
  return `${MONTHS[date.getMonth()]}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
}

export class InternalGrpcController {
  private readonly reportRouter = new ReportRouterClient();

  constructor(
    private readonly store: ErpSessionStore,
    private readonly mikrotik: MikrotikGrpcClient,
  ) {}

  @GrpcMethod('ErpInternalService', 'ListSessions')
  async listSessions() {
    const sessions = await this.store.list();
    return { success: true, sessions };
  }

  @GrpcMethod('ErpInternalService', 'GetSession')
  async getSession(request: { id: string }) {
    const session = await this.store.get(request.id);
    if (!session) return { success: false, error: 'router session tidak ditemukan' };
    return { success: true, session };
  }

  @GrpcMethod('ErpInternalService', 'CreateSession')
  async createSession(request: Record<string, any>) {
    return this.store.create(request);
  }

  @GrpcMethod('ErpInternalService', 'UpdateSession')
  async updateSession(request: Record<string, any>) {
    return this.store.update(request);
  }

  @GrpcMethod('ErpInternalService', 'DeleteSession')
  async deleteSession(request: { id: string }) {
    return this.store.remove(request.id);
  }

  @GrpcMethod('ErpInternalService', 'GetLiveReport')
  async getLiveReport(request: { session: string }) {
    const sessionId = String(request?.session || '');
    if (!sessionId) return { success: false, error: 'session wajib diisi' };

    try {
      const now = new Date();
      const idhr = currentIdhr(now);
      const scripts = await this.reportRouter.listScripts(sessionId, { idbl: currentIdbl(now) });

      let todayVouchers = 0;
      let todayIncome = 0;
      let monthIncome = 0;
      for (const script of scripts) {
        const parsed = parseScriptName(script.name);
        monthIncome += parsed.price;
        if (parsed.date === idhr) {
          todayVouchers++;
          todayIncome += parsed.price;
        }
      }

      const sessionResp = await this.mikrotik.getSession(sessionId).catch(() => null);
      const currency = sessionResp?.session?.currency || 'Rp';

      return {
        success: true,
        error: '',
        todayVouchers,
        todayIncome,
        monthVouchers: scripts.length,
        monthIncome,
        currency,
        isIndo: INDO_CURRENCIES.includes(currency),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `live report failed: ${message}` };
    }
  }
}
