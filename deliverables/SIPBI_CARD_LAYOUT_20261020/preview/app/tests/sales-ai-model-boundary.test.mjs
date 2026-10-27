import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAnalysis,__resetAiRateLimits} from '../scripts/ai-analysis.mjs';
const filters={month:'202609',company:'All',product:'All',customer:'All',salesperson:'All',plant:'All',costCenter:'All'};
const context=()=>({status:'ok',pageId:'D14',filters,source:{currency:'USD',cube:'JDE Sales',database:'JDE_SALES_CUBE_20261020',dateRole:'Invoice Date'},kpis:{netSalesUSD:100},datasets:{products:[{key:'A',label:'A',netSalesUSD:100,grossProfitUSD:20,grossMarginPercent:.2,netQtyKG:10}]},analysis:{portfolio:{revenueMedian:100,weightedMargin:.2}},evidence:{requestId:'real-request',queryHash:'real-query'},panelId:'portfolio',productKey:'A'});
const invoke=async(output,ctx=context())=>{__resetAiRateLimits();let calls=0;const result=await handleAnalysis({body:{question:'Describe this product',context:ctx},env:{OPENAI_API_KEY:'fake',OPENAI_MODEL:'fake'},fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({output_text:JSON.stringify(output)})}}});return {result,calls};};
test('the exact prior contradiction probe is now rejected, rather than accepted as verified output',async()=>{
 const c=context();delete c.panelId;delete c.productKey;
 const {result}=await invoke({observations:['Net sales = 999999 USD'],arithmeticContributions:[],hypotheses:[],evidence:['fabricated-evidence-id']},c);
 assert.equal(result.statusCode,502);assert.equal(result.body.error.code,'unverified_model_output');assert.ok(!JSON.stringify(result.body).includes('999999'));
});
test('model can select a measured fact, but cannot attach its own value or evidence',async()=>{
 const valid={factIds:['selected-netSalesUSD'],interpretationIds:[],actionIds:['inspect-product-customers']};
 const {result,calls}=await invoke(valid);assert.equal(result.statusCode,200);assert.equal(calls,1);
 assert.equal(result.body.engine,'model-selected');assert.match(result.body.analysis.claims[0].text,/100/);assert.equal(result.body.analysis.claims[0].evidenceRef,'real-request');assert.equal(result.body.analysis.usedContext.productKey,'A');
 for(const bad of [{...valid,value:999999},{...valid,factIds:['unavailable']},{...valid,evidence:'fake'}]) assert.equal((await invoke(bad)).result.statusCode,502);
});
test('invalid source or selected row is rejected before calling any provider',async()=>{
 const c=context();c.source.currency='CNY';const foreign=await invoke({},c);assert.equal(foreign.calls,0);assert.equal(foreign.result.statusCode,422);
 const stale=context();stale.productKey='B';const absent=await invoke({},stale);assert.equal(absent.calls,0);assert.equal(absent.result.statusCode,400);
});
