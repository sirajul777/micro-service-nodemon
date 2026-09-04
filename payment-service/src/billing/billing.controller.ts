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
import { RedisPublisherService } from '../redis/redis-publisher.service';

@Controller('billing/:session')
@UseGuards(JwtAuthGuard)
@RequirePermission('manageBilling')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly mikrotikGrpc: MikrotikGrpcClient,
    private readonly redis: RedisPublisherService,
  ) {}

  private sessionMatches(entity: { sessionId?: string } | null | undefined, session: string): boolean {
    return !!entity && entity.sessionId === session;
  }

  private buildReminderPayload(
    invoice: { id: string; customerId: string; customerName?: string; amount?: number; dueDate?: string },
    customer: { sessionId: string; name?: string; telegramId?: string },
  ) {
    const daysLeft = this.billingService.getDaysUntilDue(invoice.dueDate);
    return {
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      sessionId: customer.sessionId,
      customerName: customer.name || invoice.customerName || '',
      telegramId: customer.telegramId || '',
      amount: Number(invoice.amount || 0),
      dueDate: invoice.dueDate || '',
      daysLeft,
    };
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
    return this.billingService.saveCustomer({ ...body, sessionId: session, id: undefined });
  }

  @Put('customers/:id')
  async updateCustomer(@Param('session') session: string, @Param('id') id: string, @Body() body: any) {
    const existing = await this.billingService.getCustomer(id);
    if (!this.sessionMatches(existing, session)) return { error: 'Not found' };
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
    const collectorName = String(body?.paidBy || 'Admin').trim();
    if (!collectorName) return { error: 'paidBy wajib diisi' };
    const paid = await this.billingService.payInvoice(id, collectorName, body?.note);
    if (!paid) return { error: 'Not found' };

    let reenabled = false;
    const customer = await this.billingService.getCustomer(paid.customerId);
    if (customer && customer.sessionId === session && customer.status === 'suspended' && customer.autoDisable !== false) {
      if (customer.mikrotikUser) {
        const routerResult = customer.type === 'pppoe'
          ? await this.mikrotikGrpc.enablePppSecret(session, customer.mikrotikUser)
          : await this.mikrotikGrpc.enableHotspotUser(session, customer.mikrotikUser);
        if (!routerResult.success) {
          return {
            success: true,
            invoice: paid,
            reenabled: false,
            reenableError: routerResult.error || 'Gagal mengaktifkan kembali akses di router',
          };
        }
      }
      customer.status = 'active';
      await this.billingService.saveCustomer(customer);
      reenabled = true;
    }

    return { success: true, invoice: paid, reenabled };
  }

  @Post('invoices/manual')
  async createManual(
    @Param('session') session: string,
    @Body() body: { customerId: string; period?: string; dueDate?: string },
  ) {
    const customerId = String(body?.customerId || '').trim();
    if (!customerId) return { error: 'customerId wajib diisi' };
    const cust = await this.billingService.getCustomer(customerId);
    if (!this.sessionMatches(cust, session)) return { error: 'Customer not found' };
    return this.billingService.createInvoice(cust!, body.period, body.dueDate);
  }

  @Post('invoices/:id/send-reminder')
  async sendReminder(@Param('session') session: string, @Param('id') id: string) {
    const inv = await this.billingService.getInvoice(id);
    if (!this.sessionMatches(inv, session)) return { error: 'Invoice not found' };
    if (inv!.status === 'paid' || inv!.status === 'cancelled') {
      return { error: 'Invoice sudah tidak dapat dikirimkan sebagai tagihan aktif' };
    }
    const cust = await this.billingService.getCustomer(inv!.customerId);
    if (!this.sessionMatches(cust, session)) return { error: 'Invoice not found' };
    if (!cust?.telegramId) return { error: 'Pelanggan tidak memiliki Telegram ID' };

    const payload = this.buildReminderPayload(inv!, cust);
    const published = await this.redis.publish('billing.invoice.reminder', payload);
    if (!published) {
      return { success: false, error: 'Gagal mengantrikan reminder Telegram' };
    }

    await this.billingService.markReminderSent(id);
    return {
      success: true,
      queued: true,
      message: `Reminder queued for ${cust.name} (${payload.daysLeft} days left)`,
    };
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
  async importUsers(@Param('session') session: string, @Param('type') type: string) {
    const normalizedType = String(type || '').trim().toLowerCase();
    if (!['hotspot', 'pppoe'].includes(normalizedType)) {
      return { success: false, users: [], message: 'type harus hotspot atau pppoe' };
    }
    if (!session) return { success: false, users: [], message: 'session wajib diisi' };

    try {
      const users = normalizedType === 'pppoe'
        ? await this.mikrotikGrpc.listPppSecrets(session)
        : await this.mikrotikGrpc.listHotspotUsers(session);

      const existing = await this.billingService.loadCustomers(session);
      const byUser = new Map(
        existing
          .filter((customer) => customer.mikrotikUser)
          .map((customer) => [
            `${customer.type}:${customer.mikrotikUser}`.toLowerCase(),
            customer,
          ]),
      );

      const imported: any[] = [];
      for (const user of users) {
        const mikrotikUser = String(user?.name || '').trim();
        if (!mikrotikUser) continue;
        const key = `${normalizedType}:${mikrotikUser}`.toLowerCase();
        const current = byUser.get(key);
        const next = await this.billingService.saveCustomer({
          ...(current || {}),
          ...(current ? {} : { id: undefined }),
          sessionId: session,
          name: current?.name || mikrotikUser,
          mikrotikUser,
          type: normalizedType,
          profile: String(user?.profile || current?.profile || '').trim(),
          status: String(user?.disabled || '').toLowerCase() === 'yes' ? 'suspended' : (current?.status || 'active'),
          note: current?.note || 'Imported from MikroTik',
        });
        byUser.set(key, next);
        imported.push(next);
      }

      return {
        success: true,
        type: normalizedType,
        total: users.length,
        imported: imported.length,
        users: imported,
      };
    } catch (error: any) {
      return {
        success: false,
        type: normalizedType,
        users: [],
        message: error?.message || 'Gagal mengambil user dari router',
      };
    }
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
    const collectorId = String(body?.collectorId || '').trim();
    const collectorName = String(body?.collectorName || '').trim();
    const amount = Number(body?.amount);
    if (!collectorId && !collectorName) return { success: false, error: 'Collector wajib dipilih' };
    if (!Number.isFinite(amount) || amount <= 0) return { success: false, error: 'Amount harus lebih besar dari 0' };
    if (collectorId) {
      const collector = await this.billingService.getCustomer(collectorId);
      if (!this.sessionMatches(collector, session)) return { success: false, error: 'Collector not found' };
    }
    return this.billingService.submitSettlement(session, collectorId, collectorName, amount);
  }

  @Patch('settlements/:id/verify')
  async verifySettlement(@Param('session') session: string, @Param('id') id: string) {
    const settlements = await this.billingService.loadSettlements(session);
    if (!settlements.some((s) => s.id === id)) return { success: false };
    return { success: await this.billingService.verifySettlement(id) };
  }
}
