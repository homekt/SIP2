import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createSalesServer} from '../scripts/sales-server.mjs';
import {handleAnalysis,__resetAiRateLimits} from '../scripts/ai-analysis.mjs';

async function withServer(options,fn){const server=createSalesServer(options);await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await fn('http://127.0.0.1:'+server.address().port)}finally{await new Promise(r=>server.close(r))}}
test('disabled AI returns 503 without querying SSAS or calling a model',async()=>{
 let calls=0;await withServer({env:{},query:async()=>{calls++;throw Error('not expected')}},async base=>{
  const r=await fetch(base+'/api/analysis',{method:'POST',body:'{}'});assert.equal(r.status,503);assert.equal((await r.json()).error.code,'ai_disabled');assert.equal(calls,0);
 });
});
test('foreign origin cannot trigger enabled AI or a Cube query',async()=>{
 let calls=0;await withServer({ai:{getAiStatus:()=>({enabled:true}),handleAnalysis:()=>{calls++;throw Error('not expected')}},query:async()=>{calls++;throw Error('not expected')}},async base=>{
  const r=await fetch(base+'/api/analysis',{method:'POST',headers:{Origin:'https://unrelated.example','Content-Type':'application/json'},body:'{}'});assert.equal(r.status,403);assert.equal(calls,0);
 });
});
test('injection is rejected before the command boundary; malformed Host does not kill server',async()=>{
 const marker=path.resolve('SIPBI_INJECTION_MARKER');assert.equal(fs.existsSync(marker),false);let calls=0;
 await withServer({query:async()=>{calls++;throw Error('not expected')}},async base=>{
  const payload="$(Set-Content -LiteralPath SIPBI_INJECTION_MARKER -Value executed)";
  const r=await fetch(base+'/api/dashboards/D01?company='+encodeURIComponent(payload));assert.equal(r.status,400);assert.equal(calls,0);assert.equal(fs.existsSync(marker),false);
  await new Promise((resolve,reject)=>{http.get(base+'/api/health',{headers:{Host:'['}},res=>{assert.equal(res.statusCode,200);res.resume();res.on('end',resolve)}).on('error',reject)});
  assert.equal((await fetch(base+'/api/health')).status,200);
 });
});
test('AI daily quota limits requests across distinct IP addresses',async()=>{
 __resetAiRateLimits();let requests=0;
 const args={body:{question:'Describe aggregates',context:{status:'ok',pageId:'D01',filters:{month:'202609'},source:{currency:'USD',dateRole:'Invoice Date',cube:'JDE Sales'},kpis:{netSalesUSD:100},evidence:{requestId:'quota-request',queryHash:'quota-query'}}},env:{OPENAI_API_KEY:'test-key',OPENAI_MODEL:'test-model'},now:100000000,fetchImpl:async()=>{requests++;return {ok:true,json:async()=>({output_text:JSON.stringify({factIds:['scope-sales'],interpretationIds:[],actionIds:[]})})}}};
 for(let i=0;i<100;i++){assert.equal((await handleAnalysis({...args,ip:'client-'+i})).statusCode,200)}
 assert.equal((await handleAnalysis({...args,ip:'client-101'})).statusCode,429);assert.equal(requests,100);__resetAiRateLimits();
});
