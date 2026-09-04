import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Monitoring/audit log for every webhook received from PayHook Android app
 * (or any callback source), including unmatched-payment reconciliation state.
 */
@Entity('payhook_callback_logs')
export class PayhookCallbackLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Source identifier: 'payhook-app', 'payhook-server', 'manual', ... */
  @Column({ default: 'payhook-app' })
  source: string;

  /**
   * PayHook's idempotency key. When present it is unique across callbacks.
   */
  @Index({ unique: true })
  @Column({ nullable: true })
  eventId: string;

  /** The nominal that arrived in the webhook. */
  @Column({ type: 'int', default: 0 })
  amount: number;

  /** Status as reported by the sender (e.g. 'COMPLETED', 'SUCCESS'). */
  @Column({ nullable: true })
  status: string;

  /** Whether the amount matched a pending voucher order at receipt time. */
  @Column({ default: false })
  matched: boolean;

  /** The orderId of the matched order (if any). */
  @Column({ nullable: true })
  matchedOrderId: string;

  /** Current reconciliation lifecycle: none | candidate | reconciled | rejected. */
  @Column({ default: 'none' })
  reconciliationStatus: string;

  /** Operator ID/name when a callback candidate is reconciled/rejected. */
  @Column({ nullable: true })
  reconciledBy: string;

  /** ISO timestamp when reconciliation was completed/rejected. */
  @Column({ nullable: true })
  reconciledAt: string;

  /** Human-readable audit note. */
  @Column({ type: 'text', nullable: true })
  note: string;

  /** Full raw payload sent by the sender, kept for audit/debugging. */
  @Column({ type: 'text', nullable: true })
  rawPayload: string;

  @CreateDateColumn()
  processedAt: string;
}
