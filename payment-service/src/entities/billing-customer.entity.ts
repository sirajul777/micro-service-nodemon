import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A billing customer (an internet subscriber billed monthly).
 * Mirrors the monolith billing-customer business fields while keeping the
 * microservice-owned PostgreSQL schema.
 */
@Entity('billing_customers')
export class BillingCustomerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  sessionId: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  mikrotikUser: string;

  @Column({ default: 'hotspot' })
  type: string; // hotspot | pppoe

  @Column({ default: '' })
  profile: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  telegramId: string;

  @Column({ nullable: true })
  address: string;

  @Column({ type: 'int', default: 0 })
  price: number;

  /** Billing day of month (1-28). */
  @Column({ type: 'int', default: 1 })
  billDate: number;

  @Column({ default: 'active' })
  status: string; // active | suspended | expired | unpaid

  @Column({ type: 'real', nullable: true })
  unsettledCash: number;

  /** Whether overdue processing is allowed to suspend this subscriber. */
  @Column({ type: 'boolean', default: true })
  autoDisable: boolean;

  /** Number of days after due date before an invoice becomes overdue. */
  @Column({ type: 'int', default: 3 })
  graceDays: number;

  /** Days before due date when billing reminders should be sent. */
  @Column({ type: 'simple-json', nullable: true })
  reminderDays: number[];

  @Column({ nullable: true })
  joinedAt: string;

  @Column({ nullable: true })
  note: string;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}
