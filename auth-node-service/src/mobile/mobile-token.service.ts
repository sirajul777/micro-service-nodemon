import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { MobileTokenEntity } from '../entities/mobile-token.entity';

export interface MobileUserToken {
  token: string;
  userId: string;
  username: string;
  name: string;
  role: string;
  permissions: any;
  sessionId: any;
  createdAt: string;
  expiresAt: string;
  lastUsed: string;
}

@Injectable()
export class MobileTokenService {
  constructor(
    @InjectRepository(MobileTokenEntity)
    private readonly tokenRepo: Repository<MobileTokenEntity>,
  ) {}

  async generate(
    userId: string,
    username: string,
    name: string,
    role: string,
    permissions: any,
    allowedSessions: any,
  ): Promise<MobileUserToken> {
    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const exp = new Date(now);
    exp.setDate(exp.getDate() + 30);

    const mToken: MobileUserToken = {
      token,
      userId,
      username,
      name,
      role,
      permissions,
      sessionId: allowedSessions[0],
      createdAt: now.toISOString(),
      expiresAt: exp.toISOString(),
      lastUsed: now.toISOString(),
    };

    await this.tokenRepo.delete({ userId });

    await this.tokenRepo.save(
      this.tokenRepo.create({
        token,
        userId,
        username,
        name,
        role,
        permissions,
        sessionId: allowedSessions[0],
        createdAt: now.toISOString(),
        expiresAt: exp.toISOString(),
        lastUsed: now.toISOString(),
      }),
    );
    return mToken;
  }

  async verify(token: string): Promise<MobileUserToken | null> {
    const t = await this.tokenRepo.findOne({ where: { token } });
    if (!t) return null;
    if (new Date(t.expiresAt) < new Date()) return null;

    t.lastUsed = new Date().toISOString();
    await this.tokenRepo.save(t);

    return {
      token: t.token,
      userId: t.userId,
      username: t.username,
      name: t.name,
      role: t.role,
      permissions: t.permissions,
      sessionId: t.sessionId,
      createdAt: t.createdAt,
      expiresAt: t.expiresAt,
      lastUsed: t.lastUsed,
    };
  }

  async revoke(token: string): Promise<boolean> {
    const result = await this.tokenRepo.delete({ token });
    return (result.affected || 0) > 0;
  }

  async loadAll(): Promise<MobileUserToken[]> {
    const rows = await this.tokenRepo.find();
    return rows.map((t) => ({
      token: t.token,
      userId: t.userId,
      username: t.username,
      name: t.name,
      role: t.role,
      permissions: t.permissions,
      sessionId: t.sessionId,
      createdAt: t.createdAt,
      expiresAt: t.expiresAt,
      lastUsed: t.lastUsed,
    }));
  }
}
