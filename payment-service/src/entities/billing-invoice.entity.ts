import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A monthly invoice for a billing customer.
 * Keeps the business fields required by the monolith while remaining owned by
 * the payment service.
 */
@Entity('billing_invoices')
@Index(['sessionId', 'customerId', 'period'], { unique: true })
export class BillingInvoiceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  sessionId: string;

  @Index()
  @Column()
  customerId: string;

  @Column({ default: '' })
  customerName: string;

  @Column({ default: '' })
  type: string; // hotspot | pppoe

  @Column({ nullable: true })
  mikrotikUser: string;

  @Column({ default: '' })
  profile: string;

  @Column({ default: '' })
  period: string; // e.g. "Agustus 2026"

  @Column({ type: 'int', default: 0 })
  amount: number;

  @Column({ default: 'unpaid' })
  status: string; // unpaid | paid | overdue | cancelled

  @Column({ nullable: true })
  dueDate: string;

  @Column({ nullable: true })
  paidAt: string;

  @Column({ nullable: true })
  paidBy: string;

  @Column({ nullable: true })
  note: string;

  /** ISO timestamps of reminders sent; kept as an array for daily idempotency. */
  @Column({ type: 'simple-json', nullable: true })
  reminderSent: string[];

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}
