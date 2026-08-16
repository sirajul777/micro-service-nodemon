import { GrpcMethod } from '@nestjs/microservices';
import { VoucherTypeService } from '../voucher-type/voucher-type.service';

export class VoucherTypeInternalController {
  constructor(private readonly service: VoucherTypeService) {}

  @GrpcMethod('ErpInternalService', 'ListVoucherTypes')
  async listVoucherTypes() {
    return { success: true, voucherTypes: await this.service.getAll() };
  }

  @GrpcMethod('ErpInternalService', 'GetActiveVoucherTypes')
  async getActiveVoucherTypes() {
    return { success: true, voucherTypes: await this.service.getActive() };
  }

  @GrpcMethod('ErpInternalService', 'GetVoucherType')
  async getVoucherType(request: { id: string }) {
    const voucherType = await this.service.getById(request.id);
    if (!voucherType) return { success: false, error: 'Not found' };
    return { success: true, voucherType };
  }

  @GrpcMethod('ErpInternalService', 'CreateVoucherType')
  async createVoucherType(request: Record<string, any>) {
    return { success: true, voucherType: await this.service.upsert(request as any) };
  }

  @GrpcMethod('ErpInternalService', 'UpdateVoucherType')
  async updateVoucherType(request: Record<string, any>) {
    return { success: true, voucherType: await this.service.upsert(request as any) };
  }

  @GrpcMethod('ErpInternalService', 'DeleteVoucherType')
  async deleteVoucherType(request: { id: string }) {
    return { success: true, deleted: await this.service.delete(request.id) };
  }

  @GrpcMethod('ErpInternalService', 'ToggleVoucherType')
  async toggleVoucherType(request: { id: string }) {
    const voucherType = await this.service.toggleActive(request.id);
    return voucherType
      ? { success: true, voucherType }
      : { success: false, error: 'Not found' };
  }
}
