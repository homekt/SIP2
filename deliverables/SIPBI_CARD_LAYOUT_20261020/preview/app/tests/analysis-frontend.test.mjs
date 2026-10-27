import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {makeAnalysisContext,validateAnalysisResponse,analysisContextKey} from '../frontend/src/components/ai/analysisContext.ts';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(app,'frontend/package.json')),ts=require('typescript');
const filters={month:'202609',company:'All',product:'All',customer:'All',salesperson:'All',plant:'All',costCenter:'All'};
function dashboard(snapshot='snapshot-A',overrides={}) {return {status:'ok',pageId:'D14',filters:{...filters},source:{server:'localhost:25000',database:'JDE_SALES_CUBE_20261020',cube:'JDE Sales',dateRole:'Invoice Date',currency:'USD',quantityUnit:'KG',synthetic:true,coverageStart:'202401',coverageEnd:'202609'},evidence:{snapshotId:snapshot,requestId:'dashboard-request',queryHash:'query-A'},...overrides};}
function result(d,product='P001',panelId='portfolio',locale='en') {return {status:'ok',engine:'deterministic',analysis:{claims:[{id:'sales',text:`Verified ${d.evidence.snapshotId}`,factIds:['fact-sales'],evidenceRef:'brief-request',kind:'observation'}],facts:[{id:'fact-sales',metric:'netSalesUSD',label:'Product sales',value:100,unit:'USD',entityKey:product,evidenceRef:'brief-request'}],usedContext:{pageId:d.pageId,panelId,productKey:product,locale,filters:d.filters,snapshotId:d.evidence.snapshotId,requestId:'brief-request',queryHash:d.evidence.queryHash,source:d.source,queriedAt:'2026-10-21T13:00:00Z'},nextActions:[{id:'inspect',kind:'navigate',tab:'D16',filters:{...d.filters,product:product||'All'},label:'Inspect selected product'}],limitations:['Synthetic demonstration source.']}};}
function harness(entry,extra={}) {
  let index=0,effects=[],slots=[],tree,props,appContext={lang:'en',aiEnabled:false,navigate:()=>{},openDrillDown:()=>{},...extra.appContext};
  const fetches=[],navigations=[];
  if(!extra.appContext?.navigate)appContext.navigate=(...args)=>navigations.push(args);
  const react={createElement:(type,props,...children)=>({type,props:{...props,children:children.flat(Infinity)}}),Fragment:'Fragment',useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useRef(initial){const i=index++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect(fn,deps){const i=index++,old=slots[i];if(!old||deps?.some((v,j)=>v!==old.deps[j]))effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};});},useMemo:fn=>fn(),useCallback:fn=>fn};
  const cache=new Map();
  function load(filename) {
    if(cache.has(filename))return cache.get(filename).exports;
    const module={exports:{}};cache.set(filename,module);
    const customRequire=id=>{
      if(id==='react')return react;
      if(id.includes('/context/AppContext'))return {useApp:()=>appContext};
      if(id.includes('/services/salesApi'))return extra.salesApi||{};
      if(id.includes('/components/common/StateGuard'))return {StateGuard:'StateGuard'};
      if(id==='./SalesAiWorkspace')return {default:'SalesAiWorkspace',__esModule:true};
      if(id.startsWith('.')){const target=path.resolve(path.dirname(filename),id),resolved=[target,`${target}.ts`,`${target}.tsx`].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());return load(resolved);}
      return require(id);
    };
    const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`,{AbortController,Error,console,fetch:(url,options)=>{let resolve;const promise=new Promise(r=>resolve=r);fetches.push({url,options,resolve:body=>resolve({ok:true,json:async()=>body})});return promise;}},{filename})(customRequire,module,module.exports);
    return module.exports;
  }
  const component=load(path.join(app,'frontend/src',entry));const renderFunction=component.default||component.VerifiedAnalysisPanel;
  return {render(nextProps=props){props=nextProps;index=0;effects=[];tree=renderFunction(props);const work=effects;effects=[];for(const effect of work)effect();return tree;},get tree(){return tree;},fetches,navigations,context:appContext};
}
function nodes(node,result=[]) {if(node&&typeof node==='object'){result.push(node);for(const child of node.props?.children||[])nodes(child,result);}return result;}
function text(node){return typeof node==='string'||typeof node==='number'?String(node):(node?.props?.children||[]).map(text).join(' ');}
function button(h,label){return nodes(h.tree).find(n=>n.type==='button'&&text(n).includes(label));}

test('analysis context binds actual page, all filters, selected product and snapshot without dashboard payload',()=>{
  const d=dashboard(),context=makeAnalysisContext(d,'portfolio','P001','en');
  assert.equal(context.expectedSnapshotId,'snapshot-A');assert.deepEqual(context.filters,filters);
  assert.equal(context.pageId,'D14');assert.equal(context.productKey,'P001');
  assert.equal('datasets' in context,false);assert.equal('kpis' in context,false);
  assert.notEqual(analysisContextKey(context),analysisContextKey({...context,productKey:'P002'}));
  assert.equal(makeAnalysisContext({...d,evidence:{queryHash:'query-A'}},'portfolio','P001','en'),null);
});
test('response validation rejects changed snapshot, filters, selection, source and invented fact/action references',()=>{
  const d=dashboard(),context=makeAnalysisContext(d,'portfolio','P001','en');assert.equal(validateAnalysisResponse(result(d),context,d).status,'ok');
  for(const mutate of [r=>r.analysis.usedContext.snapshotId='other',r=>r.analysis.usedContext.filters={...filters,company:'OTHER'},r=>r.analysis.usedContext.productKey='P002',r=>r.analysis.usedContext.source={...d.source,currency:'CNY'},r=>r.analysis.claims[0].factIds=['invented'],r=>r.analysis.nextActions[0].filters.company='OTHER']){const r=structuredClone(result(d));mutate(r);assert.throws(()=>validateAnalysisResponse(r,context,d));}
});
test('real panel sends governed brief contract, renders verified engine, and navigates only after explicit action',async()=>{
  const d=dashboard(),h=harness('components/ai/VerifiedAnalysisPanel.tsx');h.render({dashboard:d,panelId:'portfolio',productKey:'P001'});h.render();
  assert.equal(h.fetches.length,0);const pending=button(h,'Generate verified').props.onClick();
  assert.equal(h.fetches.length,1);const request=h.fetches[0];assert.equal(request.url,'/api/analysis/brief');
  const body=JSON.parse(request.options.body);assert.equal(body.context.pageId,'D14');assert.equal(body.context.productKey,'P001');assert.equal(body.context.expectedSnapshotId,'snapshot-A');assert.equal(typeof body.question,'string');assert.equal('datasets' in body.context,false);
  request.resolve(result(d));await pending;h.render();assert.match(text(h.tree),/Verified rule-based explanation \(no model call\)/);assert.match(text(h.tree),/Verified snapshot-A/);assert.equal(h.navigations.length,0);
  button(h,'Inspect selected product').props.onClick();assert.equal(h.navigations[0][0],'D16');assert.equal(h.navigations[0][1].product,'P001');
});
test('real panel hides previous result immediately on new snapshot and ignores late aborted responses',async()=>{
  const a=dashboard('snapshot-A'),b=dashboard('snapshot-B'),h=harness('components/ai/VerifiedAnalysisPanel.tsx');h.render({dashboard:a,panelId:'portfolio',productKey:'P001'});h.render();const pendingA=button(h,'Generate verified').props.onClick();
  h.render({dashboard:b,panelId:'portfolio',productKey:'P002'});assert.equal(h.fetches[0].options.signal.aborted,true);
  h.fetches[0].resolve(result(a));await pendingA;h.render();assert.doesNotMatch(text(h.tree),/Verified snapshot-A/);
  const pendingB=button(h,'Generate verified').props.onClick();h.fetches[1].resolve(result(b,'P002'));await pendingB;h.render();assert.match(text(h.tree),/Verified snapshot-B/);assert.doesNotMatch(text(h.tree),/Verified snapshot-A/);
  h.render({dashboard:dashboard('snapshot-C'),panelId:'portfolio',productKey:'P002'});assert.doesNotMatch(text(h.tree),/Verified snapshot-B/);
});
test('real panel disables absent-selection/model requests and rejects mismatched returned snapshot',async()=>{
  const d=dashboard(),h=harness('components/ai/VerifiedAnalysisPanel.tsx');h.render({dashboard:d,panelId:'portfolio',productKey:null});h.render();assert.equal(button(h,'Generate verified').props.disabled,true);assert.equal(button(h,'Run model-assisted').props.disabled,true);assert.equal(h.fetches.length,0);
  h.render({dashboard:d,panelId:'portfolio',productKey:'P001'});h.render();const pending=button(h,'Generate verified').props.onClick();h.fetches[0].resolve(result(dashboard('wrong')));await pending;h.render();assert.match(text(h.tree),/does not match the current source snapshot/);assert.doesNotMatch(text(h.tree),/Verified wrong/);
});
test('D07 retains originating page while changed filters request fresh data from that page',()=>{
  const calls=[],d=dashboard(),h=harness('screens/D07AiAnalysisWorkspace.tsx',{appContext:{lastDashboardContext:d},salesApi:{useSalesDashboard:(page,slicer)=>{calls.push({page,slicer});return {phase:'ok',data:d};}}});
  h.render({slicer:filters});h.render({slicer:{...filters,month:'202608',company:'COMPANY-2'}});
  assert.deepEqual(calls.map(c=>c.page),['D14','D14']);assert.equal(calls[1].slicer.month,'202608');assert.equal(calls[1].slicer.company,'COMPANY-2');
});

test('explicit cancel aborts request and suppresses a provider that returns after cancellation',async()=>{
 const d=dashboard(),h=harness('components/ai/VerifiedAnalysisPanel.tsx');h.render({dashboard:d,panelId:'portfolio',productKey:'P001'});h.render();
 const pending=button(h,'Generate verified').props.onClick();h.render();button(h,'Cancel').props.onClick();assert.equal(h.fetches[0].options.signal.aborted,true);
 h.fetches[0].resolve(result(d));await pending;h.render();assert.doesNotMatch(text(h.tree),/Verified snapshot-A/);assert.equal(h.navigations.length,0);
});
test('wrong model engine is rejected and error exposes explicit reload without navigation',async()=>{
 const d=dashboard();let reloads=0;const h=harness('components/ai/VerifiedAnalysisPanel.tsx',{appContext:{aiEnabled:true}});h.render({dashboard:d,panelId:'portfolio',productKey:'P001',onRefresh:()=>reloads++});h.render();
 nodes(h.tree).find(n=>n.type==='textarea').props.onChange({target:{value:'Explain this product'}});h.render();const pending=button(h,'Run model-assisted').props.onClick();
 h.fetches[0].resolve(result(d));await pending;h.render();assert.match(text(h.tree),/Unexpected model-analysis engine/);assert.doesNotMatch(text(h.tree),/Verified snapshot-A/);
 button(h,'Reload dashboard').props.onClick();assert.equal(reloads,1);assert.equal(h.navigations.length,0);
});
