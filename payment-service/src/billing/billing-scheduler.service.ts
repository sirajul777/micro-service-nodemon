import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BillingService } from './billing.service';
import { RedisPublisherService } from '../redis/redis-publisher.service';

@Injectable()
export class BillingSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingSchedulerService.name);
  private static readonly INTERVAL_MS = 60 * 1000;
  private initialSweep: NodeJS.Timeout | null = null;
  private interval: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly billingService: BillingService,
    private readonly redis: RedisPublisherService,
  ) {}

  onModuleInit() {
    this.initialSweep = setTimeout(() => this.sweep().catch(() => {}), 5000);
    this.interval = setInterval(() => this.sweep().catch(() => {}), BillingSchedulerService.INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.initialSweep) clearTimeout(this.initialSweep);
    if (this.interval) clearInterval(this.interval);
    this.initialSweep = null;
    this.interval = null;
  }

  async sweep() {
    if (this.running) return;
    this.running = true;
    try {
      const sessions = await this.billingService.listReminderSessions();
      let reminders = 0;
      for (const session of sessions) {
        const items = await this.billingService.getRemindableInvoices(session);
        for (const item of items) {
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
          if (published) {
            reminders++;
          } else {
            this.logger.warn(`Billing reminder event could not be published for invoice ${item.invoice.id}`);
          }
        }
      }
      if (reminders) this.logger.log(`Published ${reminders} billing reminder event(s)`);
    } catch (error: any) {
      this.logger.error(`Billing reminder sweep failed: ${error?.message || error}`);
    } finally {
      this.running = false;
    }
  }
}
