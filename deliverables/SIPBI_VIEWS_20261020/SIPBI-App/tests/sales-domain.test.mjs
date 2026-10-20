import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COVERAGE_END,
  COVERAGE_START,
  PAGES,
  PUBLIC_MEASURES,
  buildDashboard,
  buildWaterfall,
  concentration,
  deriveMetrics,
  enumerateMonths,
  median,
  normalizeBundle,
  parseSearch,
  planWindows,
  portfolio,
  resolvePage,
  sortRows,
  zeroFillMonths
} from '../scripts/sales-domain.mjs';

const FILTERS = {
  month: '202609', company: 'All', product: 'All', customer: 'All',
  salesperson: 'All', plant: 'All', costCenter: 'All'
};
const SOURCE = {
  server: 'localhost:25000',
  database: 'JDE_SALES_CUBE_20261020',
  cube: 'JDE Sales',
  dateRole: 'Invoice Date',
  currency: 'USD',
  quantityUnit: 'KG',
  synthetic: true,
  coverageStart: '202401',
  coverageEnd: '202609',
  queriedAt: '2026-10-20T00:00:00.000Z'
};

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, actual + ' vs ' + expected);
}

test('coverage span is the 33 complete invoice months', () => {
  assert.equal(enumerateMonths(COVERAGE_START, COVERAGE_END).length, 33);
});

test('windows stay inside coverage and do not extrapolate', () => {
  const sep = planWindows('202609');
  assert.equal(sep.historyStatus, 'available');
  assert.equal(sep.priorMonth, '202509');
  assert.equal(sep.ytdMonths.length, 9);
  assert.deepEqual(sep.rolling3Months, ['202607', '202608', '202609']);
  assert.equal(sep.rolling12Months[0], '202510');
  assert.equal(sep.rolling12Months.at(-1), '202609');
  assert.equal(sep.monthlyMonths.length, 33);

  const early = planWindows('202403');
  assert.equal(early.historyStatus, 'insufficient_history');
  assert.equal(early.priorMonth, null);
  assert.deepEqual(early.ytdMonths, ['202401', '202402', '202403']);
  assert.deepEqual(early.rolling3Months, ['202401', '202402', '202403']);
  assert.equal(early.rolling12Months, null);

  assert.equal(planWindows('202402').rolling3Months, null);
  assert.equal(planWindows('202401').ytdMonths.length, 1);
  assert.equal(planWindows('202610').monthlyMonths, null);
  assert.equal(planWindows('202610').historyStatus, 'insufficient_history');

  const all = planWindows('All');
  assert.equal(all.historyStatus, 'not_applicable');
  assert.equal(all.priorMonth, null);
  assert.equal(all.ytdMonths, null);
  assert.equal(all.rolling3Months, null);
  assert.equal(all.rolling12Months, null);
  assert.equal(all.monthlyMonths.length, 33);

  const jan = planWindows('202501');
  assert.equal(jan.priorMonth, '202401');
  assert.deepEqual(jan.ytdMonths, ['202501']);
  assert.equal(jan.rolling12Months[0], '202402');
});

test('ratios are fractions and zero denominators stay null', () => {
  const metrics = deriveMetrics({
    netSalesUSD: 200, netCostUSD: 80, grossProfitUSD: 50,
    netQtyKG: 4, salesQtyKG: 10, returnQtyKG: 2,
    orderCount: 3.0000001, salesLineCount: 4
  });
  close(metrics.grossMarginPercent, 0.25);
  close(metrics.returnRatePercent, 0.2);
  close(metrics.averageSellingPriceUSD, 50);
  assert.equal(metrics.orderCount, 3);
  const emptyDenom = deriveMetrics({ netSalesUSD: 0, grossProfitUSD: 0, salesQtyKG: 0, returnQtyKG: 5, netQtyKG: 0 });
  assert.equal(emptyDenom.grossMarginPercent, null);
  assert.equal(emptyDenom.returnRatePercent, null);
  assert.equal(emptyDenom.averageSellingPriceUSD, null);
});

test('rankings sort by net sales then key', () => {
  const rows = sortRows([
    { key: 'b', netSalesUSD: 10 },
    { key: 'a', netSalesUSD: 10 },
    { key: 'c', netSalesUSD: 12 },
    { key: 'd', netSalesUSD: null }
  ], 'customer');
  assert.deepEqual(rows.map((row) => row.key), ['c', 'a', 'b', 'd']);
});

