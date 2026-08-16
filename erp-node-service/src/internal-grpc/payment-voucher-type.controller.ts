import { GrpcMethod } from '@nestjs/microservices';
import { VoucherTypeService } from '../voucher-type/voucher-type.service';

export class PaymentVoucherTypeInternalController {
  constructor(private readonly voucherTypes: VoucherTypeService) {}

  @GrpcMethod('ErpInternalService', 'GetVoucherType')
  async getVoucherType(request: { id: string }) {
    const value = await this.voucherTypes.getById(request.id);
    if (!value) return { success: false, error: 'Not found' };
    return {
      success: true,
      voucherType: {
        id: value.id,
        name: value.name,
        price: Number(value.price) || 0,
        profile: value.profile || '',
        duration: value.duration || '',
        codeLength: Number(value.codeLength) || 6,
        codeFormat: value.codeFormat || 'upper+digit',
        userType: value.userType || 'up',
        active: !!value.active,
      },
    };
  }
}
