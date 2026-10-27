import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Evaluate the authored TSX and real CSV serializer with minimal React/DOM
// substitutes. These tests prove data/selection contracts, not browser layout.
const require = createRequire(import.meta.url);
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ts = require(path.join(app, 'frontend/node_modules/typescript'));
const base = path.join(app, 'frontend/src');
const filters = { month: '202609', company: 'All', product: 'All', customer: 'All', salesperson: 'All', plant: 'All', costCenter: 'All' };
const row = (key, index = 0) => ({
  key, label: `Member ${key}`, netSalesUSD: 2000 - index * 10, netCostUSD: 100,
  grossProfitUSD: 400 - index, grossMarginPercent: .2, netQtyKG: 100,
  salesQtyKG: 110, returnQtyKG: 10, returnRatePercent: 10 / 110,
  averageSellingPriceUSD: 20, orderCount: 5, salesLineCount: 10,
  fullReturnLineCount: 1, partialReturnLineCount: 2, allowanceLineCount: 1,
  negativeMarginLineCount: 30 - index,
});
function fixture() {
  const customers = [10000, 100, 1, null, 0, -1].map((qty, i) => ({ ...row(`C${i}`, i), netQtyKG: qty }));
  customers.push({ ...row('C-missing-margin'), grossMarginPercent: null }, { ...row('C-missing-sales'), netSalesUSD: null });
  const products = Array.from({ length: 18 }, (_, i) => row(`P${String(i).padStart(2, '0')}`, i));
  products.at(-1).negativeMarginLineCount = null;
  return {
    status: 'ok', filters: { ...filters }, source: { currency: 'USD', dateRole: 'Invoice Date', synthetic: true },
    kpis: row('All'), datasets: { customers, products, monthly: [], companies: [], categories: [], salespeople: [] },
    analysis: { yoyGrowth: null, concentrationStatus: 'available', cr5: .5, observations: [{ code: 'test-count', label: 'Test count', value: 18, unit: 'count' }] },
    evidence: { requestId: 'selection-fixture-request', queryHash: 'fixture-only', filters: { ...filters } },
  };
}
function renderer(screen, data = fixture(), context = {}) {
  const state = [], calls = [], downloads = [], cache = new Map();
  let cursor = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useMemo: fn => fn(), useCallback: fn => fn, useEffect: () => {},
    useState: initial => { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
    useRef: initial => { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; },
  };
  let csvBlob;
  const document = { body: { appendChild() {}, removeChild() {} }, createElement: () => ({ click() { downloads.push({ filename: this.download, blob: csvBlob }); } }) };
  const CsvURL = { createObjectURL: blob => { csvBlob = blob; return 'blob:test-only'; }, revokeObjectURL() {} };
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} }; cache.set(file, mod);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const localRequire = id => {
      if (id === 'react') return React;
      if (id.includes('/services/salesApi')) return { useSalesDashboard: () => ({ phase: 'ok', data, error: null, reload() {} }) };
      if (id.includes('/context/AppContext')) return { useApp: () => ({ theme: 'light', lang: 'zh-TW', metadata: null, metadataLoading: false, metadataError: null, setLastDashboardContext() {}, openDrillDown: value => calls.push(value), ...context }) };
      if (id.includes('/components/')) { const name = path.basename(id); return { [name]: name }; }
      if (id.startsWith('.')) { const target = path.resolve(path.dirname(file), id); return load(fs.existsSync(target + '.ts') ? target + '.ts' : target + '.tsx'); }
      throw new Error(`Unexpected module ${id}`);
    };
    vm.runInNewContext(code, { require: localRequire, module: mod, exports: mod.exports, console, Intl, Blob, URL: CsvURL, document }, { filename: file });
    return mod.exports;
  }
  const exported = load(path.join(base, 'screens', `${screen}.tsx`));
  const component = exported.default || exported[path.basename(screen)];
  return { data, calls, downloads, render(props = {}) { cursor = 0; return component({ slicer: filters, ...props }); } };
}
function nodes(tree, result = []) {
  if (Array.isArray(tree)) tree.forEach(value => nodes(value, result));
  else if (tree && typeof tree === 'object' && 'type' in tree) { result.push(tree); nodes(tree.props.children, result); }
  return result;
}
const text = value => Array.isArray(value) ? value.map(text).join('') : value && typeof value === 'object' ? text(value.props?.children) : String(value ?? '');
const charts = tree => nodes(tree).filter(node => node.type === 'EChartsContainer');
function button(tree, expression) { const match = nodes(tree).find(node => node.type === 'button' && expression.test(text(node))); assert.ok(match, `Missing button ${expression}`); return match; }
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const csvLines = async download => (await download.blob.text()).replace(/^\uFEFF/, '').trimEnd().split('\n');

