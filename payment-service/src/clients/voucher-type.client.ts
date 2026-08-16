import { Injectable } from '@nestjs/common';
import { GrpcVoucherTypeClient } from '../erp/grpc-voucher-type.client';

export interface VoucherTypeDto {
  id: string;
  name: string;
  price: number;
  profile: string;
  duration: string;
  codeLength: number;
  codeFormat: string;
  userType: string;
  active: boolean;
}

@Injectable()
export class VoucherTypeClient {
  constructor(private readonly grpc: GrpcVoucherTypeClient) {}

  getById(id: string): Promise<VoucherTypeDto | null> {
    return this.grpc.getById(id);
  }
}
