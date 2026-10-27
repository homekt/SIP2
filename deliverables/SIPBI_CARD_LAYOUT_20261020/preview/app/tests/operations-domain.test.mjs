import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseOperationsSearch, operationsPowerShellArgs, buildOperationsResponse } from '../scripts/operations-domain.mjs';

const request = { mode: 'dashboard', kind: 'production', month: '202610' };
const raw = () => ({ status: 'ok', queriedAt: '2026-10-21T00:00:00Z', datasets: [{ name: 'machines', dateRole: 'ProductionDate', grain: ['company', 'machine'], measures: ['Scheduled Job OEE %', 'Input KG'], mdx: 'SELECT real query', period: '202610', rows: [{ company_key: '00020', company_label: 'Taiwan', machine_key: '00020|MC01', machine_label: 'MC01', 'Scheduled Job OEE %': null, 'Input KG': 20 }] }] });
test('operations accept an independent validated kind and month', () => {
  assert.deepEqual(parseOperationsSearch('?kind=budget&month=202609'), { mode: 'dashboard', kind: 'budget', month: '202609' });
  assert.equal(parseOperationsSearch('?kind=production').month, '202610');
  assert.deepEqual(parseOperationsSearch('', true), { mode: 'status' });
});
test('duplicate, unknown and sales filters are rejected rather than ignored', () => {
  for (const search of ['?kind=budget&kind=production', '?kind=budget&month=202610&month=202610', '?kind=budget&customer=All', '?kind=budget&company=All', '?kind=budget&Month=202610', '?kind=budget&region=All', '?kind=budget&day=All']) assert.throws(() => parseOperationsSearch(search));
  assert.throws(() => parseOperationsSearch('?kind=production', true));
});
test('month and kind cannot cross either interpreter boundary', () => {
  for (const month of ['All', '202613', '202600', '202610]', '202610;Write-Output x', '$(1+1)', '202610\n', '000001']) {
    assert.throws(() => parseOperationsSearch(new URLSearchParams({ kind: 'budget', month })));
    assert.throws(() => operationsPowerShellArgs('x.ps1', { ...request, month }));
  }
  assert.throws(() => parseOperationsSearch('?kind=production%3Bexit'));
  const args = operationsPowerShellArgs('C:\\directory with spaces\\operations-query.ps1', request);
  assert.deepEqual(args, ['-NoProfile', '-NonInteractive', '-File', 'C:\\directory with spaces\\operations-query.ps1', '-Mode', 'dashboard', '-Kind', 'production', '-Month', '202610']);
  assert.ok(!args.includes('-Command'));
});
test('nulls, native composite identity and CNY source survive response shaping', () => {
  const result = buildOperationsResponse(request, raw());
  assert.equal(result.datasets[0].rows[0]['Scheduled Job OEE %'], null);
  assert.equal(result.datasets[0].rows[0].machine_key, '00020|MC01');
  assert.equal(result.source.database, 'SI_Powered_BI');
  assert.equal(result.source.currency, 'CNY');
  assert.equal(result.source.synthetic, true);
  assert.equal(result.source.asOf, '2026-10-19');
  assert.deepEqual(result.evidence.filters, { month: '202610' });
  assert.equal(result.datasets[0].queryHash, createHash('sha256').update('SELECT real query').digest('hex'));
});
test('no-data reflects null measures, while zero is a valid actual value', () => {
  const input = raw(); input.datasets[0].rows[0]['Input KG'] = null;
  assert.equal(buildOperationsResponse(request, input).status, 'no_data');
  input.datasets[0].rows[0]['Input KG'] = 0;
  assert.equal(buildOperationsResponse(request, input).status, 'ok');
});
test('schema defects, string numeric cells, missing native keys and duplicates fail closed', () => {
  for (const value of ['0.75', Infinity, NaN, undefined]) { const input = raw(); input.datasets[0].rows[0]['Input KG'] = value; assert.throws(() => buildOperationsResponse(request, input)); }
  const absent = raw(); delete absent.datasets[0].rows[0].machine_key; assert.throws(() => buildOperationsResponse(request, absent));
  const duplicate = raw(); duplicate.datasets[0].rows.push({ ...duplicate.datasets[0].rows[0] }); assert.throws(() => buildOperationsResponse(request, duplicate));
  assert.throws(() => buildOperationsResponse(request, { status: 'error', datasets: [] }));
});
test('query script binds snapshot, native keys, named columns, public measures and real NONEMPTY', () => {
  const script = readFileSync(new URL('../scripts/operations-query.ps1', import.meta.url), 'utf8');
  assert.ok(script.includes('Properties("KEY")'));
  assert.ok(script.includes('$table.Columns.Contains($column)'));
  assert.ok(script.includes('[Day].[Date].[Date].&[20261019]'));
  assert.ok(script.includes("Read-Dataset 'backlogAging' 'AsOfDate' @('company','aging') $backlog 'snapshot'"));
  assert.ok(script.includes('NONEMPTY('));
  assert.ok(!script.includes('[Measures].[__'));
  assert.ok(!script.includes('$row[0]'));
  assert.ok(!script.includes('Invoke-Expression'));
});
