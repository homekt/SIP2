import test from 'node:test';
import assert from 'node:assert/strict';
import {stampDashboardSnapshot, buildFactEnvelope, validateSelection, renderSelection, defaultSelection} from '../scripts/analysis-facts.mjs';

export function dashboard(pageId='D14') {
 const filters={month:'202609',company:'All',product:'All',customer:'All',salesperson:'All',plant:'All',costCenter:'All'};
 return {status:'ok',pageId,filters,source:{server:'localhost:25000',database:'JDE_SALES_CUBE_20261020',cube:'JDE Sales',currency:'USD',quantityUnit:'KG',dateRole:'Invoice Date',synthetic:true,coverageStart:'202401',coverageEnd:'202609'},kpis:{netSalesUSD:100,grossProfitUSD:25,grossMarginPercent:.25,netQtyKG:40},datasets:{products:[{key:'P-A',label:'A <tag>',netSalesUSD:60,grossProfitUSD:12,grossMarginPercent:.2,netQtyKG:20},{key:'P-B',label:'B',netSalesUSD:40,grossProfitUSD:13,grossMarginPercent:.325,netQtyKG:null}],monthly:[]},analysis:{portfolio:{revenueMedian:50,weightedMargin:.25},priorYearNetSalesUSD:80,yoyGrowth:.25,waterfall:[{key:'P-A',label:'A <tag>',prior:40,current:60,delta:20},{key:'P-B',label:'B',prior:40,current:40,delta:0}]},evidence:{requestId:'request-original',queryHash:'query-original',queriedAt:'2026-10-21T00:00:00Z',dateRole:'Invoice Date',grain:'InvoiceMonth × Company',filters,measures:['Net Sales USD','Gross Profit USD'],notes:['Synthetic data, no login']}};
}
test('snapshot binds actual source, filter, page and values, without mutating input or treating request time as new data',()=>{
 const original=dashboard(), before=structuredClone(original), a=stampDashboardSnapshot(original);
 assert.deepEqual(original,before); assert.match(a.evidence.snapshotId,/^[a-f0-9]{64}$/);
 const refreshed=structuredClone(original);refreshed.evidence.requestId='new';refreshed.evidence.queriedAt='later';
 assert.equal(stampDashboardSnapshot(refreshed).evidence.snapshotId,a.evidence.snapshotId);
 for(const change of [d=>d.kpis.netSalesUSD++,d=>d.filters.company='00020',d=>d.source.currency='CNY',d=>d.pageId='D16',d=>d.datasets.products[0].grossProfitUSD++]) {const d=structuredClone(original);change(d);assert.notEqual(stampDashboardSnapshot(d).evidence.snapshotId,a.evidence.snapshotId);}
});
test('selected-product facts preserve row identity, real numbers and same-scope baselines',()=>{
 const d=stampDashboardSnapshot(dashboard());const e=buildFactEnvelope(d,{panelId:'portfolio',productKey:'P-A',locale:'zh-TW'});
 assert.equal(e.context.productKey,'P-A');assert.equal(e.context.pageId,'D14');assert.equal(e.context.snapshotId,d.evidence.snapshotId);
 assert.ok(e.facts.some(f=>f.entityKey==='P-A'&&f.metric==='netSalesUSD'&&f.value===60&&f.unit==='USD'));
 assert.ok(e.facts.some(f=>f.metric==='weightedMargin'&&f.value===.25));
 const s=defaultSelection(e),r=renderSelection(e,s);
 assert.ok(r.claims.length>0);assert.ok(r.claims.every(c=>c.factIds.every(id=>e.facts.some(f=>f.id===id))));
 assert.ok(r.claims.every(c=>c.evidenceRef==='request-original'));assert.equal(r.usedContext.requestId,'request-original');
});
test('null is unavailable, zero and negative are real; model cannot promote missing facts',()=>{
 const d=dashboard();d.datasets.products[0].grossProfitUSD=-5;d.datasets.products[0].netQtyKG=0;d.datasets.products[0].grossMarginPercent=null;
 const e=buildFactEnvelope(stampDashboardSnapshot(d),{panelId:'portfolio',productKey:'P-A'});
 assert.ok(e.facts.some(f=>f.value===-5));assert.ok(e.facts.some(f=>f.metric==='netQtyKG'&&f.value===0));
 const missing=e.facts.find(f=>f.metric==='grossMarginPercent'&&f.entityKey==='P-A');
 assert.equal(missing.value,null);assert.equal(validateSelection(e,{factIds:[missing.id],interpretationIds:[],actionIds:[]}).ok,false);
});
test('reject arbitrary prose, forged/duplicate fact IDs, unavailable interpretation, action objects, unsupported fields',()=>{
 const e=buildFactEnvelope(stampDashboardSnapshot(dashboard()),{panelId:'portfolio',productKey:'P-A'}),good=defaultSelection(e);
 assert.equal(validateSelection(e,good).ok,true);
 for(const bad of [{observations:['999999 USD'],arithmeticContributions:[],hypotheses:[],evidence:['invented']},{...good,factIds:['forged']},{...good,factIds:[good.factIds[0],good.factIds[0]]},{...good,interpretationIds:['raise-price']},{...good,actionIds:[{tab:'D03'}]},{...good,text:'sales = 999999'},{...good,evidenceRef:'forged'}]) assert.equal(validateSelection(e,bad).ok,false,JSON.stringify(bad));
 assert.throws(()=>renderSelection(e,{...good,factIds:['forged']}));
});
test('selection must exist in the actual current population; source/panel mismatch fails before any model',()=>{
 const d=stampDashboardSnapshot(dashboard());
 for(const request of [{panelId:'portfolio',productKey:'missing'},{panelId:'portfolio'},{panelId:'growth',productKey:'P-A'},{panelId:'arbitrary',productKey:'P-A'}]) assert.throws(()=>buildFactEnvelope(d,request));
 const foreign=structuredClone(d);foreign.source.currency='CNY';assert.throws(()=>buildFactEnvelope(foreign,{panelId:'portfolio',productKey:'P-A'}));
 const empty=structuredClone(d);empty.status='no_data';assert.throws(()=>buildFactEnvelope(empty,{panelId:'portfolio',productKey:'P-A'}));
});
test('growth envelope reconciles the full population before selecting drivers, including disappeared and signed products',()=>{
 const d=dashboard('D16');d.analysis.waterfall=[{key:'NEW',label:'New',prior:0,current:50,delta:50},{key:'GONE',label:'Gone',prior:30,current:0,delta:-30},{key:'REST',label:'Rest',prior:50,current:50,delta:0}];
 const e=buildFactEnvelope(stampDashboardSnapshot(d),{panelId:'growth'});
 assert.ok(e.facts.some(f=>f.entityKey==='GONE'&&f.metric==='delta'&&f.value===-30));
 assert.equal(e.context.panelId,'growth');assert.ok(e.actions.every(a=>a.filters.month==='202609'&&a.filters.company==='All'));
 d.analysis.waterfall[0].delta=51;assert.throws(()=>buildFactEnvelope(stampDashboardSnapshot(d),{panelId:'growth'}));
});
test('all actions are server-owned and stay in selected product/source scope; render binds evidence and cannot invent numbers',()=>{
 const e=buildFactEnvelope(stampDashboardSnapshot(dashboard()),{panelId:'portfolio',productKey:'P-A'}),r=renderSelection(e,defaultSelection(e));
 assert.ok(e.actions.length>0);assert.ok(e.actions.every(a=>a.filters.product==='P-A'));
 assert.ok(r.claims.every(c=>!c.text.includes('999999')));assert.ok(r.nextActions.every(a=>e.actions.some(x=>x.id===a.id)));
 assert.ok(r.limitations.some(t=>/因果|causal/.test(t)));
});
