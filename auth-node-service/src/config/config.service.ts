import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { AppConfigEntity } from '../entities/app-config.entity';

const CIPHER_KEY = (process.env.CIPHER_KEY || 'mikhmon16bytekey').padEnd(16).slice(0, 16);

/**
 * Legacy single-admin config (from data/config.json in the monolith).
 * Owned by the auth service since it's part of identity/authentication.
 */
@Injectable()
export class ConfigService {
  constructor(
    @InjectRepository(AppConfigEntity)
    private readonly configRepo: Repository<AppConfigEntity>,
  ) {}

  encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(CIPHER_KEY);
    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
    return iv.toString('base64') + ':' + encrypted.toString('base64');
  }

  decrypt(encrypted: string): string {
    try {
      const [ivStr, encStr] = encrypted.split(':');
      const iv = Buffer.from(ivStr, 'base64');
      const key = Buffer.from(CIPHER_KEY);
      const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encStr, 'base64')),
        decipher.final(),
      ]);
      return decrypted.toString();
    } catch {
      return encrypted;
    }
  }

  private async getAdminConfig(): Promise<AppConfigEntity> {
    let row = await this.configRepo.findOne({ where: { key: 'default' } });
    if (!row) {
      row = this.configRepo.create({
        key: 'default',
        adminUser: 'mikhmon',
        adminPass: this.encrypt('1234'),
        currency: 'Rp',
      });
      row = await this.configRepo.save(row);
    }
    return row;
  }

  async validateAdmin(user: string, pass: string): Promise<boolean> {
    const cfg = await this.getAdminConfig();
    return user === cfg.adminUser && pass === this.decrypt(cfg.adminPass);
  }

  async changeAdminPassword(username: string, newPassword: string): Promise<boolean> {
    const cfg = await this.getAdminConfig();
    if (username !== cfg.adminUser) return false;
    cfg.adminPass = this.encrypt(newPassword);
    await this.configRepo.save(cfg);
    return true;
  }

  async getAdminUser(): Promise<string> {
    const cfg = await this.getAdminConfig();
    return cfg.adminUser;
  }
}
