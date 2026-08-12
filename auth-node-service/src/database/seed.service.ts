import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UserEntity } from '../entities/user.entity';
import { AppConfigEntity } from '../entities/app-config.entity';

const CIPHER_KEY = (process.env.CIPHER_KEY || 'mikhmon16bytekey').padEnd(16).slice(0, 16);

/** Same AES-128-CBC scheme as config.service.ts's encrypt() — duplicated
 * here (rather than injecting ConfigService) to avoid a circular module
 * dependency at bootstrap time. Keep these two in sync if the cipher ever
 * changes. */
function encryptAdminPass(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(CIPHER_KEY);
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
  return iv.toString('base64') + ':' + encrypted.toString('base64');
}

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
        // Must match config.service.ts's own encrypted-at-rest convention —
        // this previously stored the plaintext '1234' directly. It happened
        // to still authenticate correctly (ConfigService.decrypt() falls
        // back to returning its input verbatim when it can't parse the
        // iv:ciphertext format), but the admin password sat in the
        // database completely unencrypted until the first password change.
        adminPass: encryptAdminPass('1234'),
        currency: 'Rp',
      }),
    );
    this.logger.log('Default admin config seeded');
  }
}