import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A monthly invoice for a billing customer. Mirrors the monolith's
 * invoices table in `db_payment`.
 */
@Entity('billing_invoices')
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
  period: string; // e.g. "2025-06"

  @Column({ type: 'int', default: 0 })
  amount: number;

  @Column({ default: 'unpaid' })
  status: string; // unpaid | paid | overdue

  @Column({ nullable: true })
  dueDate: string;

  @Column({ nullable: true })
  paidAt: string;

  @Column({ nullable: true })
  paidBy: string;

  @Column({ nullable: true })
  note: string;

  @Column({ type: 'boolean', default: false })
  reminderSent: boolean;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}
