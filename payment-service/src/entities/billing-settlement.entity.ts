import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A cash-settlement record submitted by a collector. Mirrors the monolith's
 * settlements table in `db_payment`.
 */
@Entity('billing_settlements')
export class BillingSettlementEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  sessionId: string;

  @Column({ default: '' })
  collectorId: string;

  @Column({ default: '' })
  collectorName: string;

  @Column({ type: 'int', default: 0 })
  amount: number;

  @Column({ default: 'pending' })
  status: string; // pending | verified

  @Column({ nullable: true })
  note: string;

  @CreateDateColumn()
  createdAt: string;
}
