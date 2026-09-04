import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BillingService } from './billing.service';
import { MikrotikGrpcClient } from '../clients/mikrotik-grpc.client';
import { RedisPublisherService } from '../redis/redis-publisher.service';

@Injectable()
export class BillingSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingSchedulerService.name);
  private static readonly INTERVAL_MS = 60 * 1000;
  private initialSweep: NodeJS.Timeout | null = null;
  private interval: NodeJS.Timeout | null = null;
  private running = false;
  private stopping = false;
  private activeSweep: Promise<void> | null = null;

  constructor(
    private readonly billingService: BillingService,
    private readonly mikrotikGrpc: MikrotikGrpcClient,
    private readonly redis: RedisPublisherService,
  ) {}

  onModuleInit() {
    this.stopping = false;
    this.initialSweep = setTimeout(() => {
      if (!this.stopping) void this.sweep();
    }, 5000);
    this.interval = setInterval(() => {
      if (!this.stopping) void this.sweep();
    }, BillingSchedulerService.INTERVAL_MS);
  }

  async onModuleDestroy() {
    this.stopping = true;
    if (this.initialSweep) clearTimeout(this.initialSweep);
    if (this.interval) clearInterval(this.interval);
    this.initialSweep = null;
    this.interval = null;
    if (this.activeSweep) await this.activeSweep;
  }

  sweep(): Promise<void> {
    if (this.stopping || this.running) return Promise.resolve();
    const task = this.runSweep();
    this.activeSweep = task;
    return task;
  }

  private async runSweep(): Promise<void> {
    if (this.running || this.stopping) return;
    this.running = true;
    try {
      const sessions = await this.billingService.listReminderSessions();
      let reminders = 0;
      let overdue = 0;
      let suspended = 0;
      let failures = 0;

      for (const session of sessions) {
        if (this.stopping) break;

        const items = await this.billingService.getRemindableInvoices(session);
        for (const item of items) {
          if (this.stopping) break;
          const claimAt = new Date();
          const claimed = await this.billingService.claimReminder(item.invoice.id);
          if (!claimed) continue;
          const published = await this.redis.publish('billing.invoice.reminder', {
            invoiceId: item.invoice.id,
            customerId: item.customer.id,
            sessionId: item.customer.sessionId,
            customerName: item.customer.name,
            telegramId: item.customer.telegramId,
            amount: Number(item.invoice.amount || 0),
            dueDate: item.invoice.dueDate || '',
            daysLeft: item.daysLeft,
          });
          if (published) reminders++;
          else {
            await this.billingService.rollbackReminderClaim(item.invoice.id, claimAt);
            failures++;
            this.logger.warn(`Billing reminder event could not be published for invoice ${item.invoice.id}; claim released for retry`);
          }
        }

        if (this.stopping) break;
        const { count, customers } = await this.billingService.flagOverdueInvoices(session);
        overdue += count;
        for (const customer of customers) {
          if (this.stopping) break;
          if (customer.status === 'suspended' || !customer.mikrotikUser) continue;
          const result = customer.type === 'pppoe'
            ? await this.mikrotikGrpc.disablePppSecret(session, customer.mikrotikUser)
            : await this.mikrotikGrpc.disableHotspotUser(session, customer.mikrotikUser);

          if (result.success) {
            customer.status = 'suspended';
            await this.billingService.saveCustomer(customer);
            suspended++;
          } else {
            failures++;
            this.logger.warn(`Failed to suspend overdue customer ${customer.name || customer.mikrotikUser}: ${result.error || 'unknown error'}`);
          }
        }
      }

      if (reminders || overdue || suspended || failures) {
        this.logger.log(`Billing sweep complete: reminders=${reminders} overdue=${overdue} suspended=${suspended} failures=${failures}`);
      }
    } catch (error: any) {
      if (!this.stopping) {
        this.logger.error(`Billing sweep failed: ${error?.message || error}`);
      }
    } finally {
      this.running = false;
      this.activeSweep = null;
    }
  }
}
