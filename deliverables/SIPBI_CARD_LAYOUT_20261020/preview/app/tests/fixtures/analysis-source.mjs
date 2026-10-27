export const T = '2026-10-20T00:00:00.000Z';
export const disabledAi = {
  getAiStatus() { return { enabled: false, reason: 'missing' }; },
  async handleAnalysis() {
    return { statusCode: 503, body: { status: 'error', error: { code: 'ai_disabled', message: 'AI analysis is not configured.' } } };
  }
};

export const members = {
  ok: true,
  queriedAt: T,
  months: [
    { key: '202401', label: '2024-01' },
    { key: '202609', label: '2026-09' },
    { key: '202612', label: '2026-12' }
  ],
  members: {
    company: [{ key: '00020', label: 'Co' }],
    product: [{ key: 'P1', label: 'One' }, { key: 'P2', label: 'Two' }],
    customer: [{ key: 'C1', label: 'A' }, { key: 'C2', label: 'B' }],
    salesperson: [{ key: 'S1', label: 'Rep' }],
    plant: [{ key: '00020|1', label: 'Plant' }],
    costCenter: [{ key: '00020|9', label: 'CC' }]
  }
};

export function happyBundle() {
  return {
    ok: true,
    queriedAt: T,
    kpi: {
      netSalesUSD: 100, netCostUSD: 40, grossProfitUSD: 60, netQtyKG: 10, salesQtyKG: 12, returnQtyKG: 2,
      orderCount: 3, salesLineCount: 4, fullReturnLineCount: 1, partialReturnLineCount: 0,
      allowanceLineCount: 2, negativeMarginLineCount: 1
    },
    monthly: [
      { key: '202608', label: '2026-08', netSalesUSD: 40, orderCount: 1, salesLineCount: 2 },
      { key: '202609', label: '2026-09', netSalesUSD: 100, orderCount: 1, salesLineCount: 4 }
    ],
    companies: [{ key: '00020', label: 'Co', netSalesUSD: 100, salesLineCount: 4 }],
    products: [
      { key: 'P2', label: 'Two', netSalesUSD: 70, grossProfitUSD: 30, salesLineCount: 1 },
      { key: 'P1', label: 'One', netSalesUSD: 30, grossProfitUSD: 30, salesLineCount: 1 }
    ],
    categories: [{ key: 'PE', label: 'PE', netSalesUSD: 100, salesLineCount: 4 }],
    customers: [
      { key: 'C2', label: 'B', netSalesUSD: 60, salesLineCount: 1 },
      { key: 'C1', label: 'A', netSalesUSD: 40, salesLineCount: 1 }
    ],
    salespeople: [{ key: 'S1', label: 'Rep', netSalesUSD: 100, salesLineCount: 4 }],
    plants: [{ key: '00020|1', label: 'Plant', netSalesUSD: 100, salesLineCount: 4 }],
    costCenters: [{ key: '00020|9', label: 'CC', netSalesUSD: 100, salesLineCount: 4 }],
    priorKpi: { netSalesUSD: 30, salesLineCount: 2, orderCount: 2 },
    priorProducts: [
      { key: 'P1', label: 'One', netSalesUSD: 20, salesLineCount: 1 },
      { key: 'P3', label: 'Gone', netSalesUSD: 10, salesLineCount: 1 }
    ],
    ytdKpi: { netSalesUSD: 80, salesLineCount: 3, orderCount: 4 },
    rolling3Kpi: { netSalesUSD: 15, salesLineCount: 3, orderCount: 9 },
    rolling12Kpi: { netSalesUSD: 50, salesLineCount: 4, orderCount: 11 }
  };
}
