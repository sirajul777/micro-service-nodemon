import { Injectable, Logger } from '@nestjs/common';
import { RedisPublisherService } from './redis-publisher.service';

/** Redis topic for batch creation events → mikrotik-go-service. */
export const ERP_TOPIC = {
  BATCH_CREATED: 'voucher.batch.created',
} as const;

interface VoucherBatchCreatedPayload {
  batchId: string;
  sessionId: string;
  profileName: string;
  vouchers: Array<{
    username: string;
    password: string;
    profile: string;
    limitUptime?: string;
  }>;
}

/**
 * Publishes a typed event envelope. The Go consumer expects the payload in
 * `data` so the same contract works for Redis Streams and Pub/Sub consumers.
 */
@Injectable()
export class VoucherBatchPublisherService {
  private readonly logger = new Logger(VoucherBatchPublisherService.name);

  constructor(private readonly publisher: RedisPublisherService) {}

  async publishBatchCreated(payload: VoucherBatchCreatedPayload): Promise<boolean> {
    const ok = await this.publisher.publish(ERP_TOPIC.BATCH_CREATED, {
      type: ERP_TOPIC.BATCH_CREATED,
      sessionId: payload.sessionId,
      data: payload,
    });

    this.logger.log(
      ok
        ? `[batch] published voucher.batch.created for ${payload.batchId}`
        : `[batch] failed to publish voucher.batch.created for ${payload.batchId}`,
    );
    return ok;
  }
}