test('D06 actual bubble areas preserve 10000:100:1 quantities and exclude invalid visual variables visibly', () => {
  const r = renderer('D06CustomerContribution'), tree = r.render();
  const bubble = charts(tree).find(chart => chart.props.option.series.some(series => series.name.includes('客戶氣泡'))).props.option.series[0];
  assert.equal(bubble.data.length, 3);
  const sizes = bubble.data.map(point => bubble.symbolSize(point.value));
  near(sizes[0], 28); near((sizes[0] / sizes[1]) ** 2, 100); near((sizes[0] / sizes[2]) ** 2, 10000);
  for (const invalid of [null, 0, -1, NaN, Infinity]) assert.equal(bubble.symbolSize([100, 20, invalid]), 0);
  const exceptions = nodes(tree).find(node => node.props['data-testid'] === 'customer-bubble-exceptions');
  assert.ok(exceptions);
  for (const customer of r.data.datasets.customers.slice(3)) assert.ok(text(exceptions).includes(customer.key));
  for (const customer of r.data.datasets.customers) assert.ok(text(tree).includes(customer.key));
});

test('D06 chart selection preserves comparison population and drills only from the explicit stable-key action', () => {
  const r = renderer('D06CustomerContribution');
  let tree = r.render();
  const chart = charts(tree).find(item => item.props.option.series.some(series => series.name.includes('客戶氣泡')));
  chart.props.onEvents.click({ dataIndex: 1 });
  assert.equal(r.calls.length, 0);
  tree = r.render();
  const selected = charts(tree).find(item => item.props.option.series.some(series => series.name.includes('客戶氣泡'))).props.option.series[0];
  assert.equal(selected.data.length, 3);
  assert.equal(selected.data[1].itemStyle.opacity, 1);
  assert.equal(selected.data[0].itemStyle.opacity, .35);
  button(tree, /下鑽.*產品|Drill/).props.onClick();
  assert.equal(r.calls[0].filterOverrides.customer, 'C1');
});

test('D06 real CSV includes the complete customer universe and preserves missing and negative quantity', async () => {
  const r = renderer('D06CustomerContribution');
  button(r.render(), /匯出客戶貢獻 CSV/).props.onClick();
  const lines = await csvLines(r.downloads[0]);
  assert.equal(lines.length, r.data.datasets.customers.length + 1);
  assert.ok(lines[0].startsWith('"CustomerKey"'));
  assert.equal(lines[4].split(',')[6], '');
  assert.equal(lines[6].split(',')[6], '-1');
});

test('D18 full product table keeps rows outside both Top N views and null observation cells', () => {
  const r = renderer('D18ExceptionMonitor'), tree = r.render();
  const full = nodes(tree).find(node => node.props['data-testid'] === 'product-observations-full');
  assert.ok(full);
  for (const product of r.data.datasets.products) assert.ok(text(full).includes(product.key));
  const tableRows = nodes(full).filter(node => node.type === 'tr');
  assert.equal(tableRows.length, 19);
  assert.ok(text(tableRows.at(-1)).includes('—'));
  const heat = charts(tree).find(chart => chart.props.option.series.some(series => series.type === 'heatmap'));
  assert.equal(heat.props.option.series[0].data.length, 12 * 4);
});

test('D18 heatmap highlights without drilling or changing population, then explicit action uses the product key', () => {
  const r = renderer('D18ExceptionMonitor');
  let tree = r.render();
  let heat = charts(tree).find(chart => chart.props.option.series.some(series => series.type === 'heatmap'));
  heat.props.onEvents.click({ value: heat.props.option.series[0].data[4].value });
  assert.equal(r.calls.length, 0);
  tree = r.render();
  heat = charts(tree).find(chart => chart.props.option.series.some(series => series.type === 'heatmap'));
  assert.equal(heat.props.option.series[0].data.length, 48);
  assert.equal(heat.props.option.series[0].data[4].itemStyle.opacity, 1);
  assert.equal(heat.props.option.series[0].data[0].itemStyle.opacity, .3);
  button(tree, /下鑽該產品客戶/).props.onClick();
  assert.equal(r.calls[0].filterOverrides.product, 'P01');
});

