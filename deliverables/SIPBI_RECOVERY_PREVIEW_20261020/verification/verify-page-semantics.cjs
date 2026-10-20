// Evaluate the real TSX page functions with hook/API substitutes, inspect authored options.
// This verifies chart semantics; it deliberately does not claim browser rendering.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const appRoot=fs.existsSync(path.join(__dirname,'app'))?path.join(__dirname,'app'):path.resolve(__dirname,'../preview/app');
const ts=require(path.join(appRoot,'frontend/node_modules/typescript'));
const base=path.join(appRoot,'frontend/src');
const live=JSON.parse(fs.readFileSync(path.join(__dirname,'live-data-final.json'),'utf8'));
const checks=[];
function renderer(name,data=structuredClone(live)){
 let state=[],cursor=0; const calls=[];
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useMemo:f=>f(),useCallback:f=>f,useEffect:()=>{},useRef:init=>{const i=cursor++;if(!(i in state))state[i]={current:init};return state[i];},useState:init=>{const i=cursor++;if(!(i in state))state[i]=typeof init==='function'?init():init;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}];}};
 const cache={};
 function load(file){if(cache[file])return cache[file].exports;const mod={exports:{}};cache[file]=mod;
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const req=id=>{
  if(id==='react')return React;
  if(id.includes('/services/salesApi'))return{useSalesDashboard:()=>({phase:'ready',data,error:null,reload:()=>{}})};
  if(id.includes('/context/AppContext'))return{useApp:()=>({theme:'light',lang:'zh-TW',metadata:null,setLastDashboardContext:()=>{},navigate:(...a)=>calls.push(['navigate',...a]),openDrillDown:(...a)=>calls.push(['drill',...a])})};
  if(id.includes('/components/')){const key=path.basename(id);return{[key]:key};}
  if(id.startsWith('.')){let f=path.resolve(path.dirname(file),id);f=fs.existsSync(f+'.ts')?f+'.ts':f+'.tsx';return load(f);}
  throw Error('Unexpected import '+id);
 };
 vm.runInNewContext(code,{require:req,module:mod,exports:mod.exports,console,URL,Intl},{filename:file});return mod.exports;}
 const component=load(path.join(base,'screens',name+'.tsx')).default;
 const filters={...live.filters,month:'202609'};
 function render(){cursor=0;return component({slicer:filters});}
 return{render,calls,data,state,filters};
}
function nodes(x,out=[]){if(Array.isArray(x))x.forEach(v=>nodes(v,out));else if(x&&typeof x==='object'&&'type'in x){out.push(x);nodes(x.props?.children,out);}return out;}
const charts=t=>nodes(t).filter(n=>n.type==='EChartsContainer');
const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):String(n??'');
function button(t,re){const b=nodes(t).find(n=>n.type==='button'&&re.test(text(n)));assert.ok(b,'Missing button '+re);return b;}
const val=x=>typeof x==='object'&&x!==null?x.value:x;
const near=(a,b)=>assert.ok(Math.abs(a-b)<.000001,`${a} != ${b}`);
function test(name,fn){if(process.argv[2]&&!name.startsWith(process.argv[2]))return;fn();checks.push({name,pass:true});console.log('PASS',name);}
test('D04: category composition reconciles selected net sales',()=>{const t=renderer('D04ProductMix').render();const p=charts(t).flatMap(c=>c.props.option.series||[]).find(s=>s.type==='pie');assert.ok(p);near(p.data.reduce((s,r)=>s+val(r),0),live.kpis.netSalesUSD);assert.equal(p.data.length,live.datasets.categories.length);});
test('D04: stable category colors and correctly separated product USD / GM axes',()=>{
 const original=charts(renderer('D04ProductMix').render())[0].props.option.series[0].data;
 const d=structuredClone(live);d.datasets.categories.reverse();d.datasets.products.reverse();const r=renderer('D04ProductMix',d),cs=charts(r.render());
 for(const p of cs[0].props.option.series[0].data)assert.equal(p.itemStyle.color,original.find(v=>v.name===p.name).itemStyle.color);
 const c=cs[1];const sorted=[...d.datasets.products].sort((a,b)=>b.netSalesUSD-a.netSalesUSD||a.key.localeCompare(b.key));
 const bar=c.props.option.series.find(s=>s.type==='bar'),gm=c.props.option.series.find(s=>s.type==='scatter');assert.equal(bar.xAxisIndex,0);assert.equal(gm.xAxisIndex,1);near(val(bar.data[0]),sorted[0].netSalesUSD);near(gm.data[0][0],sorted[0].grossMarginPercent);assert.equal(bar.data.length,12);
 c.props.onEvents.click({dataIndex:0,componentType:'series'});assert.ok(JSON.stringify(r.calls).includes(sorted[0].key));
});
for(const invalid of [-10,null,0])test('D04: invalid composition '+invalid+' does not silently become a donut',()=>{const d=structuredClone(live);if(invalid===0)d.datasets.categories.forEach(r=>r.netSalesUSD=0);else d.datasets.categories[0].netSalesUSD=invalid;const t=renderer('D04ProductMix',d).render();assert.ok(!charts(t).some(c=>(c.props.option.series||[]).some(s=>s.type==='pie')));});
test('D11: Top20 Pareto denominator is all selected customers; signed populations disable curve',()=>{
 const d=structuredClone(live);d.datasets.customers.reverse();const r=renderer('D11CustomerConcentration',d);let t=r.render();let c=charts(t)[0];assert.equal(charts(t).length,1);
 const sorted=[...d.datasets.customers].sort((a,b)=>b.netSalesUSD-a.netSalesUSD||a.key.localeCompare(b.key));const total=sorted.reduce((s,r)=>s+r.netSalesUSD,0);
 let bar=c.props.option.series.find(s=>s.type==='bar'),line=c.props.option.series.find(s=>s.type==='line');assert.equal(bar.data.length,20);near(val(bar.data[0]),sorted[0].netSalesUSD);const endpoint=val(line.data.at(-1));near(endpoint>1?endpoint/100:endpoint,sorted.slice(0,20).reduce((s,r)=>s+r.netSalesUSD,0)/total);assert.ok(endpoint<100&&endpoint!==1);
 c.props.onEvents.click({dataIndex:0,componentType:'series',seriesType:'bar'});assert.ok(JSON.stringify(r.calls).includes(sorted[0].key));
 button(t,/全部客戶|All customers|全體客戶|全體|全部/).props.onClick();t=r.render();c=charts(t)[0];bar=c.props.option.series.find(s=>s.type==='bar');line=c.props.option.series.find(s=>s.type==='line');assert.equal(bar.data.length,sorted.length);assert.equal(c.props.option.dataZoom[0].end,100);const end=val(line.data.at(-1));near(end>1?end/100:end,1);
 d.datasets.customers[0].netSalesUSD=-10;d.analysis.concentrationStatus='invalid_population';t=renderer('D11CustomerConcentration',d).render();assert.ok(!charts(t)[0].props.option.series.some(s=>s.type==='line'&&s.data?.some(v=>val(v)!=null)));assert.ok(charts(t)[0].props.option.series.find(s=>s.type==='bar').data.some(v=>val(v)===-10)||/前\s*20/.test(text(t)));
});
test('D15: one workspace, full timeline, strict rolling sums and no cross-year YTD connections',()=>{
 const r=renderer('D15RollingSales');let t=r.render();assert.equal(charts(t).length,1);let c=charts(t)[0];assert.equal(c.props.option.series[0].type,'bar');assert.equal(c.props.option.series[0].data.length,33);
 for(const [re,n]of[[/近 3 月|R3M/,3],[/近 12 月|R12M/,12]]){button(t,re).props.onClick();t=r.render();c=charts(t)[0];const s=c.props.option.series[0];assert.equal(s.type,'line');assert.equal(s.connectNulls,false);assert.ok(s.data.slice(0,n-1).every(v=>v==null));near(val(s.data[n-1]),live.datasets.monthly.slice(0,n).reduce((sum,x)=>sum+x.netSalesUSD,0));}
 button(t,/年累計|YTD/).props.onClick();t=r.render();c=charts(t)[0];for(const s of c.props.option.series){const ys=new Set(s.data.map((v,i)=>val(v)==null?null:live.datasets.monthly[i].key.slice(0,4)).filter(Boolean));assert.ok(ys.size<=1);assert.equal(s.connectNulls,false);}
 assert.ok(c.props.option.series.some(s=>s.markPoint?.data?.some(p=>p.coord[0]==='202609')));
 c.props.onEvents.click({dataIndex:32,componentType:'series'});assert.ok(JSON.stringify(r.calls).includes('202609'));
});
fs.writeFileSync(path.join(__dirname,'page-semantics.json'),JSON.stringify({testedAt:new Date().toISOString(),scope:'actual TSX functions with hook substitutes; not browser proof',checks},null,2));
