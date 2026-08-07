import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn
} from 'typeorm';

/**
 * Outbox table for reliable cross-service event publishing (transactional
 * outbox pattern). A payment settlement writes an outbox row in the SAME
 * transaction that marks the order paid; a separate relay process then
 * publishes each row to Redis and marks it `sent`. This guarantees a crash
 * between "mark paid" and "publish payment.order.settled" never drops the
 * voucher notification / provisioning trigger.
 */
@Entity('payment_outbox')
export class PaymentOutboxEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Topic/channel to publish to, e.g. 'payment.order.settled'. */
  @Column()
  topic: string;

  /** Stringified JSON payload. */
  @Column({ type: 'text' })
  payload: string;

  /** Correlation key (e.g. orderId) for idempotent consumers. */
  @Column({ nullable: true })
  key: string;

  /** false = pending relay; true = already published to Redis. */
  @Column({ default: false })
  sent: boolean;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ nullable: true })
  lastError: string;

  @CreateDateColumn()
  createdAt: string;
}
