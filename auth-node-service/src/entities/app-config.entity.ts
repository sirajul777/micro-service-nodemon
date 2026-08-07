import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Singleton row for the app-wide admin config (legacy single-admin). */
@Entity('app_config')
export class AppConfigEntity {
  @PrimaryColumn({ default: 'default' })
  key: string;

  @Column({ default: 'mikhmon' })
  adminUser: string;

  @Column()
  adminPass: string;

  @Column({ default: 'Rp' })
  currency: string;
}
