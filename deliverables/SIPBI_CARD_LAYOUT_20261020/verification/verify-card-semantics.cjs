// Evaluate the real TSX page functions with hook/API substitutes, inspect authored options.
// This verifies chart semantics; it deliberately does not claim browser rendering.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const appRoot=fs.existsSync(path.join(__dirname,'app'))?path.join(__dirname,'app'):path.resolve(__dirname,'../preview/app');
const ts=require(path.join(appRoot,'frontend/node_modules/typescript'));
const base=path.join(appRoot,'frontend/src');
const live=JSON.parse(fs.readFileSync(path.join(__dirname,'live-data-final.json'),'utf8'));
const checks=[];
function renderer(name,data=structuredClone(live),phase='ok',context={}){
 let state=[],cursor=0; const calls=[];
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useMemo:f=>f(),useCallback:f=>f,useEffect:()=>{},useRef:init=>{const i=cursor++;if(!(i in state))state[i]={current:init};return state[i];},useState:init=>{const i=cursor++;if(!(i in state))state[i]=typeof init==='function'?init():init;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}];}};
 const cache={};
 function load(file){if(cache[file])return cache[file].exports;const mod={exports:{}};cache[file]=mod;
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const req=id=>{
  if(id==='react')return React;
  if(id.includes('/services/salesApi'))return{useSalesDashboard:()=>({phase,data,error:null,reload:()=>{}})};
  if(id.includes('/context/AppContext'))return{useApp:()=>({theme:'light',lang:'zh-TW',metadata:null,setLastDashboardContext:()=>{},navigate:(...a)=>calls.push(['navigate',...a]),openDrillDown:(...a)=>calls.push(['drill',...a]),...context})};
  if(id.endsWith('/common/Header'))return load(path.join(base,'components/common/Header.tsx'));
  if(id.includes('/components/')){const key=path.basename(id);return{[key]:key};}
  if(id.startsWith('.')){let f=path.resolve(path.dirname(file),id);f=fs.existsSync(f+'.ts')?f+'.ts':f+'.tsx';return load(f);}
  throw Error('Unexpected import '+id);
 };
 vm.runInNewContext(code,{require:req,module:mod,exports:mod.exports,console,URL,Intl},{filename:file});return mod.exports;}
 const exports=load(path.join(base,'screens',name+'.tsx')); const component=exports.default||exports[name];
 const filters={...live.filters,month:'202609'};
 function render(){cursor=0;return component({slicer:filters,onNavigate:(...a)=>calls.push(['portal',...a])});}
 return{render,calls,data,state,filters};
}
function nodes(x,out=[]){if(Array.isArray(x))x.forEach(v=>nodes(v,out));else if(x&&typeof x==='object'&&'type'in x){out.push(x);nodes(x.props?.children,out);}return out;}
const charts=t=>nodes(t).filter(n=>n.type==='EChartsContainer');
const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):String(n??'');
function button(t,re){const b=nodes(t).find(n=>n.type==='button'&&re.test(text(n)));assert.ok(b,'Missing button '+re);return b;}
const val=x=>typeof x==='object'&&x!==null&&!Array.isArray(x)?x.value:x;
const near=(a,b)=>assert.ok(Math.abs(a-b)<.000001,`${a} != ${b}`);
function test(name,fn){if(process.argv[2]&&!name.startsWith(process.argv[2]))return;fn();checks.push({name,pass:true});console.log('PASS',name);}

const pages=['D00DecisionHome','D01ExecutiveOverview','D02SalesMomentum','D04ProductMix','D06CustomerContribution','D08ProfitabilityQuality','D11CustomerConcentration','D13SalespersonPerformance','D14ProductPortfolio','D15RollingSales','D16GrowthDeclineContribution','D18ExceptionMonitor'];
const mainCharts=t=>charts(t).filter(c=>parseInt(c.props.height||'320')>100);
const series=c=>c.props.option.series||[];
const allSeries=t=>mainCharts(t).flatMap(series);
const vals=s=>s.data.map(val);
for(const name of pages)test(name+': real TSX renders guards, KPIs, charts and evidence',()=>{
 const t=renderer(name).render(); assert.ok(mainCharts(t).length>=1);
 assert.ok(nodes(t).some(n=>n.type==='AiInsightCard')); assert.ok(nodes(t).some(n=>n.type==='KpiCard'));
 for(const [phase,expected]of[['pending','LOADING'],['no_data','NO_DATA'],['error','ERROR']]){
  const r=renderer(name,structuredClone(live),phase); const tree=r.render();
  assert.equal(nodes(tree).find(n=>n.type==='StateGuard').props.state,expected);
 }
});
test('D00: independent operations overview mounts only after explicit enablement',()=>{
 const hasOverview=t=>nodes(t).some(n=>typeof n.type==='function'&&n.type.name==='OperationsOverview');
 assert.equal(hasOverview(renderer('D00DecisionHome').render()),false);
 assert.equal(hasOverview(renderer('D00DecisionHome',structuredClone(live),'ok',{operationsEnabled:true}).render()),true);
});

