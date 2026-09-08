export function mapResumeReportResponse(response: any) {
  return {
    daily: (response?.daily || []).map((row: any) => ({
      date: String(row?.date || ''),
      vouchers: Number(row?.vouchers || 0),
      total: Number(row?.total || 0),
    })),
    summary: {
      totalVouchers: Number(response?.totalVouchers || 0),
      totalIncome: Number(response?.totalIncome || 0),
      currency: String(response?.currency || 'Rp'),
      isIndo: Boolean(response?.isIndo),
      month: String(response?.month || ''),
      year: String(response?.year || ''),
    },
  };
}
