import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { VoucherOrderService } from './voucher-order.service';

/**
 * Periodically sweeps PENDING/PROCESSING QRIS voucher orders whose
 * `expiresAt` has passed and marks them EXPIRED — then permanently deletes
 * EXPIRED/FAILED orders older than the configured retention window
 * (`payhookExpiredRetentionDays`), keeping the table from growing forever with
 * abandoned carts. PAID orders are never deleted.
 */
@Injectable()
export class PayhookSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PayhookSchedulerService.name);
  private static readonly SWEEP_INTERVAL_MS = 60 * 1000;
  private initialSweep: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private stopping = false;
  private activeSweep: Promise<void> | null = null;

  constructor(private readonly orderService: VoucherOrderService) {}

  onModuleInit() {
    this.stopping = false;
    this.initialSweep = setTimeout(() => {
      if (!this.stopping) void this.sweep();
    }, 5000);
    this.interval = setInterval(() => {
      if (!this.stopping) void this.sweep();
    }, PayhookSchedulerService.SWEEP_INTERVAL_MS);
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
      await this.orderService.expireStaleOrders();
      if (this.stopping) return;
      await this.orderService.pruneOldUnpaidOrders();
    } catch (e: any) {
      if (!this.stopping) {
        this.logger.error(`Gagal menjalankan sweep PayHook: ${e?.message || e}`);
      }
    } finally {
      this.running = false;
      this.activeSweep = null;
    }
  }
}
