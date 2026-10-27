import assert from 'node:assert/strict';
import fs from 'node:fs';
const base='http://127.0.0.1:55274';
const receipt={startedAt:new Date().toISOString(),base,checks:[],pages:[]};
const filters={month:'202609',company:'All',product:'All',customer:'All',salesperson:'All',plant:'All',costCenter:'All'};
async function get(route){const r=await fetch(base+route);const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return body;}
const source=body=>{assert.equal(body.source.server,'localhost:25000');assert.equal(body.source.database,'JDE_SALES_CUBE_20261020');assert.equal(body.source.cube,'JDE Sales');assert.equal(body.source.currency,'USD');assert.equal(body.source.quantityUnit,'KG');};
const near=(a,b,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<.011,`${label}: ${a} vs ${b}`);
const status=await get('/api/source/status');assert.equal(status.ready,true);source(status);assert.equal(status.probe.salesLineCount,60000);assert.equal(status.probe.orderCount,20111);receipt.checks.push('real JDE source status 60000/20111');
const meta=await get('/api/metadata');source(meta);assert.equal(meta.operations.enabled,false);assert.equal(meta.ai.enabled,false);assert.equal(meta.pages.length,12);receipt.checks.push('12 sales pages; other cube and cloud model disabled');
const direct=JSON.parse(fs.readFileSync(new URL('./ssas-independent.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
let d14,d16;
for(const page of meta.pages){
 const d=await get(`/api/dashboards/${page.id}?month=202609`);assert.equal(d.status,'ok');source(d);assert.equal(d.filters.month,'202609');assert.match(d.evidence.snapshotId,/^[a-f0-9]{64}$/);
 near(d.kpis.netSalesUSD,direct['[Measures].[Net Sales USD]'],page.id+' sales');near(d.kpis.grossProfitUSD,direct['[Measures].[Gross Profit USD]'],page.id+' profit');near(d.kpis.netQtyKG,direct['[Measures].[Net Quantity KG]'],page.id+' qty');assert.equal(d.kpis.orderCount,direct['[Measures].[Order Count]']);near(d.kpis.grossMarginPercent,d.kpis.grossProfitUSD/d.kpis.netSalesUSD,page.id+' weighted margin');
 receipt.pages.push({id:page.id,kpis:d.kpis,requestId:d.evidence.requestId,queryHash:d.evidence.queryHash,snapshotId:d.evidence.snapshotId});
 if(page.id==='D14')d14=d;if(page.id==='D16')d16=d;
}
receipt.checks.push('all 12 API dashboards match independent SSAS MDX for September');
near(d16.analysis.waterfall.reduce((sum,row)=>sum+row.delta,0),d16.kpis.netSalesUSD-d16.analysis.priorYearNetSalesUSD,'D16 waterfall');receipt.checks.push('D16 full product waterfall reconciles with current minus prior KPI');
const september=await get('/api/dashboards/D01?month=202609&company=00020');const august=await get('/api/dashboards/D01?month=202608&company=00020');assert.equal(september.filters.company,'00020');assert.equal(august.filters.month,'202608');assert.notEqual(september.kpis.netSalesUSD,august.kpis.netSalesUSD);receipt.checks.push('actual month/company filters change source-backed values');
const early=await get('/api/dashboards/D16?month=202401');assert.equal(early.analysis.priorYearNetSalesUSD,null);assert.equal(early.analysis.waterfall.length,0);receipt.checks.push('first-year growth has no invented prior or waterfall');
const future=await get('/api/dashboards/D01?month=203001');assert.equal(future.status,'no_data');receipt.checks.push('future period returns no_data');
const selected=d14.datasets.products.find(row=>Number.isFinite(row.netSalesUSD));
const ctx={pageId:'D14',filters,panelId:'portfolio',productKey:selected.key,locale:'zh-TW',expectedSnapshotId:d14.evidence.snapshotId,kpis:{netSalesUSD:999999}};
async function brief(context){const r=await fetch(base+'/api/analysis/brief',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:'核對目前產品資料與來源',context})});return{status:r.status,body:await r.json()};}
// Refresh the page immediately before requesting its corresponding snapshot.
d14=await get('/api/dashboards/D14?month=202609');ctx.expectedSnapshotId=d14.evidence.snapshotId;
const explanation=await brief(ctx);assert.equal(explanation.status,200,JSON.stringify(explanation.body));assert.equal(explanation.body.engine,'deterministic');assert.equal(explanation.body.analysis.usedContext.productKey,selected.key);assert.equal(explanation.body.analysis.usedContext.snapshotId,ctx.expectedSnapshotId);const fact=explanation.body.analysis.facts.find(f=>f.id==='selected-netSalesUSD');near(fact.value,selected.netSalesUSD,'server-bound selected product');
const stale=await brief({...ctx,expectedSnapshotId:'0'.repeat(64)});assert.equal(stale.status,409);const missing=await brief({...ctx,productKey:'UNAVAILABLE_PRODUCT'});assert.equal(missing.status,400);receipt.checks.push('real deterministic interpretation binds selected product and snapshot; rejects stale snapshot and missing product; ignores client numeric claims');
for(const route of ['/api/operations/status','/api/operations/dashboard?kind=production&month=202610']){const r=await fetch(base+route);assert.equal(r.status,404);assert.equal((await r.json()).error.code,'operations_disabled');}receipt.checks.push('independent operations source blocked by live API');
receipt.completedAt=new Date().toISOString();receipt.interpretation={engine:explanation.body.engine,claims:explanation.body.analysis.claims,source:explanation.body.analysis.usedContext};
fs.writeFileSync(new URL('./live-verification.json',import.meta.url),JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:'PASS',pages:receipt.pages.length,checks:receipt.checks},null,2));
