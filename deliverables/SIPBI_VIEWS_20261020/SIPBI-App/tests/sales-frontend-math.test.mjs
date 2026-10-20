import test from 'node:test';
import assert from 'node:assert/strict';
import {enrichMonthly,waterfallSteps} from '../frontend/src/utils/salesMath.ts';
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