test('waterfall keeps disappearing products and delta ties', () => {
  const rows = buildWaterfall(
    [{ key: 'P2', label: 'Two', netSalesUSD: 70 }, { key: 'P1', label: 'One', netSalesUSD: 30 }],
    [{ key: 'P1', label: 'One', netSalesUSD: 20 }, { key: 'P3', label: 'Gone', netSalesUSD: 10 }]
  );
  assert.deepEqual(rows.map((row) => row.key), ['P2', 'P1', 'P3']);
  const delta = rows.reduce((sum, row) => sum + row.delta, 0);
  const current = rows.reduce((sum, row) => sum + row.current, 0);
  const prior = rows.reduce((sum, row) => sum + row.prior, 0);
  assert.equal(delta, current - prior);
  assert.equal(delta, 70);
});

test('concentration rejects negative or nonpositive populations', () => {
  const ok = concentration([
    { key: 'a', netSalesUSD: 50 },
    { key: 'b', netSalesUSD: 30 },
    { key: 'c', netSalesUSD: 20 }
  ]);
  assert.equal(ok.concentrationStatus, 'available');
  close(ok.cr5, 1);
  close(ok.hhi, 0.25 + 0.09 + 0.04);
  const top = concentration([
    { key: 'f', netSalesUSD: 10 },
    { key: 'e', netSalesUSD: 10 },
    { key: 'd', netSalesUSD: 10 },
    { key: 'c', netSalesUSD: 10 },
    { key: 'b', netSalesUSD: 10 },
    { key: 'a', netSalesUSD: 50 }
  ]);
  close(top.cr5, 0.9);
  assert.equal(concentration([{ key: 'a', netSalesUSD: -1 }, { key: 'b', netSalesUSD: 5 }]).concentrationStatus, 'invalid_population');
  assert.equal(concentration([{ key: 'a', netSalesUSD: 0 }]).concentrationStatus, 'invalid_population');
  assert.equal(concentration([]).concentrationStatus, 'no_data');
});

test('portfolio median and weighted margin do not average row ratios', () => {
  assert.equal(median([30, 10]), 20);
  assert.equal(median([10, 20, 40]), 20);
  assert.equal(median([-10, 10, 30]), 10);
  const result = portfolio(
    [{ netSalesUSD: 10, grossProfitUSD: 9 }, { netSalesUSD: 30, grossProfitUSD: 0 }],
    { grossProfitUSD: 25, netSalesUSD: 100 }
  );
  assert.equal(result.revenueMedian, 20);
  close(result.weightedMargin, 0.25);
  assert.equal(portfolio([{ netSalesUSD: 10 }], { grossProfitUSD: 1, netSalesUSD: 0 }).weightedMargin, null);
  assert.equal(portfolio([{ netSalesUSD: 10 }], { grossProfitUSD: -1, netSalesUSD: -5 }).weightedMargin, null);
});

test('empty covered months zero-fill additives and leave distinct order count null', () => {
  const rows = zeroFillMonths([
    { key: '202402', label: '2026-02', netSalesUSD: 5, orderCount: 2, salesLineCount: 1, grossMarginPercent: 0.2 }
  ], ['202401', '202402'], { '202401': '2024-01' });
  assert.equal(rows[0].key, '202401');
  assert.equal(rows[0].netSalesUSD, 0);
  assert.equal(rows[0].salesLineCount, 0);
  assert.equal(rows[0].orderCount, null);
  assert.equal(rows[0].grossMarginPercent, null);
  assert.equal(rows[1].orderCount, 2);
  assert.equal(rows[1].netSalesUSD, 5);
});

