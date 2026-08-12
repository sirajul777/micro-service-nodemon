import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboxEventEntity } from '../entities/outbox-event.entity';
import { RedisPublisherService } from '../redis/redis-publisher.service';

@Injectable()
export class OutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @InjectRepository(OutboxEventEntity) private readonly repo: Repository<OutboxEventEntity>,
    private readonly publisher: RedisPublisherService,
  ) {}

  onModuleInit() { this.timer = setInterval(() => void this.flush(), 2000); void this.flush(); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  async flush(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const events = await this.repo.find({ where: [{ status: 'pending' }, { status: 'processing' }], order: { createdAt: 'ASC' }, take: 25 });
      for (const event of events) {
        event.status = 'processing'; event.attempts += 1; await this.repo.save(event);
        const ok = await this.publisher.publish(event.topic, { ...event.payload, eventId: event.id });
        if (ok) { event.status = 'published'; event.processedAt = new Date(); event.lastError = null; }
        else { event.status = 'pending'; event.lastError = 'Redis publish failed'; }
        await this.repo.save(event);
      }
    } catch (error: any) {
      this.logger.error(`[outbox] flush failed: ${error?.message || error}`);
    } finally { this.running = false; }
  }
}
