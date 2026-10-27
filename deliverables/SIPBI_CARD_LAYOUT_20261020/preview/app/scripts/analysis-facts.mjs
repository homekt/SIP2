import {createHash} from 'node:crypto';

const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])) : value;
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const fail = (code,message,statusCode=422) => {const error=new Error(message);error.code=code;error.statusCode=statusCode;throw error;};
const own = (object,key) => Object.prototype.hasOwnProperty.call(object,key);
const panels = {D14:['portfolio','overview'],D08:['profit','overview'],D16:['growth','overview'],D01:['overview'],D00:['overview'],D02:['overview'],D04:['overview'],D06:['overview'],D11:['overview'],D13:['overview'],D15:['overview'],D18:['overview'],D07:['overview']};

export function stampDashboardSnapshot(dashboard) {
 const identity={pageId:dashboard.pageId,filters:dashboard.filters,source:dashboard.source && Object.fromEntries(Object.entries(dashboard.source).filter(([key])=>key!=='queriedAt')),kpis:dashboard.kpis,datasets:dashboard.datasets,analysis:dashboard.analysis,queryHash:dashboard.evidence?.queryHash,grain:dashboard.evidence?.grain,measures:dashboard.evidence?.measures};
 return {...dashboard,evidence:{...dashboard.evidence,snapshotId:hash(identity)}};
}