test('KPI: real monthly mini trends stop at focus, preserve nulls and have <=12 points',()=>{
 for(const name of ['D00DecisionHome','D01ExecutiveOverview','D02SalesMomentum']){
  const r=renderer(name);r.filters.month='202503';const t=r.render();
  const ks=nodes(t).filter(n=>n.type==='KpiCard'&&n.props.trendSeries);assert.ok(ks.length>0,name);
  for(const k of ks){const s=k.props.trendSeries;assert.ok(s.labels.length<=12);assert.equal(s.labels.at(-1),'202503');assert.equal(s.labels.length,s.values.length);}
 }
});
test('D01: sales and margin occupy separate aligned panels with independent color-matched axes',()=>{
 const t=renderer('D01ExecutiveOverview').render();
 const monthly=mainCharts(t).filter(c=>c.props.option.xAxis?.data?.length===live.datasets.monthly.length);
 const sales=monthly.find(c=>series(c).some(s=>s.type==='bar'));
 const margin=monthly.find(c=>series(c).some(s=>s.type==='line'));assert.ok(sales);assert.ok(margin);assert.notEqual(sales,margin);
 assert.equal(series(sales).length,1);assert.equal(series(margin).length,1);
 assert.deepEqual(Array.from(sales.props.option.xAxis.data),Array.from(margin.props.option.xAxis.data));
 const bar=series(sales)[0],line=series(margin)[0];assert.equal(line.connectNulls,false);
 near(val(bar.data.at(-1)),live.datasets.monthly.at(-1).netSalesUSD);near(val(line.data.at(-1)),live.datasets.monthly.at(-1).grossMarginPercent*100);
 assert.equal([sales.props.option.yAxis].flat()[0].axisLabel.color,bar.itemStyle.color);assert.equal([margin.props.option.yAxis].flat()[0].axisLabel.color,line.lineStyle.color);
});
test('D04: flat category treemap reconciles selected revenue without invented hierarchy',()=>{
 const t=renderer('D04ProductMix').render();const treemap=allSeries(t).find(s=>s.type==='treemap');assert.ok(treemap);
 assert.equal(treemap.data.length,live.datasets.categories.length);assert.ok(treemap.data.every(r=>!r.children));
 near(treemap.data.reduce((sum,r)=>sum+val(r),0),live.kpis.netSalesUSD);
 assert.ok(!allSeries(t).some(s=>s.type==='pie'&&s.data.length>5));
 for(const invalid of [null,-5,0]){const d=structuredClone(live);if(invalid===0)d.datasets.categories.forEach(r=>r.netSalesUSD=0);else d.datasets.categories[0].netSalesUSD=invalid;const tree=renderer('D04ProductMix',d).render();assert.ok(!allSeries(tree).some(s=>s.type==='treemap'||s.type==='pie'));}
});
for(const [name,group,field]of[['D06CustomerContribution','customers','customer'],['D13SalespersonPerformance','salespeople','salesperson']])test(name+': complete eligible scatter population, explicit stable-key drill and no fabricated regression',()=>{
 const r=renderer(name),t=r.render();const c=mainCharts(t).find(c=>series(c).some(s=>s.type==='scatter'&&s.data.length>15));assert.ok(c);
 const s=series(c).find(s=>s.type==='scatter');const rows=live.datasets[group].filter(r=>r.netSalesUSD!==null&&r.grossMarginPercent!==null&&(field!=='customer'||r.netQtyKG>0));assert.equal(s.data.length,rows.length);
 near(val(s.data[0])[0],rows[0].netSalesUSD);near(val(s.data[0])[1],rows[0].grossMarginPercent*100);
 c.props.onEvents.click({dataIndex:0,componentType:'series',data:s.data[0]});assert.equal(r.calls.length,0);
 button(r.render(),field==='customer'?/下鑽該客戶產品|Drill into products/:/下鑽該業務員客戶|Drill into customers/).props.onClick();
 assert.equal(r.calls.at(-1)[1].filterOverrides[field],rows[0].key);
 assert.ok(!allSeries(t).some(s=>s.type==='line'&&s.name?.match(/regression/i)));
});
test('D08: cost plus gross profit is the sales composition, orders never occupy a percentage axis',()=>{
 const t=renderer('D08ProfitabilityQuality').render();const c=mainCharts(t).find(c=>series(c).filter(s=>s.type==='bar').length===2);assert.ok(c);
 const a=series(c)[0],b=series(c)[1];for(let i=0;i<a.data.length;i++)near(val(a.data[i])+val(b.data[i]),live.datasets.monthly[i].netSalesUSD);
 assert.ok(!allSeries(t).some(s=>/負毛利行|Negative.margin.lines/i.test(s.name)&&s.yAxisIndex===1));
});
test('D11: full population denominator, All mode and signed fallback remain correct',()=>{
 const r=renderer('D11CustomerConcentration');let t=r.render();let c=mainCharts(t)[0],bar=series(c).find(s=>s.type==='bar'),line=series(c).find(s=>s.type==='line');
 assert.equal(bar.data.length,20);const sorted=[...live.datasets.customers].sort((a,b)=>b.netSalesUSD-a.netSalesUSD||a.key.localeCompare(b.key));
 near(val(line.data.at(-1))/100,sorted.slice(0,20).reduce((s,r)=>s+r.netSalesUSD,0)/sorted.reduce((s,r)=>s+r.netSalesUSD,0));
 button(t,/全部客戶|All customers|全體客戶|全體|全部/).props.onClick();t=r.render();c=mainCharts(t)[0];assert.equal(series(c).find(s=>s.type==='bar').data.length,sorted.length);near(val(series(c).find(s=>s.type==='line').data.at(-1)),100);
 const d=structuredClone(live);d.datasets.customers[0].netSalesUSD=-5;d.analysis.concentrationStatus='invalid_population';assert.ok(!allSeries(renderer('D11CustomerConcentration',d).render()).some(s=>s.type==='line'&&s.data.some(v=>val(v)!=null)));
});
test('D14: exact statistical reference, all valid products, no quartered market claims',()=>{
 const t=renderer('D14ProductPortfolio').render(),ss=allSeries(t).filter(s=>s.type==='scatter');assert.equal(ss.reduce((n,s)=>n+s.data.length,0),live.datasets.products.filter(r=>r.netSalesUSD!==null&&r.grossMarginPercent!==null).length);
 const refs=ss.filter(s=>s.markLine).flatMap(s=>s.markLine.data);assert.equal(refs.length,2);near(refs.find(r=>'xAxis'in r).xAxis,live.analysis.portfolio.revenueMedian);near(refs.find(r=>'yAxis'in r).yAxis,live.analysis.portfolio.weightedMargin*100);
});
test('D15: one main workspace, strict R3/R12 and independent annual YTD traces',()=>{
 const r=renderer('D15RollingSales');let t=r.render();assert.equal(mainCharts(t).length,1);
 for(const [re,n]of[[/近 3 月|R3M/,3],[/近 12 月|R12M/,12]]){button(t,re).props.onClick();t=r.render();const s=series(mainCharts(t)[0])[0];assert.equal(s.type,'line');assert.equal(s.connectNulls,false);assert.ok(s.data.slice(0,n-1).every(v=>v==null));near(val(s.data[n-1]),live.datasets.monthly.slice(0,n).reduce((sum,x)=>sum+x.netSalesUSD,0));}
 button(t,/年累計|YTD/).props.onClick();t=r.render();for(const s of series(mainCharts(t)[0])){const years=new Set(s.data.map((v,i)=>val(v)==null?null:live.datasets.monthly[i].key.slice(0,4)).filter(Boolean));assert.ok(years.size<=1);assert.equal(s.connectNulls,false);}
});
test('D16: top contributions + Other reconcile, and connectors join actual running totals',()=>{
 const r=renderer('D16GrowthDeclineContribution'),c=mainCharts(r.render())[0],ss=series(c);const base=ss.find(s=>s.name==='base'),bars=ss.find(s=>s.name==='USD'),connectors=ss.find(s=>s.type==='custom');assert.ok(connectors);assert.equal(bars.data.length,15);assert.equal(connectors.data.length,bars.data.length-1);
 const steps=requireSteps(live);for(let i=0;i<steps.length;i++){near(base.data[i],Math.min(steps[i].from,steps[i].to));near(val(bars.data[i]),Math.abs(steps[i].to-steps[i].from));if(i<steps.length-1)near(connectors.data[i][1],steps[i].to);}
 near(steps.at(-2).to,live.kpis.netSalesUSD);
 function requireSteps(d){const ws=d.analysis.waterfall;const picked=[...ws].sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)||a.key.localeCompare(b.key));let running=d.analysis.priorYearNetSalesUSD;const out=[{from:0,to:running}];for(const row of picked.slice(0,12)){out.push({from:running,to:running+row.delta});running+=row.delta;}if(picked.length>12){const delta=picked.slice(12).reduce((sum,r)=>sum+r.delta,0);out.push({from:running,to:running+delta});}out.push({from:0,to:d.kpis.netSalesUSD});return out;}
});
test('D18: 12x4 independent cells use actual counts, not summed severity',()=>{
 const t=renderer('D18ExceptionMonitor').render(),c=mainCharts(t)[0],s=series(c)[0];assert.equal(s.type,'heatmap');assert.equal(s.data.length,48);
 const sorted=[...live.datasets.products].sort((a,b)=>(b.negativeMarginLineCount??-1)-(a.negativeMarginLineCount??-1)||a.key.localeCompare(b.key)).slice(0,12);
 assert.deepEqual(Array.from(c.props.option.yAxis.data),sorted.map(r=>r.key));const fields=['negativeMarginLineCount','fullReturnLineCount','partialReturnLineCount','allowanceLineCount'];
 for(const item of s.data){const [x,y,v]=item.value;assert.equal(v,sorted[y][fields[x]]??'-');}
});
test('D02: same-month prior-year alignment and first-year gaps are exact',()=>{
 const ss=allSeries(renderer('D02SalesMomentum').render());const lines=ss.filter(s=>s.type==='line');assert.equal(lines.length,2);const prior=lines[1];assert.ok(prior.data.slice(0,12).every(v=>val(v)==null));near(val(prior.data[12]),live.datasets.monthly[0].netSalesUSD);
 const bars=ss.find(s=>s.type==='bar');assert.ok(bars.data.slice(0,12).every(v=>val(v)==null));near(val(bars.data.at(-1)),live.analysis.yoyGrowth*100);
});
test('D04: optional donut uses Top4 plus exact Other, and keeps the entire population denominator',()=>{
 const r=renderer('D04ProductMix');let t=r.render();button(t,/Top4|Donut/).props.onClick();t=r.render();const s=allSeries(t).find(s=>s.type==='pie');assert.ok(s);assert.equal(s.data.length,5);
 near(s.data.reduce((sum,r)=>sum+val(r),0),live.kpis.netSalesUSD);const sorted=[...live.datasets.categories].sort((a,b)=>b.netSalesUSD-a.netSalesUSD||a.key.localeCompare(b.key));near(val(s.data.at(-1)),sorted.slice(4).reduce((sum,r)=>sum+r.netSalesUSD,0));assert.equal(s.data.at(-1).itemStyle.color,'#94a3b8');
});
test('Negative and null edge cases: signed axes stay visible, no partial composition, no future mini trends',()=>{
 for(const name of ['D00DecisionHome','D01ExecutiveOverview','D02SalesMomentum','D04ProductMix']){
  const r=renderer(name);r.filters.month='203001';const t=r.render();assert.ok(!nodes(t).filter(n=>n.type==='KpiCard').some(n=>n.props.trendSeries?.labels.some(k=>k>'203001')));
  for(const c of mainCharts(t))for(const axis of [c.props.option.xAxis,c.props.option.yAxis].flat().filter(Boolean))if(axis.type==='value'&&axis.min!==undefined)assert.ok(typeof axis.min==='function'||axis.min<0,name+' clipped a negative axis');
 }
 const d=structuredClone(live);d.datasets.monthly[0].netCostUSD=null;const ss=allSeries(renderer('D08ProfitabilityQuality',d).render()).filter(s=>s.stack==='net');assert.ok(ss.every(s=>s.data[0]===null));assert.ok(ss.every(s=>s.stackStrategy==='all'));
});
fs.writeFileSync(path.join(__dirname,'card-semantics.json'),JSON.stringify({testedAt:new Date().toISOString(),scope:'actual TSX function options and callbacks with substituted hooks; browser verification is separate',checks},null,2));
