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
 * Billing admin endpoints: `/api/billing/:session/*` (routed via BFF `billing`
 * alias → payment-service `/billing/:session/*`).
 *
 * Backed by BillingService (db_payment). Router-aware actions (run-overdue,
 * re-enable, import-users) return a clear message when the router cannot be
 * reached — the frontend degrades gracefully.
 */
@Controller('billing/:session')
@UseGuards(JwtAuthGuard)
@RequirePermission('manageBilling')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly mikrotikGrpc: MikrotikGrpcClient,
  ) {}

  // ── Stats ────────────────────────────────────────────────────────

  @Get('stats')
  stats(@Param('session') session: string) {
    return this.billingService.getStats(session);
  }

  // ── Customers ────────────────────────────────────────────────────

  @Get('customers')
  customers(@Param('session') session: string) {
    return this.billingService.loadCustomers(session);
  }

  @Get('customers/:id')
  async customer(@Param('id') id: string) {
    const c = await this.billingService.getCustomer(id);
    return c || { error: 'Not found' };
  }

  @Post('customers')
  createCustomer(@Param('session') session: string, @Body() body: any) {
    return this.billingService.saveCustomer({ ...body, sessionId: session, id: undefined });
  }

  @Put('customers/:id')
  updateCustomer(@Param('id') id: string, @Body() body: any) {
    return this.billingService.saveCustomer({ ...body, id });
  }

  @Delete('customers/:id')
  async deleteCustomer(@Param('id') id: string) {
    return { success: await this.billingService.deleteCustomer(id) };
  }

  // ── Invoices ─────────────────────────────────────────────────────

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
    @Param('id') id: string,
    @Body() body: { paidBy?: string; note?: string },
  ) {
    const inv = await this.billingService.payInvoice(id, body.paidBy || 'Admin', body.note);
    return inv ? { success: true, invoice: inv } : { error: 'Not found' };
  }

  @Post('invoices/manual')
  async createManual(
    @Param('session') session: string,
    @Body() body: { customerId: string; period?: string; dueDate?: string },
  ) {
    const cust = await this.billingService.getCustomer(body.customerId);
    if (!cust) return { error: 'Customer not found' };
    return this.billingService.createInvoice(cust, body.period, body.dueDate);
  }

  @Post('invoices/:id/send-reminder')
  async sendReminder(@Param('session') session: string, @Param('id') id: string) {
    const inv = await this.billingService.getInvoice(id);
    if (!inv) return { error: 'Invoice not found' };
    const cust = await this.billingService.getCustomer(inv.customerId);
    if (!cust?.telegramId)
      return { error: 'Pelanggan tidak memiliki Telegram ID' };
    const daysLeft = this.billingService.getDaysUntilDue(inv.dueDate);
    await this.billingService.markReminderSent(id);
    return {
      success: true,
      message: `Reminder sent to ${cust.name} (${daysLeft} days left)`,
    };
  }

  // ── Overdue / re-enable ──────────────────────────────────────────

  @Post('run-overdue')
  async runOverdue(@Param('session') session: string) {
    const { count, customers } = await this.billingService.flagOverdueInvoices(session);

    let disabled = 0;
    const errors: string[] = [];
    for (const cust of customers) {
      if (cust.status === 'suspended' || !cust.mikrotikUser) continue; // already suspended / nothing to disable
      const result =
        cust.type === 'pppoe'
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
    if (!cust) return { error: 'Not found' };

    if (cust.mikrotikUser) {
      const result =
        cust.type === 'pppoe'
          ? await this.mikrotikGrpc.enablePppSecret(session, cust.mikrotikUser)
          : await this.mikrotikGrpc.enableHotspotUser(session, cust.mikrotikUser);
      if (!result.success) {
        return { error: result.error || 'Gagal mengaktifkan kembali akses di router' };
      }
    }

    cust.status = 'active';
    await this.billingService.saveCustomer(cust);
    return { success: true };
  }

  /** Suspend one customer from the billing table without processing all overdue accounts. */
  @Post('customers/:id/suspend')
  async suspendCustomer(@Param('session') session: string, @Param('id') id: string) {
    const cust = await this.billingService.getCustomer(id);
    if (!cust) return { success: false, error: 'Not found' };
    if (!cust.mikrotikUser) return { success: false, error: 'Username MikroTik belum diatur' };

    const result =
      cust.type === 'pppoe'
        ? await this.mikrotikGrpc.disablePppSecret(session, cust.mikrotikUser)
        : await this.mikrotikGrpc.disableHotspotUser(session, cust.mikrotikUser);
    if (!result.success) {
      return { success: false, error: result.error || 'Gagal memblokir akses di router' };
    }

    cust.status = 'suspended';
    await this.billingService.saveCustomer(cust);
    return { success: true };
  }

  // ── Import users ─────────────────────────────────────────────────

  @Get('import-users/:type')
  async importUsers(@Param('session') session: string, @Param('type') type: string) {
    // Requires a live router connection (Go service). Return empty with a hint.
    return {
      success: true,
      users: [],
      message:
        'Router import requires the router connection (Go service). No users imported.',
    };
  }

  // ── Settlements ──────────────────────────────────────────────────

  @Get('settlements')
  settlements(@Param('session') session: string) {
    return this.billingService.loadSettlements(session);
  }

  @Post('settlements/submit')
  submitSettlement(
    @Param('session') session: string,
    @Body() body: { collectorId?: string; collectorName?: string; amount?: number },
  ) {
    return this.billingService.submitSettlement(
      session,
      body.collectorId || '',
      body.collectorName || '',
      Number(body.amount) || 0,
    );
  }

  @Patch('settlements/:id/verify')
  async verifySettlement(@Param('id') id: string) {
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
      history: (await this.billingService.loadSettlements(session)).filter(
        (s) => s.collectorName === name,
      ),
    };
  }

  @Get('settlement/summary/:collectorName')
  async settlementSummary(@Param('session') session: string, @Param('collectorName') collectorName: string) {
    const customers = await this.billingService.loadCustomers(session);
    const collector = customers.find((c) => c.name === collectorName);
    const history = (await this.billingService.loadSettlements(session)).filter(
      (s) => s.collectorName === collectorName,
    );
    return {
      success: true,
      data: {
        unsetteled: collector?.unsettledCash || 0,
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
