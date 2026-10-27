import test from 'node:test';
import assert from 'node:assert/strict';
import { createSalesServer } from '../scripts/sales-server.mjs';

test('default sales server rejects independent operations before any source query', async () => {
  let calls = 0;
  const server = createSalesServer({env: {}, operationsRunQuery: async () => { calls++; throw new Error('must not execute'); }});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const route of ['/api/operations/status', '/api/operations/dashboard?kind=production&month=202610']) {
      const response = await fetch(base + route);
      assert.equal(response.status, 404);
      assert.equal((await response.json()).error.code, 'operations_disabled');
    }
    assert.equal(calls, 0);
    assert.equal((await fetch(base + '/api/health')).status, 200);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
