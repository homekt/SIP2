import test from 'node:test';
import assert from 'node:assert/strict';
import { trailingAverage, rankComparison, comparisonMonths, loadBounded } from '../frontend/src/composition/comparisonMath.ts';

test('moving average requires a contiguous complete window and never crosses null', () => {
  const rows = [{ key:'202412', value:12 },{ key:'202501',value:18 },{ key:'202502',value:30 },{ key:'202503',value:null },{ key:'202504',value:10 },{ key:'202506',value:20 }];
  assert.deepEqual(trailingAverage(rows,3),[null,null,20,null,null,null]);
  assert.deepEqual(trailingAverage([{key:'202501',value:0},{key:'202502',value:-3},{key:'202503',value:0}],3),[null,null,-1]);
});
test('comparison month axis is chronological and keeps absent member-month cells', () => {
  assert.deepEqual(comparisonMonths([[{key:'202503'},{key:'202501'}],[{key:'202502'},{key:'202503'}]],3),['202501','202502','202503']);
});
test('rank uses a fixed selected population with competition ties and rejects incomplete periods', () => {
  assert.deepEqual(rankComparison([30,30,10]),[1,1,3]);
  assert.deepEqual(rankComparison([-4,0,-2]),[3,1,2]);
  assert.deepEqual(rankComparison([30,null,10]),[null,null,null]);
  assert.deepEqual(rankComparison([null,null]),[null,null]);
});
test('comparison query loading is bounded to two concurrent workers and preserves input ordering', async () => {
  let active=0,peak=0;
  const values=await loadBounded([1,2,3,4,5],async item=>{
    active++; peak=Math.max(peak,active);
    await new Promise(resolve=>setTimeout(resolve,5)); active--; return item*2;
  },2);
  assert.deepEqual(values,[2,4,6,8,10]); assert.equal(peak,2);
});
test('comparison abort stops queued queries and rejects instead of yielding stale results', async () => {
  const controller=new AbortController(); let calls=0;
  await assert.rejects(loadBounded([1,2,3,4],async item=>{calls++;controller.abort();return item;},1,controller.signal),{name:'AbortError'});
  assert.equal(calls,1);
});
