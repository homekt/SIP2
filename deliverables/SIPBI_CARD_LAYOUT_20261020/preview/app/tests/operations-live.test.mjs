import test from 'node:test';
import assert from 'node:assert/strict';
import { runOperationsQuery } from '../scripts/operations-http.mjs';
import { buildOperationsResponse } from '../scripts/operations-domain.mjs';

const live = process.env.SIPBI_OPERATIONS_LIVE === '1';
test('read-only Manufacturing live reconciliation: production, budget, delivery and fixed snapshot', { skip: !live, timeout: 150000 }, async () => {
  const responses = {};
  for (const kind of ['production', 'budget', 'fulfilment']) {
    const request = { mode: 'dashboard', kind, month: '202610' };
    responses[kind] = buildOperationsResponse(request, await runOperationsQuery(request));
    assert.equal(responses[kind].status, 'ok');
    console.log(kind, responses[kind].datasets.map(d => `${d.name}:${d.rows.length}`).join(', '));
  }
  const get = (kind, name) => responses[kind].datasets.find(d => d.name === name);
  const sum = (rows, field) => rows.reduce((total, row) => total + row[field], 0);
  const near = (actual, expected, tolerance = 0.02) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
  const prod = get('production', 'summary').rows[0];
  const machines = get('production', 'machines').rows;
  assert.ok(machines.every(row => row.machine_key.startsWith(`${row.company_key}|`)));
  for (const field of ['Input KG', 'Good KG', 'Scrap KG', 'Planned Minutes', 'Good Ideal Minutes', 'Operation Downtime Minutes']) near(sum(machines, field), prod[field]);
  near(prod['Scheduled Job OEE %'], sum(machines, 'Good Ideal Minutes') / sum(machines, 'Planned Minutes'), 0.000001);
  near(prod['Scrap Rate %'], sum(machines, 'Scrap KG') / sum(machines, 'Input KG'), 0.000001);
  near(sum(get('production', 'downtimeReasons').rows, 'Reason Downtime Minutes'), prod['Operation Downtime Minutes']);
  assert.ok(get('production', 'machineHistory').rows.every(row => /^20260[5-9]$|^202610$/.test(row.month_key)));
  const budget = get('budget', 'summary').rows[0];
  const companies = get('budget', 'companies').rows;
  for (const field of ['Net Sales CNY', 'Budget Sales CNY', 'Budget Sales To Date CNY', 'Budget Gap CNY', 'Budget Gap To Date CNY']) near(sum(companies, field), budget[field]);
  near(budget['Budget Gap CNY'], budget['Net Sales CNY'] - budget['Budget Sales CNY']);
  near(budget['Budget Gap To Date CNY'], budget['Net Sales CNY'] - budget['Budget Sales To Date CNY']);
  near(budget['Budget Achievement %'], budget['Net Sales CNY'] / budget['Budget Sales CNY'], 0.000001);
  const shipped = get('fulfilment', 'summary').rows[0];
  near(shipped['On Time Delivery %'], shipped['On Time Line Count'] / shipped['Shipped Line Count'], 0.000001);
  const october = get('fulfilment', 'deliveryTrend').rows.find(row => row.month_key === '202610');
  assert.equal(october['Shipped Line Count'], shipped['Shipped Line Count']);
  const snapshot = get('fulfilment', 'backlogSummary').rows[0];
  for (const field of ['Backlog CNY', 'Backlog KG', 'Backlog Line Count', 'Overdue Line Count']) near(sum(get('fulfilment', 'backlogAging').rows, field), snapshot[field]);
  assert.equal(get('fulfilment', 'backlogSummary').period, '2026-10-19');
  const septemberRequest = { mode: 'dashboard', kind: 'fulfilment', month: '202609' };
  const september = buildOperationsResponse(septemberRequest, await runOperationsQuery(septemberRequest));
  assert.deepEqual(september.datasets.find(d => d.name === 'backlogSummary').rows, get('fulfilment', 'backlogSummary').rows);
  assert.deepEqual(september.datasets.find(d => d.name === 'backlogAging').rows, get('fulfilment', 'backlogAging').rows);
  const futureRequest = { mode: 'dashboard', kind: 'production', month: '203001' };
  const future = buildOperationsResponse(futureRequest, await runOperationsQuery(futureRequest));
  assert.equal(future.status, 'no_data');
  assert.ok(future.datasets.find(d => d.name === 'summary').rows.every(row => Object.values(row).every(v => v === null)));
  console.log('October summary:', JSON.stringify({ production: prod, budget, delivery: shipped, backlog: snapshot }));
});
