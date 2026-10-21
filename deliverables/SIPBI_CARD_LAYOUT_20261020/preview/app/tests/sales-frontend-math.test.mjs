import test from 'node:test';
import assert from 'node:assert/strict';
import {enrichMonthly,waterfallSteps,computeDrilldownSummary,computeGmAxisBounds,computeParetoPercentAxis} from '../frontend/src/utils/salesMath.ts';
test('R3/R12 and YTD preserve history shortage and reset at January',()=>{
 const rows=Array.from({length:14},(_,i)=>({key:String(2024+Math.floor(i/12))+String(i%12+1).padStart(2,'0'),netSalesUSD:i+1}));
 const series=enrichMonthly(rows);assert.equal(series[0].r3Val,null);assert.equal(series[10].r12Val,null);assert.equal(series[11].r12Val,78);assert.equal(series[13].r12Val,102);assert.equal(series[12].ytdVal,13);assert.equal(series[13].ytdVal,27);
 const missing=enrichMonthly([{key:'202401',netSalesUSD:1},{key:'202402',netSalesUSD:null},{key:'202403',netSalesUSD:3}]);assert.equal(missing[2].r3Val,null);assert.equal(missing[2].ytdVal,null);
 const gap=enrichMonthly([{key:'202401',netSalesUSD:1},{key:'202403',netSalesUSD:2},{key:'202404',netSalesUSD:3}]);assert.equal(gap[2].r3Val,null);
});
test('bridge includes every product through Others and ties start to end',()=>{
 const items=Array.from({length:20},(_,i)=>({key:'P'+i,label:'P'+i,prior:10,current:10+i-12,delta:i-12}));
 const current=100+items.reduce((s,r)=>s+r.delta,0);const steps=waterfallSteps(100,current,items);
 assert.equal(steps.length,15);assert.equal(steps[0].to,100);assert.equal(steps.at(-1).to,current);assert.equal(steps.filter(x=>x.kind!=='total').reduce((s,r)=>s+r.delta,0),current-100);
 const middle=steps.slice(1,-1);for(let i=1;i<middle.length;i++)assert.equal(middle[i].from,middle[i-1].to);assert.equal(middle.at(-1).to,current);
 assert.deepEqual(waterfallSteps(null,current,items),[]);
});
test('computeDrilldownSummary computes weighted ratios and never sums distinct orderCount',()=>{
 const rows=[
  {key:'C1',label:'Cust 1',netSalesUSD:1000,grossProfitUSD:100,grossMarginPercent:0.10,netQtyKG:100,salesQtyKG:100,returnQtyKG:10,returnRatePercent:0.10,averageSellingPriceUSD:10,orderCount:5,salesLineCount:12},
  {key:'C2',label:'Cust 2',netSalesUSD:3000,grossProfitUSD:900,grossMarginPercent:0.30,netQtyKG:150,salesQtyKG:200,returnQtyKG:20,returnRatePercent:0.10,averageSellingPriceUSD:20,orderCount:8,salesLineCount:18},
 ];
 const summary=computeDrilldownSummary(rows);
 assert.equal(summary.netSalesUSD,4000);
 assert.equal(summary.grossProfitUSD,1000);
 // Weighted GM% must be 1000 / 4000 = 0.25 (NOT unweighted average (0.10+0.30)/2 = 0.20)
 assert.equal(summary.grossMarginPercent,0.25);
 assert.equal(summary.netQtyKG,250);
 // Weighted ASP must be 4000 / 250 = 16 (NOT unweighted average (10+20)/2 = 15)
 assert.equal(summary.averageSellingPriceUSD,16);
 // Weighted Return % must be 30 / 300 = 0.10
 assert.equal(summary.returnRatePercent,0.10);
 assert.equal(summary.salesLineCount,30);
 // Distinct orderCount across rows is non-additive and must remain null in row-sum summary
 assert.equal(summary.orderCount,null);
 assert.equal(computeDrilldownSummary([]),null);
});
test('computeGmAxisBounds focuses narrow positive GM% band with breathing room and preserves negative bounds',()=>{
 // Narrow band 25.8%..26.8% should focus around ~22..30 instead of 0..30
 const b1=computeGmAxisBounds({min:25.8,max:26.8});
 assert.ok(b1.min>=20 && b1.min<=24, `expected focused min in 20..24, got ${b1.min}`);
 assert.ok(b1.max>=28 && b1.max<=31, `expected focused max in 28..31, got ${b1.max}`);
 assert.ok(b1.max-b1.min>=5 && b1.max-b1.min<=10);
 // Negative margin slice must never clip below bound.min
 const bNeg=computeGmAxisBounds({min:-4.2,max:18.5});
 assert.ok(bNeg.min<=-5);
 assert.ok(bNeg.max>=20);
});

test("computeParetoPercentAxis scales Top-20 cumulative share window and toggles 80% line appropriately",()=>{
  const top20Low = computeParetoPercentAxis(19.5, "top20");
  assert.deepEqual(top20Low, { min: 0, max: 25, interval: 5, showPareto80Line: false });
  const top20High = computeParetoPercentAxis(72.0, "top20");
  assert.deepEqual(top20High, { min: 0, max: 100, interval: 20, showPareto80Line: true });
  const allCustomers = computeParetoPercentAxis(100, "all");
  assert.deepEqual(allCustomers, { min: 0, max: 100, interval: 20, showPareto80Line: true });
});
