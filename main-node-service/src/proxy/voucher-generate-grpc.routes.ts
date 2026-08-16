import { VoucherGenerateGrpcClient } from '../erp/voucher-generate-grpc.client';

export function attachVoucherGenerateGrpcRoutes(ctx: any, client: VoucherGenerateGrpcClient) {
  ctx.voucherGenerateGrpc = client;
}
