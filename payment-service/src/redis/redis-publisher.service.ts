import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Thin Redis publisher used by the outbox relay to broadcast cross-service
 * events (payment.order.paid / payment.order.settled / payment.failed).
 *
 * Using ioredis directly (rather than @nestjs/microservices client) keeps it
 * simple and lets us control reconnection + auth from env.
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

  /** Publish a JSON payload to a topic. Resolves false on failure (non-throwing for the relay). */
  async publish(topic: string, payload: Record<string, any>): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.publish(topic, JSON.stringify(payload));
      return true;
    } catch (e: any) {
      this.logger.error(`[redis] publish ${topic} failed: ${e.message}`);
      return false;
    }
  }
}