test('dashboard uses cube window aggregates and does not sum order counts', () => {
  const body = buildDashboard({
    pageId: 'D15',
    filters: FILTERS,
    source: SOURCE,
    requestId: 'req-1',
    catalog: { months: [{ key: '202401', label: '2024-01' }, { key: '202609', label: '2026-09' }] },
    raw: {
      kpi: { netSalesUSD: 100, grossProfitUSD: 60, netCostUSD: 40, netQtyKG: 10, salesQtyKG: 12, returnQtyKG: 2, orderCount: 3, salesLineCount: 4, fullReturnLineCount: 1, partialReturnLineCount: 0, allowanceLineCount: 2, negativeMarginLineCount: 1 },
      monthly: [
        { key: '202608', label: '2026-08', netSalesUSD: 40, orderCount: 5, salesLineCount: 2 },
        { key: '202609', label: '2026-09', netSalesUSD: 100, orderCount: 1, salesLineCount: 4 }
      ],
      products: [
        { key: 'P2', label: 'Two', netSalesUSD: 70, grossProfitUSD: 30, salesLineCount: 1 },
        { key: 'P1', label: 'One', netSalesUSD: 30, grossProfitUSD: 30, salesLineCount: 1 }
      ],
      priorProducts: [
        { key: 'P1', label: 'One', netSalesUSD: 20, salesLineCount: 1 },
        { key: 'P3', label: 'Gone', netSalesUSD: 10, salesLineCount: 1 }
      ],
      customers: [
        { key: 'C2', label: 'B', netSalesUSD: 60, salesLineCount: 1 },
        { key: 'C1', label: 'A', netSalesUSD: 40, salesLineCount: 1 }
      ],
      companies: [{ key: '00020', label: 'Co', netSalesUSD: 100, salesLineCount: 4 }],
      priorKpi: { netSalesUSD: 30, salesLineCount: 2, orderCount: 2 },
      ytdKpi: { netSalesUSD: 80, salesLineCount: 3, orderCount: 4 },
      rolling3Kpi: { netSalesUSD: 15, salesLineCount: 3, orderCount: 9 },
      rolling12Kpi: { netSalesUSD: 50, salesLineCount: 4, orderCount: 11 }
    }
  });
  assert.equal(body.status, 'ok');
  assert.equal(body.kpis.orderCount, 3);
  assert.equal(body.datasets.monthly.length, 33);
  assert.equal(body.datasets.monthly[0].orderCount, null);
  assert.equal(body.datasets.monthly.find((row) => row.key === '202608').orderCount, 5);
  assert.equal(body.analysis.rolling3NetSalesUSD, 15);
  assert.equal(body.analysis.rolling12NetSalesUSD, 50);
  assert.equal(body.analysis.ytdNetSalesUSD, 80);
  close(body.analysis.yoyGrowth, 70 / 30);
  assert.equal(body.analysis.historyStatus, 'available');
  close(body.analysis.cr5, 1);
  close(body.analysis.hhi, 0.36 + 0.16);
  assert.equal(body.analysis.portfolio.revenueMedian, 50);
  close(body.analysis.portfolio.weightedMargin, 0.6);
  assert.equal(body.analysis.waterfall.reduce((sum, row) => sum + row.delta, 0), 70);
  assert.equal(body.kpis.grossMarginPercent, 0.6);
  assert.equal(body.analysis.observations.find((item) => item.code === 'negative_margin_line_count').value, 1);
  assert.equal(Object.hasOwn(body.analysis.observations[0], 'threshold'), false);
  for (const key of ['monthly', 'companies', 'products', 'categories', 'customers', 'salespeople', 'plants', 'costCenters']) {
    assert.ok(Array.isArray(body.datasets[key]));
  }
  assert.equal(PUBLIC_MEASURES.every((name) => body.evidence.measures.includes(name)), true);
  assert.equal(body.evidence.dateRole, 'Invoice Date');
});

test('All month keeps concentration and drops history', () => {
  const body = buildDashboard({
    pageId: 'D11',
    filters: { ...FILTERS, month: 'All' },
    source: SOURCE,
    requestId: 'req-all',
    raw: {
      kpi: { netSalesUSD: 100, grossProfitUSD: 25, salesLineCount: 2, orderCount: 2 },
      customers: [{ key: 'C1', label: 'A', netSalesUSD: 100, salesLineCount: 2 }],
      products: [{ key: 'P1', label: 'One', netSalesUSD: 100, salesLineCount: 2 }],
      priorKpi: { netSalesUSD: 40, salesLineCount: 1 },
      ytdKpi: { netSalesUSD: 10, salesLineCount: 1 },
      rolling3Kpi: { netSalesUSD: 10, salesLineCount: 1 }
    }
  });
  assert.equal(body.analysis.historyStatus, 'not_applicable');
  assert.equal(body.analysis.yoyGrowth, null);
  assert.equal(body.analysis.priorYearNetSalesUSD, null);
  assert.equal(body.analysis.ytdNetSalesUSD, null);
  assert.equal(body.analysis.rolling3NetSalesUSD, null);
  assert.equal(body.analysis.waterfall.length, 0);
  assert.equal(body.analysis.concentrationStatus, 'available');
  assert.equal(body.analysis.portfolio.revenueMedian, 100);
});