test('D18 real CSV exports full products and customers without replacing the original observations export', async () => {
  const r = renderer('D18ExceptionMonitor'), tree = r.render();
  button(tree, /匯出完整產品 CSV/).props.onClick();
  let lines = await csvLines(r.downloads.at(-1));
  assert.equal(lines.length, r.data.datasets.products.length + 1);
  assert.ok(lines[0].startsWith('"ProductKey"'));
  assert.equal(lines.at(-1).split(',')[16], '');
  button(tree, /匯出完整客戶 CSV/).props.onClick();
  lines = await csvLines(r.downloads.at(-1));
  assert.equal(lines.length, r.data.datasets.customers.length + 1);
  assert.ok(lines[0].startsWith('"CustomerKey"'));
  button(tree, /匯出銷售觀察 CSV/).props.onClick();
  lines = await csvLines(r.downloads.at(-1));
  assert.equal(lines.length, 2);
  assert.equal(lines[0], '"Code","Label","Value","Unit"');
});

function historyFixture() {
  const data = fixture();
  data.datasets.monthly = [100,200,300,600].map((value,i) => ({...row(`20260${i+6}`), netSalesUSD:value, grossMarginPercent:i === 1 ? null : .2+i*.01}));
  data.analysis.historyStatus = 'available';
  return data;
}
test('D01 uses two aligned month panels with distinct USD and percentage axes, preserving nulls', () => {
  const data=historyFixture(), tree=renderer('D01ExecutiveOverview', data).render();
  const list=charts(tree), revenue=list.find(c=>c.props.height==='240px'), margin=list.find(c=>c.props.height==='180px');
  assert.ok(revenue && margin);
  const a=revenue.props.option,b=margin.props.option;
  assert.equal(a.series.length,1); assert.equal(b.series.length,1);
  assert.equal(a.series[0].type,'bar'); assert.equal(b.series[0].type,'line');
  assert.equal(a.yAxis.length,1); assert.equal(b.yAxis.length,1); assert.equal(b.series[0].yAxisIndex,0);
  assert.equal(JSON.stringify(a.xAxis.data), JSON.stringify(b.xAxis.data));
  assert.equal(JSON.stringify(a.grid), JSON.stringify(b.grid)); assert.equal(a.grid.containLabel,false);
  assert.equal(b.series[0].data[1],null); near(b.series[0].data[3],23);
});
test('D15 average, sum, tooltip, table and actual CSV agree and remain distinct', async () => {
  const data=historyFixture(), r=renderer('D15RollingSales',data), tree=r.render();
  const chart=charts(tree).find(c=>c.props.option.series.some(s=>s.type==='bar'));
  assert.ok(chart);
  const line=chart.props.option.series.find(s=>s.type==='line');
  assert.equal(line.data[0],null); assert.equal(line.data[1],null); near(line.data[2],200); near(line.data[3],1100/3);
  assert.ok(chart.props.option.legend.data.includes(line.name));
  assert.match(chart.props.option.tooltip.formatter([{dataIndex:3}]), /移動平均/);
  assert.match(text(tree),/3 月移動平均/);
  button(tree,/匯出月度序列 CSV/).props.onClick();
  const lines=await csvLines(r.downloads[0]), headers=lines[0].replaceAll('"','').split(',');
  const cells=lines.at(-1).replaceAll('"','').split(',');
  near(Number(cells[headers.indexOf('MovingAverage3USD')]),1100/3);
  near(Number(cells[headers.indexOf('R3SumUSD')]),1100);
  assert.equal(cells[headers.indexOf('RequestId')],data.evidence.requestId);
});
test('Comparison metadata failure or empty members terminates with an actionable state', () => {
  const failed=renderer('../composition/ComparisonHistory',fixture(),{metadataError:'unavailable'}).render({dimension:'company'});
  assert.ok(nodes(failed).some(n=>n.props.role==='alert'));
  assert.ok(!nodes(failed).some(n=>n.props.role==='status'));
  assert.match(text(failed),/重新載入頁面/);
  const empty=renderer('../composition/ComparisonHistory',fixture(),{metadata:{members:{company:[]}}}).render({dimension:'company'});
  assert.match(text(empty),/沒有可比較的成員/);
  assert.ok(!nodes(empty).some(n=>n.props.role==='status'));
});
