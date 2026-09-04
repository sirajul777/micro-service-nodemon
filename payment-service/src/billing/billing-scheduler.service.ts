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
      let generated = 0;
      let reminders = 0;
      let overdue = 0;
      let suspended = 0;
      let failures = 0;

      for (const session of sessions) {
        if (this.stopping) break;

        try {
          const generatedResult = await this.billingService.generateMonthlyInvoices(session);
          generated += generatedResult.count;
        } catch (error: any) {
          failures++;
          this.logger.warn(`Failed to generate monthly invoices for session ${session}: ${error?.message || error}`);
        }

        const items = await this.billingService.getRemindableInvoices(session);
        for (const item of items) {
          if (this.stopping) break;
          const claim = await this.billingService.claimReminder(item.invoice.id);
          if (!claim.claimed || !claim.token) continue;
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
          if (published) {
            await this.billingService.confirmReminderClaim(item.invoice.id, claim.token);
            reminders++;
          } else {
            await this.billingService.rollbackReminderClaim(item.invoice.id, claim.token);
            failures++;
            this.logger.warn(`Billing reminder event could not be published for invoice ${item.invoice.id}; claim released for retry`);
          }
        }

        if (this.stopping) break;
        const { count, customers } = await this.billingService.flagOverdueInvoices(session);
        overdue += count;
        for (const customer of customers) {
          if (this.stopping) break;

          // Suspension and notification are deliberately separate. If the
          // router action succeeds but Redis is unavailable, the customer is
          // already suspended and must still be eligible for notification retry
          // on the next sweep.
          if (customer.status !== 'suspended') {
            if (!customer.mikrotikUser) continue;
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
              continue;
            }
          }

          if (!customer.telegramId) continue;
          try {
            const claimed = await this.billingService.claimOverdueNotification(customer.id);
            if (!claimed) continue;
            const published = await this.redis.publish('billing.invoice.overdue', {
              customerId: customer.id,
              sessionId: customer.sessionId,
              customerName: customer.name,
              telegramId: customer.telegramId,
              mikrotikUser: customer.mikrotikUser || '',
              type: customer.type || 'hotspot',
            });
            if (!published) {
              failures++;
              await this.billingService.rollbackOverdueNotification(customer.id, claimed.token);
              this.logger.warn(`Billing overdue event could not be published for customer ${customer.id}; notification claim released for retry`);
            } else {
              await this.billingService.confirmOverdueNotification(customer.id, claimed.token);
            }
          } catch (error: any) {
            failures++;
            this.logger.warn(`Billing overdue notification failed for customer ${customer.id}: ${error?.message || error}`);
          }
        }
      }

      if (generated || reminders || overdue || suspended || failures) {
        this.logger.log(`Billing sweep complete: generated=${generated} reminders=${reminders} overdue=${overdue} suspended=${suspended} failures=${failures}`);
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
