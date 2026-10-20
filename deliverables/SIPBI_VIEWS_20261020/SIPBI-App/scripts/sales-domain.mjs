/**
 * Pure sales contract logic. Cube cells stay in the query adapter.
 * Ratios are fractions of cube aggregates. Distinct order counts are never summed.
 */
import { createHash } from 'node:crypto';

export const COVERAGE_START = '202401';
export const COVERAGE_END = '202609';
export const DEFAULT_MONTH = '202609';

export const FILTER_KEYS = ['month', 'company', 'product', 'customer', 'salesperson', 'plant', 'costCenter'];
export const MEMBER_KEYS = ['company', 'product', 'customer', 'salesperson', 'plant', 'costCenter'];
export const GROUP_KEYS = ['product', 'customer', 'salesperson', 'company', 'plant', 'costCenter', 'category', 'month'];

export const PAGES = [
  { id: 'D00', titleZh: '決策首頁', titleEn: 'Decision Home' },
  { id: 'D01', titleZh: '銷售總覽', titleEn: 'Executive Sales' },
  { id: 'D02', titleZh: '銷售動能', titleEn: 'Sales Momentum' },
  { id: 'D04', titleZh: '產品組合', titleEn: 'Product Mix' },
  { id: 'D06', titleZh: '客戶貢獻', titleEn: 'Customer Contribution' },
  { id: 'D08', titleZh: '獲利品質', titleEn: 'Profitability' },
  { id: 'D11', titleZh: '客戶集中度', titleEn: 'Customer Concentration' },
  { id: 'D13', titleZh: '業務員實績', titleEn: 'Salesperson Actuals' },
  { id: 'D14', titleZh: '產品營收與毛利矩陣', titleEn: 'Product Portfolio' },
  { id: 'D15', titleZh: '累計與滾動銷售', titleEn: 'Rolling Sales' },
  { id: 'D16', titleZh: '成長貢獻', titleEn: 'Growth Contribution' },
  { id: 'D18', titleZh: '銷售觀察', titleEn: 'Sales Observations' }
];

export const AI_PAGE = { id: 'D07', titleZh: '銷售分析工作區', titleEn: 'Sales Analysis Workspace' };
export const HIDDEN_PAGES = new Set(['D03', 'D05', 'D09', 'D10', 'D12', 'D17']);

export const PUBLIC_MEASURES = [
  'Net Sales USD',
  'Net Cost USD',
  'Gross Profit USD',
  'Net Quantity KG',
  'Sales Quantity KG',
  'Return Quantity KG',
  'Order Count',
  'Sales Line Count',
  'Full Return Line Count',
  'Partial Return Line Count',
  'Allowance Line Count',
  'Negative Margin Line Count'
];

const METRIC_KEYS = [
  'netSalesUSD', 'netCostUSD', 'grossProfitUSD', 'netQtyKG', 'salesQtyKG', 'returnQtyKG',
  'orderCount', 'salesLineCount', 'fullReturnLineCount', 'partialReturnLineCount',
  'allowanceLineCount', 'negativeMarginLineCount', 'grossMarginPercent', 'returnRatePercent',
  'averageSellingPriceUSD'
];

const COUNT_KEYS = [
  'orderCount', 'salesLineCount', 'fullReturnLineCount', 'partialReturnLineCount',
  'allowanceLineCount', 'negativeMarginLineCount'
];

const ZERO_FILL_KEYS = [
  'netSalesUSD', 'netCostUSD', 'grossProfitUSD', 'netQtyKG', 'salesQtyKG', 'returnQtyKG',
  'salesLineCount', 'fullReturnLineCount', 'partialReturnLineCount', 'allowanceLineCount',
  'negativeMarginLineCount'
];

const DATASET_KEYS = ['monthly', 'companies', 'products', 'categories', 'customers', 'salespeople', 'plants', 'costCenters'];

const GROUP_DATASET = {
  product: 'products',
  customer: 'customers',
  salesperson: 'salespeople',
  company: 'companies',
  plant: 'plants',
  costCenter: 'costCenters',
  category: 'categories',
  month: 'monthly'
};

