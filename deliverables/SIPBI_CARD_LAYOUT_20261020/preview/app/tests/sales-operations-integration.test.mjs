import test from 'node:test';
import assert from 'node:assert/strict';
import { createSalesServer } from '../scripts/sales-server.mjs';

test('same-origin operations routes reach their own validated source handler', async () => {
  let calls=0;
  const server=createSalesServer({ env: { SIPBI_ENABLE_OPERATIONS: '1' }, operationsRunQuery: async request=>{ calls++; return {status:'ok',queriedAt:'2026-10-21T00:00:00Z',datasets:[{name:'summary',dateRole:'ProductionDate',grain:[],period:request.month,measures:['Input KG'],mdx:'SELECT approved',rows:[{'Input KG':100}]}]}; } });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const base=`http://127.0.0.1:${server.address().port}`;
    const response=await fetch(`${base}/api/operations/dashboard?kind=production&month=202610`);
    assert.equal(response.status,200); const body=await response.json();
    assert.equal(body.kind,'production'); assert.equal(body.source.currency,'CNY'); assert.equal(body.datasets[0].rows[0]['Input KG'],100);
    const invalid=await fetch(`${base}/api/operations/dashboard?kind=production&month=202610&customer=C01`);
    assert.equal(invalid.status,400); assert.equal(calls,1);
    const health=await fetch(`${base}/api/health`); assert.equal(health.status,200);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
