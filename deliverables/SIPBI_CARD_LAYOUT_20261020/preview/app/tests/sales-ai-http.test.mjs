import test from 'node:test';
import assert from 'node:assert/strict';
import {createSalesServer} from '../scripts/sales-server.mjs';
import {__resetAiRateLimits} from '../scripts/ai-analysis.mjs';
import {T,disabledAi,members,happyBundle} from './fixtures/analysis-source.mjs';
async function withServer(run){const server=createSalesServer({ai:disabledAi,now:()=>T,query:async r=>r.kind==='members'?members:happyBundle()});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await run('http://127.0.0.1:'+server.address().port);}finally{await new Promise(r=>server.close(r));}}
const filters={month:'202609',company:'All',product:'All',customer:'All',salesperson:'All',plant:'All',costCenter:'All'};
async function post(base,context,headers={}){const response=await fetch(base+'/api/analysis/brief',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({question:'��Ū�ثe���~',context})});return {status:response.status,body:await response.json()};}
test('disabled model still provides source-rebuilt selected-product brief and snapshot',()=>withServer(async base=>{
 const dashboard=await (await fetch(base+'/api/dashboards/D14?month=202609')).json();
 assert.match(dashboard.evidence.snapshotId,/^[a-f0-9]{64}$/);
 const result=await post(base,{pageId:'D14',filters,panelId:'portfolio',productKey:'P1',expectedSnapshotId:dashboard.evidence.snapshotId,kpis:{netSalesUSD:999999}});
 assert.equal(result.status,200);assert.equal(result.body.engine,'deterministic');
 assert.equal(result.body.analysis.facts.find(f=>f.id==='selected-netSalesUSD').value,30);
 assert.equal(result.body.analysis.usedContext.snapshotId,dashboard.evidence.snapshotId);
 assert.equal(JSON.stringify(result.body).includes('999999'),false);
 const model=await fetch(base+'/api/analysis',{method:'POST'});assert.equal(model.status,503);
}));
test('brief rejects stale snapshot, invalid population, wrong panel, no data and cross-origin',()=>withServer(async base=>{
 const context={pageId:'D14',filters,panelId:'portfolio',productKey:'P1'};
 assert.equal((await post(base,{...context,expectedSnapshotId:'0'.repeat(64)})).status,409);
 assert.equal((await post(base,{...context,productKey:'missing'})).status,400);
 assert.equal((await post(base,{...context,panelId:'growth'})).status,400);
 assert.equal((await post(base,{...context,filters:{...filters,month:'202612'}})).status,422);
 assert.equal((await post(base,context,{origin:'https://foreign.example'})).status,403);
 assert.equal((await fetch(base+'/api/analysis/brief')).status,405);
}));
test('growth brief reconciles complete historical population including disappeared product',()=>withServer(async base=>{
 const result=await post(base,{pageId:'D16',filters,panelId:'growth'});
 assert.equal(result.status,200);assert.equal(result.body.analysis.facts.find(f=>f.id==='total-delta').value,70);
 assert.ok(result.body.analysis.facts.some(f=>f.entityKey==='P3'&&f.value===-10));
}));


test('HTTP model route enforces trusted rendering and stale snapshot before provider',async()=>{
 __resetAiRateLimits();let calls=0,output={factIds:['selected-netSalesUSD'],interpretationIds:[],actionIds:[]};
 const server=createSalesServer({env:{OPENAI_API_KEY:'fake-test-only',OPENAI_MODEL:'fake-test-only'},now:()=>T,query:async r=>r.kind==='members'?members:happyBundle(),fetchImpl:async(_url,options)=>{calls++;const payload=JSON.parse(options.body);assert.equal(payload.store,false);assert.ok(payload.input[1].content[0].text.includes('selected-netSalesUSD'));return {ok:true,json:async()=>({output_text:JSON.stringify(output)})};}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const context={pageId:'D14',filters,panelId:'portfolio',productKey:'P1',kpis:{netSalesUSD:999999},source:{currency:'CNY'},evidence:{requestId:'fake'}};
 const invoke=async ctx=>{const r=await fetch(base+'/api/analysis',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:'show value',context:ctx})});return {status:r.status,body:await r.json()};};
 try {
  const good=await invoke(context);assert.equal(good.status,200);assert.equal(good.body.engine,'model-selected');assert.equal(good.body.analysis.facts.find(f=>f.id==='selected-netSalesUSD').value,30);assert.notEqual(good.body.analysis.claims[0].evidenceRef,'fake');
  const stale=await invoke({...context,expectedSnapshotId:'0'.repeat(64)});assert.equal(stale.status,409);assert.equal(calls,1);
  output={observations:['999999 USD'],arithmeticContributions:[],hypotheses:[],evidence:['fabricated']};
  const bad=await invoke(context);assert.equal(bad.status,502);assert.equal(bad.body.error.code,'unverified_model_output');assert.ok(!JSON.stringify(bad.body).includes('999999'));
 } finally {await new Promise(r=>server.close(r));}
});
