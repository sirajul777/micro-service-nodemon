import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProfileMetaService } from './profile-meta.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * Profile metadata controller (hotspot & pppoe).
 * All endpoints require JWT auth.
 */
@Controller('voucher/profile-meta')
@UseGuards(JwtAuthGuard)
export class ProfileMetaController {
  constructor(private readonly metaService: ProfileMetaService) {}

  /** Get a single profile's metadata. */
  @Get(':kind/:sessionId/:profileName')
  async get(
    @Param('kind') kind: string,
    @Param('sessionId') sessionId: string,
    @Param('profileName') profileName: string,
  ) {
    if (kind !== 'hotspot' && kind !== 'pppoe') {
      return { error: 'kind must be "hotspot" or "pppoe"' };
    }
    const meta = await this.metaService.get(kind as any, sessionId, profileName);
    return { success: true, meta };
  }

  /** Get all profile metadata for a session. */
  @Get(':kind/:sessionId')
  async getAllForSession(
    @Param('kind') kind: string,
    @Param('sessionId') sessionId: string,
  ) {
    if (kind !== 'hotspot' && kind !== 'pppoe') {
      return { error: 'kind must be "hotspot" or "pppoe"' };
    }
    const meta = await this.metaService.getAllForSession(kind as any, sessionId);
    return { success: true, meta };
  }

  /** Upsert a profile's metadata. */
  @Post(':kind/:sessionId/:profileName')
  async set(
    @Param('kind') kind: string,
    @Param('sessionId') sessionId: string,
    @Param('profileName') profileName: string,
    @Body() body: any,
  ) {
    if (kind !== 'hotspot' && kind !== 'pppoe') {
      return { error: 'kind must be "hotspot" or "pppoe"' };
    }
    await this.metaService.set(kind as any, sessionId, profileName, {
      price: body.price !== undefined ? Number(body.price) : undefined,
      validity: body.validity,
      profileColor: body.profileColor,
      caption: body.caption,
      active: body.active !== undefined ? !!body.active : undefined,
    });
    return { success: true };
  }

  /** Remove a profile's metadata. */
  @Delete(':kind/:sessionId/:profileName')
  async remove(
    @Param('kind') kind: string,
    @Param('sessionId') sessionId: string,
    @Param('profileName') profileName: string,
  ) {
    if (kind !== 'hotspot' && kind !== 'pppoe') {
      return { error: 'kind must be "hotspot" or "pppoe"' };
    }
    await this.metaService.remove(kind as any, sessionId, profileName);
    return { success: true };
  }
}
