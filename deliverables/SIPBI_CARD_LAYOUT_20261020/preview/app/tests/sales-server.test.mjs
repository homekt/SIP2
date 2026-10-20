import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPowerShellArgs, createSalesServer } from '../scripts/sales-server.mjs';

const T = '2026-10-20T00:00:00.000Z';
const disabledAi = {
  getAiStatus() { return { enabled: false, reason: 'missing' }; },
  async handleAnalysis() {
    return { statusCode: 503, body: { status: 'error', error: { code: 'ai_disabled', message: 'AI analysis is not configured.' } } };
  }
};

const members = {
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

function happyBundle() {
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

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve('http://127.0.0.1:' + port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function waitFor(check) {
  for (let i = 0; i < 50; i += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('timed out waiting for condition');
}

test('powershell args are a validated -File argv list', () => {
  const args = buildPowerShellArgs('C:\\app\\scripts\\sales-query.ps1', {
    kind: 'bundle',
    filters: {
      month: '202609', company: 'All', product: 'All', customer: 'All',
      salesperson: 'All', plant: '00020|1', costCenter: 'All'
    },
    priorMonth: '202509',
    ytdMonths: '202601',
    rolling3Months: '',
    rolling12Months: '',
    monthlyMonths: '202609',
    server: 'localhost:25000',
    database: 'JDE_SALES_CUBE_20261020'
  });
  assert.equal(args.includes('-Command'), false);
  assert.equal(args[1], '-File');
  assert.equal(args[2].endsWith('sales-query.ps1'), true);
  assert.equal(args.includes('Bypass'), false);
  assert.equal(args[args.indexOf('-Plant') + 1], '00020|1');
  assert.equal(args[args.indexOf('-Cube') + 1], 'JDE Sales');
  const server = fs.readFileSync(new URL('../scripts/sales-server.mjs', import.meta.url), 'utf8');
  assert.match(server, /execFile\(/);
  assert.doesNotMatch(server, /-Command/);
  assert.doesNotMatch(server, /shell:\s*true/);
  assert.doesNotMatch(server, /Access-Control-Allow-Origin/);
});

test('HTTP contract, cache, and server-side AI context', async () => {
  const calls = [];
  let failOnce = false;
  let gate;
  let release;
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'sipbi-sales-'));
  fs.writeFileSync(path.join(dist, 'hello.txt'), 'hello');
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>sipbi</title>');
  let captured = null;
  let aiEnabled = false;
  const ai = {
    getAiStatus() { return { enabled: aiEnabled, reason: 'missing' }; },
    async handleAnalysis({ body }) {
      captured = body;
      return { statusCode: 200, body: { status: 'ok', analysis: { observations: ['Risk-based concentration increased','sk-proj-EXAMPLEKEY1234567890'], arithmeticContributions: [], hypotheses: [], evidence: ['server context'] } } };
    }
  };
  const server = createSalesServer({
    distDir: dist,
    ai,
    now: () => T,
    query: async (request) => {
      calls.push(request);
      if (request.kind === 'members') return members;
      if (request.kind === 'status') return { ok: true, queriedAt: T, salesLineCount: 60000, orderCount: 20111 };
      if (gate) await gate;
      if (failOnce) {
        failOnce = false;
        return { ok: false, code: 'source_unavailable', message: 'Provider=secret' };
      }
      return happyBundle();
    }
  });
  const base = await listen(server);
  try {
    const health = await fetch(base + '/api/health');
    const healthBody = await health.json();
    assert.equal(health.status, 200);
    assert.equal(healthBody.scope, 'process');
    assert.equal(health.headers.get('access-control-allow-origin'), null);
    assert.equal(calls.length, 0);

    const options = await fetch(base + '/api/health', { method: 'OPTIONS' });
    assert.equal(options.status, 204);
    assert.equal(options.headers.get('access-control-allow-origin'), null);

    const status = await fetch(base + '/api/source/status');
    const statusBody = await status.json();
    assert.equal(status.status, 200);
    assert.equal(statusBody.ready, true);
    assert.equal(statusBody.probe.orderCount, 20111);
    assert.equal(statusBody.source.dateRole, 'Invoice Date');
    assert.equal(statusBody.source.currency, 'USD');

    const metadata = await fetch(base + '/api/metadata');
    const meta = await metadata.json();
    assert.equal(meta.status, 'ok');
    assert.equal(meta.pages.some((page) => page.id === 'D07' || page.id === 'D03'), false);
    assert.equal(meta.members.company.some((member) => member.key === 'All'), false);
    assert.equal(meta.months.some((month) => month.key === '202609'), true);

    const unknown = await fetch(base + '/api/dashboards/D01?machine=All');
    assert.equal(unknown.status, 400);
    assert.equal((await unknown.json()).error.code, 'invalid_parameter');

    const repeated = await fetch(base + '/api/dashboards/D01?month=202609&month=202608');
    assert.equal(repeated.status, 400);
    assert.equal((await repeated.json()).error.code, 'repeated_parameter');

    const hidden = await fetch(base + '/api/dashboards/D03');
    assert.equal(hidden.status, 400);
    assert.equal((await hidden.json()).error.code, 'invalid_page');

    const badMonth = await fetch(base + '/api/dashboards/D01?month=202613');
    assert.equal(badMonth.status, 400);

    const badCompany = await fetch(base + '/api/dashboards/D01?company=99999');
    assert.equal(badCompany.status, 400);
    assert.equal((await badCompany.json()).error.code, 'invalid_member');

    const future = await fetch(base + '/api/dashboards/D01?month=202701');
    const futureBody = await future.json();
    assert.equal(future.status, 200);
    assert.equal(futureBody.status, 'no_data');
    assert.equal(futureBody.kpis.netSalesUSD, null);
    assert.match(futureBody.evidence.notes.join(' '), /not an Invoice Date member/);

    const outside = await fetch(base + '/api/dashboards/D01?month=202612');
    const outsideBody = await outside.json();
    assert.equal(outsideBody.status, 'no_data');
    assert.equal(outsideBody.analysis.historyStatus, 'insufficient_history');
    assert.equal(outsideBody.analysis.rolling12NetSalesUSD, null);

    const callsBefore = calls.filter((item) => item.kind === 'bundle').length;
    const dash = await fetch(base + '/api/dashboards/D01');
    const dashBody = await dash.json();
    assert.equal(dash.status, 200);
    assert.equal(dashBody.filters.month, '202609');
    assert.equal(dashBody.filters.company, 'All');
    assert.equal(dashBody.kpis.orderCount, 3);
    assert.equal(dashBody.kpis.grossMarginPercent, 0.6);
    assert.equal(dashBody.datasets.monthly.length, 33);
    assert.equal(dashBody.datasets.monthly[0].orderCount, null);
    assert.equal(dashBody.datasets.products[0].key, 'P2');
    assert.equal(dashBody.analysis.rolling3NetSalesUSD, 15);
    assert.equal(dashBody.source.cube, 'JDE Sales');
    assert.equal(dashBody.source.synthetic, true);
    assert.equal(JSON.stringify(dashBody).includes('CNY'), false);

    const again = await fetch(base + '/api/dashboards/D02');
    const againBody = await again.json();
    assert.notEqual(againBody.evidence.requestId, dashBody.evidence.requestId);
    assert.equal(againBody.evidence.queryHash === dashBody.evidence.queryHash, false);
    const bundleCalls = calls.filter((item) => item.kind === 'bundle' && item.filters.month === '202609');
    assert.equal(bundleCalls.length, callsBefore + 1);

    const drill = await fetch(base + '/api/drilldown?groupBy=month');
    const drillBody = await drill.json();
    assert.equal(drillBody.rows.length, 1);
    assert.equal(drillBody.rows[0].key, '202609');
    assert.equal(calls.filter((item) => item.kind === 'bundle' && item.filters.month === '202609').length, bundleCalls.length);

    const badGroup = await fetch(base + '/api/drilldown?groupBy=order');
    assert.equal(badGroup.status, 400);

    const hello = await fetch(base + '/hello.txt');
    assert.equal(await hello.text(), 'hello');
    const root = await fetch(base + '/');
    assert.match(await root.text(), /sipbi/);
    const escape = await fetch(base + '/%2e%2e/%2e%2e/package.json');
    assert.ok([400,404].includes(escape.status));
    assert.equal((await escape.text()).includes('sales-server'), false);

    failOnce = true;
    const broken = await fetch(base + '/api/dashboards/D01?company=00020');
    const brokenText = await broken.text();
    assert.equal(broken.status, 503);
    assert.equal(brokenText.includes('Provider'), false);
    assert.equal(brokenText.includes('stack'), false);
    const healed = await fetch(base + '/api/dashboards/D01?company=00020');
    assert.equal(healed.status, 200);

    gate = new Promise((resolve) => { release = resolve; });
    const parallelA = fetch(base + '/api/dashboards/D01?product=P1');
    const parallelB = fetch(base + '/api/dashboards/D01?product=P1');
    await waitFor(() => calls.filter((item) => item.kind === 'bundle' && item.filters.product === 'P1').length === 1);
    release();
    const [left, right] = await Promise.all([parallelA, parallelB]);
    assert.equal(left.status, 200);
    assert.equal(right.status, 200);
    assert.equal(calls.filter((item) => item.kind === 'bundle' && item.filters.product === 'P1').length, 1);

    aiEnabled = true;
    const analysis = await fetch(base + '/api/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'What changed?',
        context: { pageId: 'D01', filters: { month: '202609' }, kpis: { netSalesUSD: 1 } }
      })
    });
    assert.equal(analysis.status, 200);
    const aiBody = await analysis.json();
    assert.equal(aiBody.analysis.observations[0], 'Risk-based concentration increased');
    assert.equal(aiBody.analysis.observations[1], '[redacted]');
    assert.equal(captured.context.kpis.netSalesUSD, 100);
    assert.notEqual(captured.context.kpis.netSalesUSD, 1);

    const hiddenAnalysis = await fetch(base + '/api/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'x', context: { pageId: 'D03', filters: { month: '202609' } } })
    });
    assert.equal(hiddenAnalysis.status, 400);

    const thrown = createSalesServer({
      ai: disabledAi,
      query: async () => { throw new Error('SECRET_PROVIDER=super'); }
    });
    const thrownBase = await listen(thrown);
    const secret = await fetch(thrownBase + '/api/metadata');
    const secretText = await secret.text();
    assert.equal(secret.status, 503);
    assert.equal(secretText.includes('SECRET'), false);
    await close(thrown);
  } finally {
    await close(server);
    fs.rmSync(dist, { recursive: true, force: true });
  }
});

test('D07 is listed only when AI is enabled', async () => {
  const enabled = createSalesServer({
    ai: {
      getAiStatus() { return { enabled: true }; },
      async handleAnalysis() { return { statusCode: 200, body: { status: 'ok' } }; }
    },
    query: async (request) => request.kind === 'members' ? members : happyBundle()
  });
  const base = await listen(enabled);
  try {
    const meta = await (await fetch(base + '/api/metadata')).json();
    assert.equal(meta.ai.enabled, true);
    assert.equal(meta.pages.some((page) => page.id === 'D07'), true);
    const page = await fetch(base + '/api/dashboards/D07');
    assert.equal(page.status, 200);
    assert.equal((await page.json()).pageId, 'D07');
  } finally {
    await close(enabled);
  }
});