test('a slice with no facts does not zero-fill the response', () => {
  const body = buildDashboard({
    pageId: 'D01',
    filters: FILTERS,
    source: SOURCE,
    requestId: 'req-empty',
    raw: { kpi: {}, rolling3Kpi: { netSalesUSD: 99, salesLineCount: 4, orderCount: 4 }, monthly: [{ key: '202601', netSalesUSD: 1, salesLineCount: 1 }] }
  });
  assert.equal(body.status, 'no_data');
  assert.equal(body.kpis.netSalesUSD, null);
  assert.equal(body.kpis.orderCount, null);
  assert.equal(body.datasets.monthly.length, 0);
  assert.equal(body.analysis.rolling3NetSalesUSD, null);
  assert.equal(body.analysis.observations.length, 0);
  assert.equal(body.analysis.historyStatus, 'available');
});

test('yoY is null when prior net sales is missing or not positive', () => {
  function yoy(prior) {
    return buildDashboard({
      pageId: 'D02',
      filters: FILTERS,
      source: SOURCE,
      requestId: 'req-yoy',
      raw: {
        kpi: { netSalesUSD: 100, salesLineCount: 1, orderCount: 1 },
        priorKpi: prior
      }
    }).analysis;
  }
  assert.equal(yoy({ netSalesUSD: 0, salesLineCount: 1 }).yoyGrowth, null);
  assert.equal(yoy({ netSalesUSD: 0, salesLineCount: 1 }).priorYearNetSalesUSD, 0);
  assert.equal(yoy({ netSalesUSD: -5, salesLineCount: 1 }).yoyGrowth, null);
  assert.equal(yoy({ netSalesUSD: null }).yoyGrowth, null);
  assert.equal(yoy({ netSalesUSD: null }).priorYearNetSalesUSD, null);
});

test('query parsing rejects unknown, repeated, and unsafe values', () => {
  assert.equal(parseSearch('', 'dashboard').filters.month, '202609');
  assert.equal(parseSearch('', 'dashboard').filters.company, 'All');
  assert.equal(parseSearch('month=202701', 'dashboard').ok, true);
  assert.equal(parseSearch('month=202613', 'dashboard').error.code, 'invalid_parameter');
  assert.equal(parseSearch('month=202609&month=202608', 'dashboard').error.code, 'repeated_parameter');
  assert.equal(parseSearch('machine=All', 'dashboard').error.code, 'invalid_parameter');
  assert.equal(parseSearch('company=abc%5D', 'dashboard').error.code, 'invalid_member');
  assert.equal(parseSearch('groupBy=nope', 'drilldown').error.code, 'invalid_group');
  assert.equal(parseSearch('groupBy=product', 'drilldown').groupBy, 'product');
  assert.equal(parseSearch('month=All&plant=00020%7C1', 'dashboard').filters.plant, '00020|1');
});

test('hidden pages and optional D07', () => {
  for (const id of ['D03', 'D05', 'D09', 'D10', 'D12', 'D17', 'D19']) {
    assert.equal(resolvePage(id, true).ok, false);
  }
  assert.equal(resolvePage('D07', false).ok, false);
  assert.equal(resolvePage('D07', true).pageId, 'D07');
  assert.equal(resolvePage('d01', false).pageId, 'D01');
  assert.equal(PAGES.some((page) => page.id === 'D03'), false);
});

test('a single PowerShell row object is accepted as one row', () => {
  const bundle = normalizeBundle({ companies: { key: '00020', label: 'Co', netSalesUSD: 5, salesLineCount: 1 } });
  assert.equal(bundle.companies.length, 1);
  assert.equal(bundle.companies[0].key, '00020');
});
