import { Injectable, Logger } from '@nestjs/common';
import { RedisPublisherService } from './redis-publisher.service';

/** Redis topic for batch creation events → mikrotik-go-service. */
export const ERP_TOPIC = {
  /** A voucher batch was saved → Go pushes the vouchers to the router. */
  BATCH_CREATED: 'voucher.batch.created',
} as const;

/**
 * Pushes `voucher.batch.created` events to Redis so mikrotik-go-service can
 * provision the batch's vouchers onto the router. Non-transactional (fire &
 * forget) — the batch is already persisted; this is a best-effort trigger.
 */
@Injectable()
export class VoucherBatchPublisherService {
  private readonly logger = new Logger(VoucherBatchPublisherService.name);

  constructor(private readonly publisher: RedisPublisherService) {}

  async publishBatchCreated(payload: {
    batchId: string;
    sessionId: string;
    profileName: string;
    vouchers: Array<{ username: string; password: string; profile: string; limitUptime?: string }>;
  }): Promise<boolean> {
    const ok = await this.publisher.publish(ERP_TOPIC.BATCH_CREATED, payload);
    this.logger.log(
      ok
        ? `[batch] published voucher.batch.created for ${payload.batchId}`
        : `[batch] failed to publish voucher.batch.created for ${payload.batchId}`,
    );
    return ok;
  }
}
