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
 * Mirrors the monolith's billing customers table in `db_payment`.
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

  @Column({ type: 'int', default: 0 })
  price: number;

  @Column({ default: 'active' })
  status: string; // active | suspended | inactive

  @Column({ type: 'int', default: 0 })
  unsettledCash: number;

  @Column({ nullable: true })
  joinedAt: string;

  @Column({ nullable: true })
  note: string;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}