export function buildFactEnvelope(dashboard, request={}) {
 if (!dashboard || dashboard.status!=='ok') fail('no_analysis_data','No current source data is available.');
 if (dashboard.source?.currency!=='USD' || dashboard.source?.dateRole!=='Invoice Date' || dashboard.source?.cube!=='JDE Sales') fail('unsupported_analysis_source','This analysis supports the JDE Sales USD / Invoice Date source only.');
 const pageId=dashboard.pageId, panelId=request.panelId || 'overview', productKey=request.productKey || null;
 if (!panels[pageId]?.includes(panelId)) fail('unsupported_analysis_panel','This panel is not registered for the current page.',400);
 if (productKey!==null && (typeof productKey!=='string'||productKey.length>160||/[\x00-\x1f]/.test(productKey))) fail('invalid_analysis_selection','Invalid product selection.',400);
 if (['portfolio','profit'].includes(panelId) && !productKey) fail('selection_required','Select a product before requesting this explanation.',400);
 const source=stampDashboardSnapshot(dashboard), zh=request.locale!=='en';
 if (!source.evidence?.requestId || !source.evidence?.queryHash || !source.filters) fail('missing_analysis_evidence','Current query evidence is required.');
 const selected=productKey ? source.datasets?.products?.find(row=>row.key===productKey) : null;
 if (productKey && !selected && !(panelId==='growth' && source.analysis?.waterfall?.some(row=>row.key===productKey))) fail('selection_outside_population','The selected product is absent from the current query population.',400);
 const context={pageId,panelId,productKey,filters:{...source.filters},source:{...source.source},requestId:source.evidence.requestId,queryHash:source.evidence.queryHash,snapshotId:source.evidence.snapshotId,queriedAt:source.evidence.queriedAt,grain:source.evidence.grain,measures:source.evidence.measures || [],notes:source.evidence.notes || [],locale:zh?'zh-TW':'en'};
 const facts=[],interpretations=[],actions=[];
 const add=(id,metric,value,unit,labelZh,labelEn,entityKey=null) => {const fact={id,metric,value:finite(value),unit,label:zh?labelZh:labelEn,entityKey,evidenceRef:context.requestId};facts.push(fact);return id;};
 const interpret=(id,condition,factIds,textZh,textEn) => {if(condition) interpretations.push({id,factIds,text:zh?textZh:textEn});};
 const action=(id,tab,product,labelZh,labelEn,kind='navigate') => actions.push({id,kind,tab,groupBy:kind==='drill'?'customer':undefined,filters:{...source.filters,...(product?{product}: {})},label:zh?labelZh:labelEn});
 const totalSales=add('scope-sales','netSalesUSD',source.kpis?.netSalesUSD,'USD','目前範圍淨銷售額','Scope net sales');
 add('scope-profit','grossProfitUSD',source.kpis?.grossProfitUSD,'USD','目前範圍毛利額','Scope gross profit');
 add('scope-margin','grossMarginPercent',source.kpis?.grossMarginPercent,'ratio','目前範圍加權毛利率','Scope weighted margin');
 add('scope-quantity','netQtyKG',source.kpis?.netQtyKG,'KG','目前範圍淨銷量','Scope net quantity');
 if (selected) {
  const prefix=zh?`產品 ${selected.key}（${selected.label}）`:`Product ${selected.key} (${selected.label})`;
  for(const [metric,unit,z,en] of [['netSalesUSD','USD','淨銷售額','net sales'],['grossProfitUSD','USD','毛利額','gross profit'],['grossMarginPercent','ratio','毛利率','margin'],['netQtyKG','KG','淨銷量','net quantity']]) add(`selected-${metric}`,metric,selected[metric],unit,`${prefix} ${z}`,`${prefix} ${en}`,selected.key);
  const median=finite(source.analysis?.portfolio?.revenueMedian),weighted=finite(source.analysis?.portfolio?.weightedMargin),margin=finite(selected.grossMarginPercent),sales=finite(selected.netSalesUSD);
  add('scope-revenue-median','revenueMedian',median,'USD','目前產品母體營收中位數','Product-population revenue median');
  add('scope-weighted-margin','weightedMargin',weighted,'ratio','目前範圍加權毛利率基準','Scope weighted-margin reference');
  interpret('margin-below-reference',margin!==null&&weighted!==null&&margin<weighted,['selected-grossMarginPercent','scope-weighted-margin'],'此產品毛利率低於目前範圍的加權毛利率；這是相對比較，並非已核准的風險門檻。','Product margin is below this scope’s weighted margin; this is a relative comparison, not an adopted risk threshold.');
  interpret('margin-at-or-above-reference',margin!==null&&weighted!==null&&margin>=weighted,['selected-grossMarginPercent','scope-weighted-margin'],'此產品毛利率達到或高於目前範圍的加權毛利率。','Product margin is at or above the scope’s weighted margin.');
  interpret('revenue-at-or-above-median',sales!==null&&median!==null&&sales>=median,['selected-netSalesUSD','scope-revenue-median'],'此產品營收達到或高於目前產品母體的中位數。','Product revenue is at or above the current product-population median.');
  action('compare-product-yoy','D16',selected.key,'比較此產品去年同期','Compare product with prior year');
  action('inspect-product-customers',pageId,selected.key,'查看此產品客戶','Inspect product customers','drill');
  action('inspect-product-returns','D18',selected.key,'查看此產品退貨與負毛利觀察','Inspect returns and negative-margin observations');
 }
 if (panelId==='growth') {
  const rows=source.analysis?.waterfall || [],prior=finite(source.analysis?.priorYearNetSalesUSD),current=finite(source.kpis?.netSalesUSD);
  if (!rows.length || prior===null || current===null) fail('insufficient_analysis_history','A complete same-month prior-year comparison is required.');
  const ids=new Set();
  for(const row of rows) {
   if(typeof row.key!=='string'||ids.has(row.key)||[row.prior,row.current,row.delta].some(x=>finite(x)===null)||Math.abs(row.current-row.prior-row.delta)>.011) fail('invalid_contribution_population','Product contributions do not form a valid complete comparison.');
   ids.add(row.key);
  }
  const priorSum=rows.reduce((s,r)=>s+r.prior,0),currentSum=rows.reduce((s,r)=>s+r.current,0),delta=rows.reduce((s,r)=>s+r.delta,0);
  if(Math.abs(priorSum-prior)>.011 || Math.abs(currentSum-current)>.011 || Math.abs(current-prior-delta)>.011) fail('contribution_not_reconciled','The full contribution population does not reconcile.');
  add('prior-sales','priorYearNetSalesUSD',prior,'USD','去年同月淨銷售額','Prior-year same-month net sales');
  add('total-delta','delta',delta,'USD','完整產品母體同期差額','Complete-population YoY delta');
  const ranked=[...rows].sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)||a.key.localeCompare(b.key));
  const shown=ranked.slice(0,8);
  if(productKey && !shown.some(row=>row.key===productKey)) shown.push(rows.find(row=>row.key===productKey));
  for(const row of shown) {
   const id='driver-'+hash(row.key).slice(0,16),prefix=zh?`產品 ${row.key}`:`Product ${row.key}`;
   add(`${id}-prior`,'prior',row.prior,'USD',`${prefix} 去年同月`,`${prefix} prior year`,row.key);
   add(`${id}-current`,'current',row.current,'USD',`${prefix} 當期`,`${prefix} current`,row.key);
   add(`${id}-delta`,'delta',row.delta,'USD',`${prefix} 同期差額`,`${prefix} YoY delta`,row.key);
   action(`${id}-inspect`,'D14',row.key,`查看產品 ${row.key} 的獲利與銷量`,`Inspect product ${row.key} profitability and quantity`);
  }
  interpret(delta>0?'growth-positive':delta<0?'growth-negative':'growth-flat',true,[totalSales,'prior-sales','total-delta'],delta>0?'當期營收高於去年同月；產品差額是算術貢獻，不代表商業成因。':delta<0?'當期營收低於去年同月；產品差額是算術貢獻，不代表商業成因。':'當期與去年同月營收相同；仍可查看互相抵銷的產品差額。',delta>0?'Current sales exceed the prior-year month; product deltas are arithmetic contributions, not causes.':delta<0?'Current sales are below the prior-year month; product deltas are arithmetic contributions, not causes.':'Current and prior-year sales are equal; offsetting product changes may remain.');
 }
 if(!selected && panelId!=='growth') {
  action('review-growth','D16',null,'查看同期成長貢獻','Review YoY growth contributions');
  action('review-portfolio','D14',null,'查看產品獲利與銷量','Review product profitability and quantity');
 }
 if(!facts.some(f=>f.value!==null)) fail('no_analysis_facts','No finite measured facts are available.');
 return {version:'fact-envelope-v1',context,facts,interpretations,actions,limitations:zh?['合成示範資料；此解讀不證明真實營運效益。','差異、位置與貢獻不是因果證據，不直接形成漲價、淘汰或信用風險決策。','只解讀目前範圍；變更期間或公司請使用篩選及下方明確動作。']:['Synthetic demonstration data; this does not establish real operating value.','Differences and contributions are not causal evidence or a pricing, retirement or credit decision.','This explanation uses the current scope; change periods or entities through filters and explicit actions.']};
}

