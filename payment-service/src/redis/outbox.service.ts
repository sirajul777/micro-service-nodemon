import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PaymentOutboxEntity } from '../entities/payment-outbox.entity';
import { RedisPublisherService } from './redis-publisher.service';

/**
 * Transactional outbox relay.
 *
 * Producers (VoucherOrderService) insert a PaymentOutboxEntity *in the same
 * transaction* as the state change (marking the order PAID). This service then
 * polls unsent rows, publishes them to Redis, and marks them `sent`. If the
 * process crashes between commit and publish, the row is still there and gets
 * picked up on the next poll — no event is dropped.
 *
 * Consumers (bot-py, erp) must be idempotent keyed on `key` (orderId).
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);
  private static readonly POLL_MS = 2000;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(PaymentOutboxEntity)
    private readonly outboxRepo: Repository<PaymentOutboxEntity>,
    private readonly publisher: RedisPublisherService,
    private readonly dataSource: DataSource,
  ) {}

  /** Start the relay loop (called from PaymentModule.onModuleInit). */
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.flush().catch(() => undefined), OutboxService.POLL_MS);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Write an outbox row atomically with the settlement (caller provides the manager). */
  enqueue(
    manager: any,
    topic: string,
    payload: Record<string, any>,
    key?: string,
  ): Promise<PaymentOutboxEntity> {
    const repo = manager.getRepository(PaymentOutboxEntity);
    return repo.save(
      repo.create({
        topic,
        payload: JSON.stringify(payload),
        key: key || null,
        sent: false,
        attempts: 0,
      }),
    );
  }

  /** Publish all unsent rows and mark them sent. Returns count published. */
  async flush(batchSize = 50): Promise<number> {
    const rows = await this.outboxRepo.find({
      where: { sent: false },
      take: batchSize,
      order: { createdAt: 'ASC' },
    });
    let published = 0;
    for (const row of rows) {
      let payload: Record<string, any> = {};
      try {
        payload = JSON.parse(row.payload || '{}');
      } catch {
        payload = { raw: row.payload };
      }
      const ok = await this.publisher.publish(row.topic, payload);
      if (ok) {
        await this.outboxRepo.update({ id: row.id }, { sent: true });
        published++;
      } else {
        await this.outboxRepo.update(
          { id: row.id },
          { attempts: row.attempts + 1, lastError: 'publish failed at ' + new Date().toISOString() },
        );
      }
    }
    return published;
  }
}
