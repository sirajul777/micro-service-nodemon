import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { VoucherTypeService, VoucherType } from './voucher-type.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * Voucher type CRUD controller.
 * Public endpoints for unauthenticated lookup (used by payment-service),
 * protected endpoints for admin management.
 */
@Controller('voucher/types')
export class VoucherTypeController {
  constructor(private readonly vtService: VoucherTypeService) {}

  /** Public: get all voucher types (used by payment-service VoucherTypeClient). */
  @Get()
  async getAll() {
    return this.vtService.getAll();
  }

  /** Public: get active voucher types only. */
  @Get('active')
  async getActive() {
    return this.vtService.getActive();
  }

  /**
   * Public: get a single voucher type by ID.
   * payment-service's VoucherTypeClient expects this endpoint returning
   * either { success, data }, { voucherType }, or the raw entity.
   */
  @Get(':id')
  async getOne(@Param('id') id: string) {
    const v = await this.vtService.getById(id);
    if (!v) return { success: false, error: 'Not found' };
    return v;
  }

  // ── Admin endpoints (JWT required) ──────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() body: any) {
    if (!body.name || !body.profile) return { error: 'name dan profile wajib diisi' };
    return this.vtService.upsert(body);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(@Param('id') id: string, @Body() body: any) {
    return this.vtService.upsert({ ...body, id });
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async delete(@Param('id') id: string) {
    return { success: await this.vtService.delete(id) };
  }

  @Patch(':id/toggle')
  @UseGuards(JwtAuthGuard)
  async toggle(@Param('id') id: string) {
    const v = await this.vtService.toggleActive(id);
    return v ? { success: true, active: v.active } : { error: 'Not found' };
  }
}
