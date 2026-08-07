import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserEntity } from '../entities/user.entity';
import { AppConfigEntity } from '../entities/app-config.entity';

/**
 * Seeds the default admin user (mikhmon/1234) and the legacy admin config
 * on first boot, so the service is usable out of the box.
 */
@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(AppConfigEntity)
    private readonly configRepo: Repository<AppConfigEntity>,
  ) {}

  async onModuleInit() {
    await this.seedAdminUser();
    await this.seedAdminConfig();
  }

  private async seedAdminUser() {
    const existing = await this.userRepo.findOne({ where: { username: 'mikhmon' } });
    if (existing) return;
    const hash = await bcrypt.hash('1234', 10);
    await this.userRepo.save(
      this.userRepo.create({
        id: `USR-${Date.now()}`,
        username: 'mikhmon',
        password: hash,
        name: 'MikHMon Admin',
        role: 'admin',
        active: true,
        allowedSessions: [],
        permissions: {
          viewDashboard: true,
          manageVoucher: true,
          manageBilling: true,
          manageReseller: true,
          managePppoe: true,
          manageHotspot: true,
          viewReport: true,
          manageSystem: true,
        },
        note: 'Default admin',
      }),
    );
    this.logger.log('Default admin user seeded (mikhmon/1234)');
  }

  private async seedAdminConfig() {
    const existing = await this.configRepo.findOne({ where: { key: 'default' } });
    if (existing) return;
    await this.configRepo.save(
      this.configRepo.create({
        key: 'default',
        adminUser: 'mikhmon',
        adminPass: '1234',
        currency: 'Rp',
      }),
    );
    this.logger.log('Default admin config seeded');
  }
}
