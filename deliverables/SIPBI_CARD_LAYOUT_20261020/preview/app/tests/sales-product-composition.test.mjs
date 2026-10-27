import test from 'node:test';
import assert from 'node:assert/strict';
import {bubbleEligible,quantityDiameter,topAbsoluteImpact,categoryShares} from '../frontend/src/composition/productMath.ts';

test('bubble diameter preserves quantity AREA ratios without positive floors or clipping',()=>{
  assert.equal(quantityDiameter(25,100),24);
  assert.equal(quantityDiameter(100,100),48);
  assert.equal(quantityDiameter(0,100),0);
  assert.equal(quantityDiameter(-1,100),0);
  assert.equal(quantityDiameter(null,100),0);
  assert.ok(Math.abs(quantityDiameter(1,100)-4.8)<1e-12);
  assert.equal(quantityDiameter(25,100)**2/quantityDiameter(100,100)**2,0.25);
});
test('bubble exclusions retain signed/undefined data outside plot rather than assigning zero',()=>{
  const row={netSalesUSD:10,grossMarginPercent:-0.2,netQtyKG:10};
  assert.equal(bubbleEligible(row),true);
  for(const change of [{netSalesUSD:0},{netSalesUSD:-1},{netQtyKG:0},{netQtyKG:null},{grossMarginPercent:null}]) assert.equal(bubbleEligible({...row,...change}),false);
});
test('impact comparator keeps prior/current association and deterministic ties without mutating full reconciliation',()=>{
  const rows=[{key:'B',prior:100,current:110,delta:10},{key:'A',prior:30,current:20,delta:-10},{key:'C',prior:5,current:7,delta:2}];
  assert.deepEqual(topAbsoluteImpact(rows,2).map(r=>r.key),['A','B']);
  assert.equal(rows.reduce((s,r)=>s+r.delta,0),2);
  assert.equal(rows[0].key,'B');
});
test('category revenue/quantity share comparison uses complete nonnegative separate denominators',()=>{
  const shares=categoryShares([{key:'A',netSalesUSD:60,netQtyKG:10},{key:'B',netSalesUSD:40,netQtyKG:30}]);
  assert.deepEqual(shares.map(r=>[r.salesShare,r.quantityShare]),[[0.6,0.25],[0.4,0.75]]);
  assert.equal(categoryShares([{key:'X',netSalesUSD:-1,netQtyKG:3}]),null);
  assert.equal(categoryShares([{key:'X',netSalesUSD:2,netQtyKG:null}]),null);
});
