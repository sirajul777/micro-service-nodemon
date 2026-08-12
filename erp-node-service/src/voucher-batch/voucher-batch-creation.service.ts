import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { VoucherBatchEntity } from '../entities/voucher-batch.entity';
import { OutboxEventEntity } from '../entities/outbox-event.entity';
import { VoucherBatch } from './voucher-batch.service';

@Injectable()
export class VoucherBatchCreationService {
  constructor(private readonly dataSource: DataSource) {}

  async create(batch: VoucherBatch): Promise<VoucherBatch> {
    return this.dataSource.transaction(async (manager) => {
      const batches = manager.getRepository(VoucherBatchEntity);
      const existing = await batches.findOne({
        where: { id: batch.id, sessionId: batch.sessionId },
      });
      if (existing) {
        throw new ConflictException(`Voucher batch ${batch.id} already exists`);
      }

      const entity = batches.create({
        id: batch.id,
        sessionId: batch.sessionId,
        profileName: batch.profileName,
        profileColor: batch.profileColor || '#1f6feb',
        price: batch.price || 0,
        totalPrice: batch.totalPrice || 0,
        validity: batch.validity || '',
        caption: batch.caption || '',
        nasName: batch.nasName || '',
        createdBy: batch.createdBy || '',
        createdAt: batch.createdAt || new Date().toISOString(),
        resellerId: batch.resellerId || '',
        resellerName: batch.resellerName || '',
        vouchers: batch.vouchers || [],
      });
      const saved = await batches.save(entity);

      const event = manager.getRepository(OutboxEventEntity).create({
        id: randomUUID(),
        topic: 'voucher.batch.created',
        status: 'pending',
        attempts: 0,
        lastError: null,
        processedAt: null,
        payload: {
          type: 'voucher.batch.created',
          sessionId: saved.sessionId,
          data: {
            batchId: saved.id,
            sessionId: saved.sessionId,
            profileName: saved.profileName,
            vouchers: (saved.vouchers || []).map((v) => ({
              username: v.username,
              password: v.password,
              profile: v.profile,
              limitUptime: v.limitUptime || '',
            })),
          },
        },
      });
      await manager.getRepository(OutboxEventEntity).save(event);

      return batch;
    });
  }
}
