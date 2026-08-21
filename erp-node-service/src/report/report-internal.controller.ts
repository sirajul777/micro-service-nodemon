import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { MikrotikGrpcClient } from '../clients/mikrotik-grpc.client';
import { ReportRouterClient } from './report-router.client';

const INDO_CURRENCIES = ['RP', 'Rp', 'rp', 'IDR', 'idr', 'RP.', 'Rp.', 'rp.', 'IDR.', 'idr.'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function parseScriptName(name: string) {
  const parts = String(name || '').split('-|-');
  return { date: parts[0] || '', price: Number.parseFloat(parts[3] || '0') || 0 };
}

function currentIdbl(date = new Date()) {
  return `${MONTHS[date.getMonth()]}${date.getFullYear()}`;
}

function currentIdhr(date = new Date()) {
  return `${MONTHS[date.getMonth()]}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
}

@Controller()
export class ReportInternalController {
  private readonly reportRouter = new ReportRouterClient();

  constructor(private readonly mikrotik: MikrotikGrpcClient) {}

  @GrpcMethod('ReportInternalService', 'GetLiveReport')
  async getLiveReport(request: { session: string }) {
    const session = String(request?.session || '');
    if (!session) return { success: false, error: 'session wajib diisi' };

    try {
      const now = new Date();
      const scripts = await this.reportRouter.listScripts(session, { idbl: currentIdbl(now) });
      const todayKey = currentIdhr(now);
      let todayVouchers = 0;
      let todayIncome = 0;
      let monthIncome = 0;

      for (const script of scripts) {
        const parsed = parseScriptName(script.name);
        monthIncome += parsed.price;
        if (parsed.date === todayKey) {
          todayVouchers += 1;
          todayIncome += parsed.price;
        }
      }

      const sessionResp = await this.mikrotik.getSession(session).catch(() => null);
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `live report failed: ${message}` };
    }
  }
}
