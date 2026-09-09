import { Response } from 'express';
import { ReportRouterGrpcClient } from '../erp/report-router-grpc.client';

export async function handleReportResumeGrpc(
  reportRouterGrpc: ReportRouterGrpcClient,
  res: Response,
  session: string,
  idbl = '',
) {
  try {
    const response = await reportRouterGrpc.getResumeReport(session, idbl);
    if (!response?.success) {
      return res.status(502).json({ success: false, message: response?.error || 'Report gRPC resume failed' });
    }
    return res.status(200).json({
      daily: (response.daily || []).map((row: any) => ({
        date: String(row.date || ''),
        vouchers: Number(row.vouchers || 0),
        total: Number(row.total || 0),
      })),
      summary: {
        totalVouchers: Number(response.totalVouchers || 0),
        totalIncome: Number(response.totalIncome || 0),
        currency: String(response.currency || 'Rp'),
        isIndo: Boolean(response.isIndo),
        month: String(response.month || ''),
        year: String(response.year || ''),
      },
    });
  } catch (err: any) {
    return res.status(502).json({ success: false, message: `Report gRPC unavailable: ${err?.message || err}` });
  }
}
