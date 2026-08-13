import { Controller, Delete, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { MikrotikGrpcClient } from '../clients/mikrotik-grpc.client';
import { ReportRouterClient, ReportScript } from './report-router.client';

const INDO_CURRENCIES = ['RP', 'Rp', 'rp', 'IDR', 'idr', 'RP.', 'Rp.', 'rp.', 'IDR.', 'idr.'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function parseScriptName(name: string) {
  const parts = String(name || '').split('-|-');
  return {
    date: parts[0] || '',
    time: parts[1] || '',
    username: parts[2] || '',
    price: Number.parseFloat(parts[3] || '0') || 0,
    profile: parts[7] || '',
    comment: parts[8] || '',
    raw: parts,
  };
}

function resellerTag(comment: string): string {
  if (!comment) return '(no comment)';
  const match = comment.match(/^up-\d+-[\d.]+-(.+)$/i);
  return match ? match[1].toUpperCase() : comment.toUpperCase();
}

function currentIdbl(date = new Date()): string {
  return `${MONTHS[date.getMonth()]}${date.getFullYear()}`;
}

function currentIdhr(date = new Date()): string {
  return `${MONTHS[date.getMonth()]}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
}

@Controller('report')
@UseGuards(JwtAuthGuard)
@RequirePermission('viewReport')
export class ReportController {
  private readonly reportRouter = new ReportRouterClient();

  constructor(private readonly mikrotik: MikrotikGrpcClient) {}

  @Get(':session/selling')
  async selling(
    @Param('session') session: string,
    @Query('idhr') idhr?: string,
    @Query('idbl') idbl?: string,
    @Query('prefix') prefix?: string,
    @Query('datacomments') datacomments?: string,
    @Query('dataprofile') dataprofile?: string,
    @Query('reseller') reseller?: string,
  ) {
    const scripts = await this.reportRouter.listScripts(session, { idhr, idbl });
    let records = scripts.map((script: ReportScript) => {
      const parsed = parseScriptName(script.name);
      return {
        ...parsed,
        resellerTag: resellerTag(parsed.comment),
      };
    });

    if (prefix) records = records.filter((r) => r.username.startsWith(prefix));
    if (datacomments) records = records.filter((r) => r.comment === datacomments);
    if (dataprofile) records = records.filter((r) => r.profile === dataprofile);
    if (reseller) records = records.filter((r) => r.resellerTag === reseller.toUpperCase());

    const totalVouchers = records.length;
    const totalIncome = records.reduce((sum, r) => sum + r.price, 0);
    const sessionResp = await this.mikrotik.getSession(session).catch(() => null);
    const currency = sessionResp?.session?.currency || 'Rp';

    const resellerMap: Record<string, { tag: string; vouchers: number; total: number }> = {};
    for (const record of records) {
      const tag = record.resellerTag;
      if (!resellerMap[tag]) resellerMap[tag] = { tag, vouchers: 0, total: 0 };
      resellerMap[tag].vouchers++;
      resellerMap[tag].total += record.price;
    }

    return {
      records,
      summary: {
        totalVouchers,
        totalIncome,
        currency,
        isIndo: INDO_CURRENCIES.includes(currency),
      },
      resellerGroups: Object.values(resellerMap).sort((a, b) => b.total - a.total),
      filter: { idhr, idbl, prefix, datacomments, dataprofile, reseller },
    };
  }

  @Get(':session/live')
  async live(@Param('session') session: string) {
    const now = new Date();
    const idhr = currentIdhr(now);
    const scripts = await this.reportRouter.listScripts(session, { idbl: currentIdbl(now) });

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

    const sessionResp = await this.mikrotik.getSession(session).catch(() => null);
    const currency = sessionResp?.session?.currency || 'Rp';

    return {
      today: { vouchers: todayVouchers, income: todayIncome },
      month: { vouchers: scripts.length, income: monthIncome },
      currency,
      isIndo: INDO_CURRENCIES.includes(currency),
    };
  }

  @Get(':session/resume')
  async resume(@Param('session') session: string, @Query('idbl') idbl?: string) {
    const monthId = idbl || currentIdbl();
    const scripts = await this.reportRouter.listScripts(session, { idbl: monthId });
    const mm = monthId.slice(0, 3).toLowerCase();
    const yyyy = monthId.slice(3);
    const monthNums: Record<string, number> = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    };
    const monthNum = monthNums[mm] || new Date().getMonth() + 1;
    const yearNum = Number.parseInt(yyyy, 10) || new Date().getFullYear();
    const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
    const now = new Date();
    const isCurrentMonth = monthNum === now.getMonth() + 1 && yearNum === now.getFullYear();
    const maxDay = isCurrentMonth ? now.getDate() : daysInMonth;

    const dailyMap: Record<string, { date: string; vouchers: number; total: number }> = {};
    for (let d = 1; d <= maxDay; d++) {
      const dd = String(d).padStart(2, '0');
      dailyMap[`${mm}/${dd}/${yearNum}`] = { date: dd, vouchers: 0, total: 0 };
    }

    let totalIncome = 0;
    for (const script of scripts) {
      const parsed = parseScriptName(script.name);
      totalIncome += parsed.price;
      const day = dailyMap[parsed.date];
      if (day) {
        day.vouchers++;
        day.total += parsed.price;
      }
    }

    const sessionResp = await this.mikrotik.getSession(session).catch(() => null);
    const currency = sessionResp?.session?.currency || 'Rp';

    return {
      daily: Object.values(dailyMap),
      summary: {
        totalVouchers: scripts.length,
        totalIncome,
        currency,
        isIndo: INDO_CURRENCIES.includes(currency),
        month: mm,
        year: yyyy,
      },
    };
  }

  @Delete(':session/selling')
  async clear(
    @Param('session') session: string,
    @Query('idhr') idhr?: string,
    @Query('idbl') idbl?: string,
  ) {
    await this.reportRouter.deleteScripts(session, { idhr, idbl });
    return { success: true };
  }
}
