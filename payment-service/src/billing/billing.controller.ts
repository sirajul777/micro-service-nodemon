import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { MikrotikGrpcClient } from '../clients/mikrotik-grpc.client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/permissions.decorator';

/**
 * Billing admin endpoints: `/api/billing/:session/*`.
 *
 * Every entity mutation/read that starts from an id is checked against the
 * route session before it is allowed to proceed. This is important because
 * IDs are UUIDs but are not themselves tenant/session boundaries.
 */
@Controller('billing/:session')
@UseGuards(JwtAuthGuard)
@RequirePermission('manageBilling')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly mikrotikGrpc: MikrotikGrpcClient,
  ) {}

  private sessionMatches(entity: { sessionId?: string } | null | undefined, session: string): boolean {
    return !!entity && entity.sessionId === session;
  }

  @Get('stats')
  stats(@Param('session') session: string) {
    return this.billingService.getStats(session);
  }

  @Get('customers')
  customers(@Param('session') session: string) {
    return this.billingService.loadCustomers(session);
  }

  @Get('customers/:id')
  async customer(@Param('session') session: string, @Param('id') id: string) {
    const c = await this.billingService.getCustomer(id);
    return this.sessionMatches(c, session) ? c : { error: 'Not found' };
  }

  @Post('customers')
  createCustomer(@Param('session') session: string, @Body() body: any) {
    // Never trust a client-supplied sessionId.
    return this.billingService.saveCustomer({ ...body, sessionId: session, id: undefined });
  }

  @Put('customers/:id')
  async updateCustomer(@Param('session') session: string, @Param('id') id: string, @Body() body: any) {
    const existing = await this.billingService.getCustomer(id);
    if (!this.sessionMatches(existing, session)) return { error: 'Not found' };
    // Never allow the request body to move a customer into another session.
    return this.billingService.saveCustomer({ ...body, id, sessionId: session });
  }

  @Delete('customers/:id')
  async deleteCustomer(@Param('session') session: string, @Param('id') id: string) {
    const existing = await this.billingService.getCustomer(id);
    if (!this.sessionMatches(existing, session)) return { success: false };
    return { success: await this.billingService.deleteCustomer(id) };
  }

  @Get('invoices')
  invoices(@Param('session') session: string, @Query('customerId') customerId?: string) {
    return this.billingService.loadInvoices(session, customerId);
  }

  @Post('invoices/generate')
  async generateInvoices(@Param('session') session: string) {
    const customers = await this.billingService.loadCustomers(session);
    if (!customers.length) return { success: true, count: 0, message: 'No active customers' };
    return this.billingService.generateMonthlyInvoices(session);
  }

  @Post('invoices/:id/pay')
  async payInvoice(
    @Param('session') session: string,
    @Param('id') id: string,
    @Body() body: { paidBy?: string; note?: string },
  ) {
    const inv = await this.billingService.getInvoice(id);
    if (!this.sessionMatches(inv, session)) return { error: 'Invoice not found' };
    const paid = await this.billingService.payInvoice(id, body.paidBy || 'Admin', body.note);
    return paid ? { success: true, invoice: paid } : { error: 'Not found' };
  }

  @Post('invoices/manual')
  async createManual(
    @Param('session') session: string,
    @Body() body: { customerId: string; period?: string; dueDate?: string },
  ) {
    const cust = await this.billingService.getCustomer(body.customerId);
    if (!this.sessionMatches(cust, session)) return { error: 'Customer not found' };
    return this.billingService.createInvoice(cust!, body.period, body.dueDate);
  }

  @Post('invoices/:id/send-reminder')
  async sendReminder(@Param('session') session: string, @Param('id') id: string) {
    const inv = await this.billingService.getInvoice(id);
    if (!this.sessionMatches(inv, session)) return { error: 'Invoice not found' };
    const cust = await this.billingService.getCustomer(inv!.customerId);
    if (!this.sessionMatches(cust, session)) return { error: 'Invoice not found' };
    if (!cust?.telegramId) return { error: 'Pelanggan tidak memiliki Telegram ID' };
    const daysLeft = this.billingService.getDaysUntilDue(inv!.dueDate);
    await this.billingService.markReminderSent(id);
    return { success: true, message: `Reminder sent to ${cust.name} (${daysLeft} days left)` };
  }

  @Post('run-overdue')
  async runOverdue(@Param('session') session: string) {
    const { count, customers } = await this.billingService.flagOverdueInvoices(session);
    let disabled = 0;
    const errors: string[] = [];
    for (const cust of customers) {
      if (cust.status === 'suspended' || !cust.mikrotikUser) continue;
      const result = cust.type === 'pppoe'
        ? await this.mikrotikGrpc.disablePppSecret(session, cust.mikrotikUser)
        : await this.mikrotikGrpc.disableHotspotUser(session, cust.mikrotikUser);
      if (result.success) {
        cust.status = 'suspended';
        await this.billingService.saveCustomer(cust);
        disabled++;
      } else {
        errors.push(`${cust.name || cust.mikrotikUser}: ${result.error || 'unknown error'}`);
      }
    }
    return {
      success: true,
      total: count,
      disabled,
      errors: errors.length ? errors : undefined,
      message: `${count} overdue invoice(s) flagged, ${disabled} customer(s) suspended on the router.`,
    };
  }

  @Post('customers/:id/re-enable')
  async reEnable(@Param('session') session: string, @Param('id') id: string) {
    const cust = await this.billingService.getCustomer(id);
    if (!this.sessionMatches(cust, session)) return { error: 'Not found' };
    if (cust!.mikrotikUser) {
      const result = cust!.type === 'pppoe'
        ? await this.mikrotikGrpc.enablePppSecret(session, cust!.mikrotikUser)
        : await this.mikrotikGrpc.enableHotspotUser(session, cust!.mikrotikUser);
      if (!result.success) return { error: result.error || 'Gagal mengaktifkan kembali akses di router' };
    }
    cust!.status = 'active';
    await this.billingService.saveCustomer(cust!);
    return { success: true };
  }

  @Post('customers/:id/suspend')
  async suspendCustomer(@Param('session') session: string, @Param('id') id: string) {
    const cust = await this.billingService.getCustomer(id);
    if (!this.sessionMatches(cust, session)) return { success: false, error: 'Not found' };
    if (!cust!.mikrotikUser) return { success: false, error: 'Username MikroTik belum diatur' };
    const result = cust!.type === 'pppoe'
      ? await this.mikrotikGrpc.disablePppSecret(session, cust!.mikrotikUser)
      : await this.mikrotikGrpc.disableHotspotUser(session, cust!.mikrotikUser);
    if (!result.success) return { success: false, error: result.error || 'Gagal memblokir akses di router' };
    cust!.status = 'suspended';
    await this.billingService.saveCustomer(cust!);
    return { success: true };
  }

  @Get('import-users/:type')
  async importUsers() {
    return {
      success: true,
      users: [],
      message: 'Router import requires the router connection (Go service). No users imported.',
    };
  }

  @Get('settlements')
  settlements(@Param('session') session: string) {
    return this.billingService.loadSettlements(session);
  }

  @Post('settlements/submit')
  async submitSettlement(
    @Param('session') session: string,
    @Body() body: { collectorId?: string; collectorName?: string; amount?: number },
  ) {
    if (!body.collectorId && !body.collectorName) {
      return { success: false, error: 'Collector wajib dipilih' };
    }
    if (body.collectorId) {
      const collector = await this.billingService.getCustomer(body.collectorId);
      if (!this.sessionMatches(collector, session)) return { success: false, error: 'Collector not found' };
    }
    return this.billingService.submitSettlement(
      session,
      body.collectorId || '',
      body.collectorName || '',
      Number(body.amount) || 0,
    );
  }

  @Patch('settlements/:id/verify')
  async verifySettlement(@Param('session') session: string, @Param('id') id: string) {
    const settlements = await this.billingService.loadSettlements(session);
    if (!settlements.some((s) => s.id === id)) return { success: false };
    return { success: await this.billingService.verifySettlement(id) };
  }

  @Get('collector/:name')
  async collector(@Param('session') session: string, @Param('name') name: string) {
    const customers = await this.billingService.loadCustomers(session);
    const collector = customers.find((c) => c.name === name);
    if (!collector) return { error: 'Collector not found' };
    return {
      name: collector.name,
      unsettledCash: collector.unsettledCash || 0,
      history: (await this.billingService.loadSettlements(session)).filter((s) => s.collectorName === name),
    };
  }

  @Get('settlement/summary/:collectorName')
  async settlementSummary(@Param('session') session: string, @Param('collectorName') collectorName: string) {
    const customers = await this.billingService.loadCustomers(session);
    const collector = customers.find((c) => c.name === collectorName);
    const history = (await this.billingService.loadSettlements(session)).filter((s) => s.collectorName === collectorName);
    return {
      success: true,
      data: {
        unsettled: collector?.unsettledCash || 0,
        history: history.map((h) => ({
          id: h.id,
          date: new Date(h.createdAt).toLocaleDateString('id-ID'),
          amount: h.amount,
          status: h.status,
        })),
      },
    };
  }
}
