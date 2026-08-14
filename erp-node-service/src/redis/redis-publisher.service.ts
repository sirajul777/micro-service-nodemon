import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Redis publisher used by ERP for reliable cross-service events.
 * Business events are written to Redis Streams without producer-side trimming.
 * Pub/Sub remains only as a compatibility notification for legacy subscribers;
 * reliable consumers must use the Stream/consumer-group path.
 */
@Injectable()
export class RedisPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisPublisherService.name);
  private client: Redis | null = null;

  private get host(): string {
    return process.env.REDIS_HOST || 'localhost';
  }
  private get port(): number {
    return Number(process.env.REDIS_PORT || 6379);
  }
  private get password(): string {
    return process.env.REDIS_PASSWORD || '';
  }

  onModuleInit() {
    this.client = new Redis({
      host: this.host,
      port: this.port,
      password: this.password || undefined,
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });
    this.client.on('error', (e) => this.logger.warn(`[redis] error: ${e.message}`));
    this.client.on('connect', () => this.logger.log(`[redis] connected to ${this.host}:${this.port}`));
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }

  async publish(topic: string, payload: Record<string, any>): Promise<boolean> {
    if (!this.client) return false;
    try {
      // Reliable events must not disappear because the producer crossed an
      // arbitrary message-count retention limit while a consumer was down.
      const id = await this.client.xadd(
        topic,
        '*',
        'data',
        JSON.stringify(payload),
      );
      this.client.publish(topic, JSON.stringify(payload)).catch(() => {});
      return !!id;
    } catch (e: any) {
      this.logger.error(`[redis] publish ${topic} failed: ${e.message}`);
      return false;
    }
  }
}