const MONTH_RE = /^\d{4}(?:0[1-9]|1[0-2])$/;

export function emptyMetrics() {
  const metrics = {};
  for (const key of METRIC_KEYS) metrics[key] = null;
  return metrics;
}

export function emptyDatasets() {
  const datasets = {};
  for (const key of DATASET_KEYS) datasets[key] = [];
  return datasets;
}

function fail(code, message) {
  return { ok: false, statusCode: 400, error: { code, message } };
}

function finite(value) {
  if (value == null || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function countValue(value) {
  const number = finite(value);
  if (number == null) return null;
  const rounded = Math.round(number);
  return Math.abs(number - rounded) <= 1e-6 ? rounded : number;
}

function ratio(numerator, denominator) {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return numerator / denominator;
}

export function deriveMetrics(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const metrics = {
    netSalesUSD: finite(source.netSalesUSD),
    netCostUSD: finite(source.netCostUSD),
    grossProfitUSD: finite(source.grossProfitUSD),
    netQtyKG: finite(source.netQtyKG),
    salesQtyKG: finite(source.salesQtyKG),
    returnQtyKG: finite(source.returnQtyKG),
    orderCount: countValue(source.orderCount),
    salesLineCount: countValue(source.salesLineCount),
    fullReturnLineCount: countValue(source.fullReturnLineCount),
    partialReturnLineCount: countValue(source.partialReturnLineCount),
    allowanceLineCount: countValue(source.allowanceLineCount),
    negativeMarginLineCount: countValue(source.negativeMarginLineCount)
  };
  metrics.grossMarginPercent = ratio(metrics.grossProfitUSD, metrics.netSalesUSD);
  metrics.returnRatePercent = ratio(metrics.returnQtyKG, metrics.salesQtyKG);
  metrics.averageSellingPriceUSD = ratio(metrics.netSalesUSD, metrics.netQtyKG);
  return metrics;
}

export function hasFacts(metrics) {
  if (!metrics) return false;
  for (const key of COUNT_KEYS) {
    if ((metrics[key] ?? 0) > 0) return true;
  }
  for (const key of ['netSalesUSD', 'netCostUSD', 'grossProfitUSD', 'netQtyKG', 'salesQtyKG', 'returnQtyKG']) {
    if (metrics[key] != null && metrics[key] !== 0) return true;
  }
  return false;
}

export function isSafeMemberKey(key) {
  if (key === 'All') return true;
  if (typeof key !== 'string' || key.length < 1 || key.length > 40) return false;
  return !/[\u0000-\u001f\[\]{}(),;"'&\\]/.test(key);
}

export function addMonths(yyyymm, delta) {
  const year = Number(yyyymm.slice(0, 4));
  const month = Number(yyyymm.slice(4, 6));
  const index = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(index / 12);
  const nextMonth = index % 12;
  return String(nextYear).padStart(4, '0') + String(nextMonth + 1).padStart(2, '0');
}

export function enumerateMonths(start, end) {
  const months = [];
  let cursor = start;
  while (cursor <= end && months.length < 240) {
    months.push(cursor);
    const next = addMonths(cursor, 1);
    if (next <= cursor) break;
    cursor = next;
  }
  return months;
}

export function ytdMonths(end) {
  if (end < COVERAGE_START || end > COVERAGE_END) return null;
  const start = end.slice(0, 4) + '01';
  if (start < COVERAGE_START) return null;
  return enumerateMonths(start, end);
}

export function windowEnding(end, size) {
  if (end < COVERAGE_START || end > COVERAGE_END) return null;
  const months = [];
  for (let i = size - 1; i >= 0; i -= 1) months.push(addMonths(end, -i));
  if (months[0] < COVERAGE_START || months[months.length - 1] > COVERAGE_END) return null;
  return months;
}

export function planWindows(month) {
  if (month === 'All') {
    return {
      historyStatus: 'not_applicable',
      priorMonth: null,
      ytdMonths: null,
      rolling3Months: null,
      rolling12Months: null,
      monthlyMonths: enumerateMonths(COVERAGE_START, COVERAGE_END),
      sliceMonth: 'All'
    };
  }
  const prior = addMonths(month, -12);
  const selectedInside = month >= COVERAGE_START && month <= COVERAGE_END;
  const priorInside = prior >= COVERAGE_START && prior <= COVERAGE_END;
  return {
    historyStatus: selectedInside && priorInside ? 'available' : 'insufficient_history',
    priorMonth: selectedInside && priorInside ? prior : null,
    ytdMonths: ytdMonths(month),
    rolling3Months: windowEnding(month, 3),
    rolling12Months: windowEnding(month, 12),
    monthlyMonths: selectedInside ? enumerateMonths(COVERAGE_START, month) : null,
    sliceMonth: month
  };
}

export function pagesFor(aiEnabled) {
  if (!aiEnabled) return PAGES.map((page) => ({ ...page }));
  const pages = [];
  for (const page of PAGES) {
    pages.push({ ...page });
    if (page.id === 'D06') pages.push({ ...AI_PAGE });
  }
  return pages;
}

export function resolvePage(id, aiEnabled) {
  const text = String(id || '').trim().toUpperCase();
  if (!/^D\d{2}$/.test(text)) return fail('invalid_page', 'Unknown page.');
  if (HIDDEN_PAGES.has(text)) return fail('invalid_page', 'That page is not available.');
  if (text === 'D07') {
    if (!aiEnabled) return fail('invalid_page', 'That page is not available.');
    return { ok: true, pageId: 'D07' };
  }
  if (!PAGES.some((page) => page.id === text)) return fail('invalid_page', 'Unknown page.');
  return { ok: true, pageId: text };
}

function pickMonth(seen) {
  if (!seen.has('month')) return { ok: true, value: DEFAULT_MONTH };
  const value = seen.get('month').trim();
  if (value === 'All') return { ok: true, value };
  if (!MONTH_RE.test(value)) return fail('invalid_parameter', 'Month must be All or YYYYMM.');
  return { ok: true, value };
}

function pickMember(seen, name) {
  if (!seen.has(name)) return { ok: true, value: 'All' };
  const value = seen.get(name).trim();
  if (!value) return fail('invalid_parameter', 'A filter value is empty.');
  if (!isSafeMemberKey(value)) return fail('invalid_member', 'Invalid ' + name + ' key.');
  return { ok: true, value };
}

export function parseSearch(search, mode) {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const allowed = new Set(FILTER_KEYS);
  if (mode === 'drilldown') allowed.add('groupBy');
  const seen = new Map();
  for (const [key, value] of params) {
    if (!allowed.has(key)) return fail('invalid_parameter', 'Unknown query parameter.');
    if (seen.has(key)) return fail('repeated_parameter', 'Repeated query parameters are not allowed.');
    seen.set(key, value);
  }
  const month = pickMonth(seen);
  if (!month.ok) return month;
  const filters = { month: month.value };
  for (const key of MEMBER_KEYS) {
    const picked = pickMember(seen, key);
    if (!picked.ok) return picked;
    filters[key] = picked.value;
  }
  if (mode === 'drilldown') {
    if (!seen.has('groupBy')) return fail('invalid_group', 'groupBy is required.');
    const groupBy = seen.get('groupBy').trim();
    if (!GROUP_KEYS.includes(groupBy)) return fail('invalid_group', 'groupBy is not supported.');
    return { ok: true, filters, groupBy };
  }
  return { ok: true, filters };
}

export function checkMembers(filters, catalog) {
  const monthKeys = new Set((catalog.months || []).map((member) => String(member.key)));
  for (const key of MEMBER_KEYS) {
    if (filters[key] === 'All') continue;
    const known = new Set((catalog.members[key] || []).map((member) => String(member.key)));
    if (!known.has(filters[key])) return fail('invalid_member', 'Unknown ' + key + ' key.');
  }
  return { ok: true, monthInCube: filters.month === 'All' || (filters.month >= COVERAGE_START && filters.month <= COVERAGE_END && monthKeys.has(filters.month)) };
}

function asArray(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return [value];
  return [];
}

function normalizeMonthKey(key) {
  const text = String(key ?? '').trim();
  return /^\d{6}(?:\.0+)?$/.test(text) ? text.slice(0, 6) : text;
}

export function shapeRow(raw, group) {
  const key = group === 'month' ? normalizeMonthKey(raw?.key) : String(raw?.key ?? '').trim();
  const labelSource = raw?.label == null ? '' : String(raw.label).trim();
  return { key, label: labelSource || key, ...deriveMetrics(raw) };
}

function shapeRows(value, group) {
  const rows = [];
  for (const raw of asArray(value)) {
    const row = shapeRow(raw, group);
    if (row.key) rows.push(row);
  }
  return rows;
}

export function normalizeBundle(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    kpi: deriveMetrics(source.kpi),
    priorKpi: source.priorKpi == null ? null : deriveMetrics(source.priorKpi),
    ytdKpi: source.ytdKpi == null ? null : deriveMetrics(source.ytdKpi),
    rolling3Kpi: source.rolling3Kpi == null ? null : deriveMetrics(source.rolling3Kpi),
    rolling12Kpi: source.rolling12Kpi == null ? null : deriveMetrics(source.rolling12Kpi),
    monthly: shapeRows(source.monthly, 'month'),
    companies: shapeRows(source.companies, 'company'),
    products: shapeRows(source.products, 'product'),
    categories: shapeRows(source.categories, 'category'),
    customers: shapeRows(source.customers, 'customer'),
    salespeople: shapeRows(source.salespeople, 'salesperson'),
    plants: shapeRows(source.plants, 'plant'),
    costCenters: shapeRows(source.costCenters, 'costCenter'),
    priorProducts: shapeRows(source.priorProducts, 'product')
  };
}

export function byRank(left, right) {
  const leftSales = left.netSalesUSD == null ? Number.NEGATIVE_INFINITY : left.netSalesUSD;
  const rightSales = right.netSalesUSD == null ? Number.NEGATIVE_INFINITY : right.netSalesUSD;
  if (leftSales !== rightSales) return rightSales - leftSales;
  if (left.key < right.key) return -1;
  if (left.key > right.key) return 1;
  return 0;
}

export function byKey(left, right) {
  if (left.key < right.key) return -1;
  if (left.key > right.key) return 1;
  return 0;
}

export function sortRows(rows, group) {
  return rows.slice().sort(group === 'month' ? byKey : byRank);
}

export function median(values) {
  const numbers = values.filter((value) => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b);
  if (numbers.length === 0) return null;
  const mid = Math.floor(numbers.length / 2);
  if (numbers.length % 2 === 1) return numbers[mid];
  return (numbers[mid - 1] + numbers[mid]) / 2;
}

function salesOrNull(metrics) {
  if (!hasFacts(metrics)) return null;
  return metrics.netSalesUSD;
}

export function concentration(customers) {
  if (!customers.length) return { cr5: null, hhi: null, concentrationStatus: 'no_data' };
  if (customers.some((row) => row.netSalesUSD == null || row.netSalesUSD < 0)) {
    return { cr5: null, hhi: null, concentrationStatus: 'invalid_population' };
  }
  const total = customers.reduce((sum, row) => sum + row.netSalesUSD, 0);
  if (!(total > 0)) return { cr5: null, hhi: null, concentrationStatus: 'invalid_population' };
  const ranked = customers.slice().sort(byRank);
  const cr5 = ranked.slice(0, 5).reduce((sum, row) => sum + row.netSalesUSD, 0) / total;
  const hhi = customers.reduce((sum, row) => {
    const share = row.netSalesUSD / total;
    return sum + share * share;
  }, 0);
  return { cr5, hhi, concentrationStatus: 'available' };
}

export function buildWaterfall(currentRows, priorRows) {
  const prior = new Map(priorRows.map((row) => [row.key, row]));
  const current = new Map(currentRows.map((row) => [row.key, row]));
  const rows = [];
  for (const key of new Set([...prior.keys(), ...current.keys()])) {
    const currentRow = current.get(key);
    const priorRow = prior.get(key);
    const currentSales = currentRow?.netSalesUSD ?? 0;
    const priorSales = priorRow?.netSalesUSD ?? 0;
    rows.push({
      key,
      label: currentRow?.label || priorRow?.label || key,
      prior: priorSales,
      current: currentSales,
      delta: currentSales - priorSales
    });
  }
  rows.sort((left, right) => {
    if (left.current !== right.current) return right.current - left.current;
    if (left.key < right.key) return -1;
    if (left.key > right.key) return 1;
    return 0;
  });
  return rows;
}

export function zeroFillMonths(rows, months, labels) {
  const byMonth = new Map(rows.map((row) => [row.key, row]));
  return months.map((key) => {
    const existing = byMonth.get(key);
    if (existing) return existing;
    const metrics = emptyMetrics();
    for (const field of ZERO_FILL_KEYS) metrics[field] = 0;
    const label = labels && labels[key] ? labels[key] : key.slice(0, 4) + '-' + key.slice(4);
    return { key, label, ...metrics };
  });
}

function positiveRatio(numerator, denominator) {
  if (numerator == null || denominator == null || !(denominator > 0)) return null;
  return numerator / denominator;
}

export function portfolio(products, kpi) {
  return {
    revenueMedian: median(products.map((row) => row.netSalesUSD).filter((value) => value != null)),
    weightedMargin: positiveRatio(kpi.grossProfitUSD, kpi.netSalesUSD)
  };
}

export function observations(metrics) {
  const items = [
    ['net_sales_usd', 'Net sales', metrics.netSalesUSD, 'USD'],
    ['gross_profit_usd', 'Gross profit', metrics.grossProfitUSD, 'USD'],
    ['gross_margin', 'Gross margin', metrics.grossMarginPercent, 'fraction'],
    ['order_count', 'Distinct orders', metrics.orderCount, 'count'],
    ['sales_line_count', 'Sales lines', metrics.salesLineCount, 'count'],
    ['full_return_line_count', 'Full return lines', metrics.fullReturnLineCount, 'count'],
    ['partial_return_line_count', 'Partial return lines', metrics.partialReturnLineCount, 'count'],
    ['allowance_line_count', 'Allowance lines', metrics.allowanceLineCount, 'count'],
    ['negative_margin_line_count', 'Negative margin lines', metrics.negativeMarginLineCount, 'count'],
    ['return_rate', 'Return rate', metrics.returnRatePercent, 'fraction']
  ];
  return items.map(([code, label, value, unit]) => ({ code, label, value, unit }));
}

function evidenceNotes() {
  return [
    'Synthetic sales cube shared by five companies. No login.',
    'Date role is Invoice Date. Currency is USD. Quantity is KG. Local-currency measures are not queried.',
    'Order count is the cube distinct-count aggregate at the requested grain. It is never a sum of monthly or group counts.',
    'grossMarginPercent is gross profit divided by net sales when net sales is not zero. returnRatePercent is return KG divided by sales KG when sales KG is not zero. averageSellingPriceUSD is net sales divided by net KG when net KG is not zero. Ratios are fractions and match the cube calculated measures.',
    'The monthly dataset runs from coverage start through the selected covered month. The month filter is the series endpoint. Empty covered months zero-fill additive measures. Distinct order count stays null on those months.',
    'YoY uses the same invoice month one year earlier. It is null when prior net sales is missing or not positive. Rolling and YTD windows that leave 202401..202609 are null and are not extrapolated.',
    'Waterfall unions current and prior-year products, including products that disappear. Missing sides are zero in that arithmetic. Delta sums to current product net sales minus prior product net sales.',
    'CR5 and HHI use every customer in the slice. They are defined only when total net sales is positive and no customer net sales is negative. HHI is the sum of squared revenue shares.',
    'Portfolio median is the median of selected product net sales. weightedMargin is aggregate gross profit divided by net sales when net sales is positive. It is not an external market classification.',
    'Observations report measured values only. They do not apply invented thresholds.'
  ];
}

export function makeQueryHash(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function hashPayload(pageOrGroup, filters, windows) {
  return {
    grain: pageOrGroup,
    filters,
    measures: PUBLIC_MEASURES,
    dateRole: 'Invoice Date',
    cube: 'JDE Sales',
    priorMonth: windows.priorMonth,
    ytdMonths: windows.ytdMonths,
    rolling3Months: windows.rolling3Months,
    rolling12Months: windows.rolling12Months,
    monthlyMonths: windows.monthlyMonths
  };
}

function monthLabelMap(catalog) {
  const labels = {};
  for (const member of catalog?.months || []) labels[String(member.key)] = member.label;
  return labels;
}

function analysisFor(live, windows, bundle, kpi) {
  const priorYearNetSalesUSD = live && windows.historyStatus === 'available' ? salesOrNull(bundle.priorKpi) : null;
  const currentSales = live ? salesOrNull(kpi) : null;
  let yoyGrowth = null;
  if (priorYearNetSalesUSD != null && priorYearNetSalesUSD > 0 && currentSales != null) {
    yoyGrowth = (currentSales - priorYearNetSalesUSD) / priorYearNetSalesUSD;
  }
  const customers = live ? sortRows(bundle.customers, 'customer') : [];
  const products = live ? sortRows(bundle.products, 'product') : [];
  const conc = live ? concentration(customers) : { cr5: null, hhi: null, concentrationStatus: 'no_data' };
  const waterfall = live && windows.priorMonth ? buildWaterfall(products, bundle.priorProducts) : [];
  const extraNotes = [];
  if (waterfall.length && priorYearNetSalesUSD != null && currentSales != null) {
    const deltaSum = waterfall.reduce((sum, row) => sum + row.delta, 0);
    if (Math.abs(deltaSum - (currentSales - priorYearNetSalesUSD)) > 0.02) {
      extraNotes.push('Waterfall product delta differs from KPI net sales delta by more than 0.02 USD.');
    }
  }
  return {
    analysis: {
      priorYearNetSalesUSD,
      yoyGrowth,
      ytdNetSalesUSD: live && windows.ytdMonths ? salesOrNull(bundle.ytdKpi) : null,
      rolling3NetSalesUSD: live && windows.rolling3Months ? salesOrNull(bundle.rolling3Kpi) : null,
      rolling12NetSalesUSD: live && windows.rolling12Months ? salesOrNull(bundle.rolling12Kpi) : null,
      historyStatus: windows.historyStatus,
      cr5: conc.cr5,
      hhi: conc.hhi,
      concentrationStatus: conc.concentrationStatus,
      portfolio: live ? portfolio(products, kpi) : { revenueMedian: null, weightedMargin: null },
      waterfall,
      observations: live ? observations(kpi) : []
    },
    extraNotes,
    customers,
    products
  };
}

function datasetsFor(live, windows, bundle, labels, customers, products) {
  if (!live) return emptyDatasets();
  return {
    monthly: windows.monthlyMonths ? zeroFillMonths(bundle.monthly, windows.monthlyMonths, labels) : sortRows(bundle.monthly, 'month'),
    companies: sortRows(bundle.companies, 'company'),
    products,
    categories: sortRows(bundle.categories, 'category'),
    customers,
    salespeople: sortRows(bundle.salespeople, 'salesperson'),
    plants: sortRows(bundle.plants, 'plant'),
    costCenters: sortRows(bundle.costCenters, 'costCenter')
  };
}

function evidence(requestId, grain, filters, windows, source, notes) {
  return {
    requestId,
    queryHash: makeQueryHash(hashPayload(grain, filters, windows)),
    grain,
    measures: PUBLIC_MEASURES.slice(),
    dateRole: 'Invoice Date',
    filters: { ...filters },
    queriedAt: source.queriedAt,
    notes
  };
}

export function buildDashboard({ pageId, filters, source, requestId, raw, catalog }) {
  const windows = planWindows(filters.month);
  const bundle = normalizeBundle(raw);
  const kpi = bundle.kpi;
  const live = hasFacts(kpi);
  const built = analysisFor(live, windows, bundle, kpi);
  const notes = evidenceNotes().concat(built.extraNotes);
  if (!live) notes.push('The selected slice has no sales facts. Window totals are omitted rather than filled with zeros.');
  return {
    status: live ? 'ok' : 'no_data',
    pageId,
    filters: { ...filters },
    source,
    kpis: live ? kpi : emptyMetrics(),
    datasets: datasetsFor(live, windows, bundle, monthLabelMap(catalog), built.customers, built.products),
    analysis: built.analysis,
    evidence: evidence(requestId, 'invoice-date/' + pageId, filters, windows, source, notes)
  };
}

export function buildNoData({ pageId, filters, source, requestId, groupBy }) {
  const windows = planWindows(filters.month);
  const notes = evidenceNotes().concat(['No cube cell was read: the month is outside source coverage or is not an Invoice Date member.']);
  if (groupBy) {
    return {
      status: 'no_data',
      groupBy,
      filters: { ...filters },
      source,
      rows: [],
      evidence: evidence(requestId, 'group/' + groupBy, filters, windows, source, notes)
    };
  }
  return {
    status: 'no_data',
    pageId,
    filters: { ...filters },
    source,
    kpis: emptyMetrics(),
    datasets: emptyDatasets(),
    analysis: {
      priorYearNetSalesUSD: null,
      yoyGrowth: null,
      ytdNetSalesUSD: null,
      rolling3NetSalesUSD: null,
      rolling12NetSalesUSD: null,
      historyStatus: windows.historyStatus,
      cr5: null,
      hhi: null,
      concentrationStatus: 'no_data',
      portfolio: { revenueMedian: null, weightedMargin: null },
      waterfall: [],
      observations: []
    },
    evidence: evidence(requestId, 'invoice-date/' + pageId, filters, windows, source, notes)
  };
}

export function buildDrilldown({ groupBy, filters, source, requestId, raw, catalog }) {
  const windows = planWindows(filters.month);
  const bundle = normalizeBundle(raw);
  const live = hasFacts(bundle.kpi);
  let rows = [];
  if (live) {
    if (groupBy === 'month') {
      const series = windows.monthlyMonths
        ? zeroFillMonths(bundle.monthly, windows.monthlyMonths, monthLabelMap(catalog))
        : sortRows(bundle.monthly, 'month');
      rows = filters.month === 'All' ? series : series.filter((row) => row.key === filters.month);
    } else {
      rows = sortRows(bundle[GROUP_DATASET[groupBy]] || [], groupBy);
    }
  }
  const status = live && rows.length > 0 ? 'ok' : 'no_data';
  return {
    status,
    groupBy,
    filters: { ...filters },
    source,
    rows: status === 'ok' ? rows : [],
    evidence: evidence(
      requestId,
      'group/' + groupBy,
      filters,
      windows,
      source,
      evidenceNotes().concat(['Drilldown returns approved aggregates only. Order and line identifiers are not queried.'])
    )
  };
}

export function normalizeMembers(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const members = {};
  for (const key of MEMBER_KEYS) {
    const seen = new Set();
    members[key] = [];
    for (const row of shapeRows(source.members ? source.members[key] : source[key], key).sort(byKey)) {
      if (seen.has(row.key) || row.key === 'All') continue;
      seen.add(row.key);
      members[key].push({ key: row.key, label: row.label || row.key });
    }
  }
  const months = [];
  const seenMonths = new Set();
  for (const row of shapeRows(source.months, 'month').sort(byKey)) {
    if (!MONTH_RE.test(row.key) || seenMonths.has(row.key)) continue;
    seenMonths.add(row.key);
    months.push({ key: row.key, label: row.label || row.key.slice(0, 4) + '-' + row.key.slice(4) });
  }
  return { months, members, queriedAt: source.queriedAt || null };
}

export function bundleRequest(filters, sourceConfig) {
  const windows = planWindows(filters.month);
  return {
    kind: 'bundle',
    filters: { ...filters },
    priorMonth: windows.priorMonth || '',
    ytdMonths: windows.ytdMonths ? windows.ytdMonths.join(',') : '',
    rolling3Months: windows.rolling3Months ? windows.rolling3Months.join(',') : '',
    rolling12Months: windows.rolling12Months ? windows.rolling12Months.join(',') : '',
    monthlyMonths: windows.monthlyMonths ? windows.monthlyMonths.join(',') : '',
    server: sourceConfig.server,
    database: sourceConfig.database
  };
}