export function validateSelection(envelope, selection) {
 if(!selection || typeof selection!=='object'||Array.isArray(selection)||Object.keys(selection).some(key=>!['factIds','interpretationIds','actionIds'].includes(key))) return {ok:false};
 for(const [key,allowed,max] of [['factIds',envelope.facts.filter(f=>f.value!==null).map(f=>f.id),8],['interpretationIds',envelope.interpretations.map(i=>i.id),3],['actionIds',envelope.actions.map(a=>a.id),3]]) {
  if(!own(selection,key)||!Array.isArray(selection[key])||selection[key].length>max||new Set(selection[key]).size!==selection[key].length||selection[key].some(id=>typeof id!=='string'||!allowed.includes(id)))return {ok:false};
 }
 return {ok:selection.factIds.length>0};
}
export function defaultSelection(envelope) {
 const available=envelope.facts.filter(f=>f.value!==null), selected=available.filter(f=>f.entityKey===envelope.context.productKey&&envelope.context.productKey), drivers=available.filter(f=>f.entityKey&&f.metric==='delta');
 const ordered=selected.length?[...selected,...available.filter(f=>f.id.startsWith('scope-')&&!selected.includes(f))]:envelope.context.panelId==='growth'?[...available.filter(f=>['scope-sales','prior-sales','total-delta'].includes(f.id)),...drivers]:available;
 return {factIds:ordered.slice(0,8).map(f=>f.id),interpretationIds:envelope.interpretations.slice(0,3).map(i=>i.id),actionIds:envelope.actions.slice(0,3).map(a=>a.id)};
}
export function renderSelection(envelope,selection) {
 if(!validateSelection(envelope,selection).ok) fail('unverified_model_output','The model selected unsupported facts, interpretations or actions.',502);
 const zh=envelope.context.locale!=='en',fmt=f=>f.unit==='ratio'?`${(f.value*100).toLocaleString(zh?'zh-TW':'en-US',{maximumFractionDigits:2})}%`:`${f.value.toLocaleString(zh?'zh-TW':'en-US',{maximumFractionDigits:2})} ${f.unit}`;
 const claims=selection.factIds.map(id=>{const f=envelope.facts.find(f=>f.id===id);return {id,text:`${f.label}：${fmt(f)}`,factIds:[id],evidenceRef:f.evidenceRef,kind:'observation'};});
 for(const id of selection.interpretationIds) {const item=envelope.interpretations.find(i=>i.id===id);claims.push({id,text:item.text,factIds:item.factIds,evidenceRef:envelope.context.requestId,kind:'arithmetic'});}
 return {claims,facts:envelope.facts,usedContext:envelope.context,nextActions:selection.actionIds.map(id=>envelope.actions.find(a=>a.id===id)),limitations:envelope.limitations,observations:claims.filter(c=>c.kind==='observation').map(c=>c.text),arithmeticContributions:claims.filter(c=>c.kind==='arithmetic').map(c=>c.text),hypotheses:[],evidence:[`${envelope.context.requestId} / ${envelope.context.queryHash} / ${envelope.context.snapshotId}`]};
}
