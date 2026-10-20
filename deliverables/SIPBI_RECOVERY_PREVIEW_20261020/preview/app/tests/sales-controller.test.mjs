import test from 'node:test';
import assert from 'node:assert/strict';
import {checkMembers,deriveMetrics,buildWaterfall,concentration,planWindows} from '../scripts/sales-domain.mjs';

test('unknown members are rejected even when the selected month is absent',()=>{
 const members=Object.fromEntries(['company','product','customer','salesperson','plant','costCenter'].map(k=>[k,[]]));
 const filters={month:'209901',company:'not-a-company',product:'All',customer:'All',salesperson:'All',plant:'All',costCenter:'All'};
 assert.equal(checkMembers(filters,{months:[],members}).ok,false);
});
test('zero denominators and absent metrics remain null',()=>{
 const m=deriveMetrics({netSalesUSD:0,grossProfitUSD:0,salesQtyKG:0,returnQtyKG:0,netQtyKG:0});
 assert.equal(m.grossMarginPercent,null);assert.equal(m.averageSellingPriceUSD,null);assert.equal(m.returnRatePercent,null);assert.equal(m.orderCount,null);
});
test('growth includes a product that has disappeared, and a new product',()=>{
 const rows=buildWaterfall([{key:'new',label:'new',netSalesUSD:80}],[{key:'lost',label:'lost',netSalesUSD:100}]);
 assert.equal(rows.reduce((s,r)=>s+r.delta,0),-20);assert.equal(rows.find(x=>x.key==='lost').delta,-100);
});
test('negative customer population suppresses concentration',()=>{
 const c=concentration([{key:'a',netSalesUSD:100},{key:'b',netSalesUSD:-1}]);assert.equal(c.cr5,null);assert.equal(c.hhi,null);assert.equal(c.concentrationStatus,'invalid_population');
});
test('rolling windows never extend before source coverage',()=>{
 assert.equal(planWindows('202401').rolling3Months,null);assert.equal(planWindows('202401').rolling12Months,null);assert.equal(planWindows('202401').priorMonth,null);assert.equal(planWindows('All').historyStatus,'not_applicable');
});
