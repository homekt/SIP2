import test from 'node:test';
import assert from 'node:assert/strict';
import { createSalesServer } from '../scripts/sales-server.mjs';

test('other project operations remain blocked even if enabled', async () => {
  let calls = 0;
  const server = createSalesServer({env: {SIPBI_ENABLE_OPERATIONS: '1'}, operationsRunQuery: async () => { calls++; }});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const route of ['/api/operations/status', '/api/operations/dashboard?kind=production&month=202610']) {
      const response = await fetch(base + route);
      assert.equal(response.status, 404);
      assert.equal((await response.json()).error.code, 'operations_disabled');
    }
    assert.equal(calls, 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('sales server rejects alternate source settings before querying', () => {
  for (const options of [
    {env: {SIPBI_SSAS_DATABASE: 'SI_Powered_BI'}},
    {env: {SIPBI_SSAS_SERVER: 'otherhost:25000'}},
    {env: {}, sourceConfig: {server: 'localhost:25000', database: 'SI_Powered_BI', cube: 'JDE Sales'}},
    {env: {}, sourceConfig: {server: 'localhost:25000', database: 'JDE_SALES_CUBE_20261020', cube: 'SI Manufacturing BI'}},
  ]) assert.throws(() => createSalesServer(options), {code: 'invalid_config'});
});
