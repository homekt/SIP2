import React,{useEffect,useRef,useState} from 'react';
import type {DashboardResponse} from '../../types/sales';
import {useApp} from '../../context/AppContext';
import {analysisContextKey,makeAnalysisContext,validateAnalysisResponse} from './analysisContext';
import type {AnalysisResponse,AnalysisAction} from './analysisContext';

interface Props {dashboard:DashboardResponse|null;panelId?:'overview'|'portfolio'|'profit'|'growth';productKey?:string|null;onRefresh?:()=>void}
type State={key:string;phase:'idle'|'pending'|'ok'|'error';response?:AnalysisResponse;error?:string;question?:string};
const button='rounded-lg border border-indigo-200 dark:border-indigo-700 px-3 py-2 text-xs font-semibold text-indigo-700 dark:text-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer';

export function VerifiedAnalysisPanel({dashboard,panelId='overview',productKey=null,onRefresh}:Props) {
  const {lang,aiEnabled,navigate,openDrillDown}=useApp();const zh=lang==='zh-TW';
  const context=makeAnalysisContext(dashboard,panelId,productKey,lang),key=analysisContextKey(context);
  const needsSelection=(panelId==='portfolio'||panelId==='profit')&&!productKey;
  const [question,setQuestion]=useState(''),[state,setState]=useState<State>({key:'',phase:'idle'});
  const seq=useRef(0),abort=useRef<AbortController|null>(null),keyRef=useRef(key);keyRef.current=key;
  const current=state.key===key?state:null,pending=current?.phase==='pending';
  useEffect(()=>{seq.current++;abort.current?.abort();setState({key,phase:'idle'});return()=>{seq.current++;abort.current?.abort();};},[key]);
  const cancel=()=>{seq.current++;abort.current?.abort();setState({key,phase:'idle'});};
  const run=async(mode:'brief'|'model')=>{
    if(!context||!dashboard||needsSelection||pending||(mode==='model'&&(!aiEnabled||!question.trim())))return;
    const requestContext=context,requestDashboard=dashboard,requestKey=key,sequence=++seq.current;
    abort.current?.abort();const controller=new AbortController();abort.current=controller;
    const submittedQuestion=mode==='brief'?(zh?'依目前範圍及所選視圖，列出可核對的事實、相對比較與後續分析入口。':'Explain verifiable facts, relative comparisons and next analytical actions for the current view.'):question.trim();
    setState({key:requestKey,phase:'pending'});
    try {
      const response=await fetch(mode==='brief'?'/api/analysis/brief':'/api/analysis',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({question:submittedQuestion,context:requestContext}),signal:controller.signal});
      const body=await response.json();
      if(controller.signal.aborted||sequence!==seq.current||keyRef.current!==requestKey)return;
      if(!response.ok||body?.status!=='ok')throw new Error(body?.error?.code==='ai_disabled'?(zh?'模型尚未啟用；可使用可核對的資料解讀。':'The model is not enabled; verified data explanation remains available.'):body?.error?.message||(zh?'解讀請求失敗，請重試。':'Explanation request failed. Please retry.'));
      const verified=validateAnalysisResponse(body,requestContext,requestDashboard);
      if(mode==='brief'&&verified.engine!=='deterministic')throw new Error(zh?'資料解讀的引擎標記不符。':'Unexpected verified-brief engine.');
      if(mode==='model'&&verified.engine!=='model-selected')throw new Error(zh?'模型解讀的引擎標記不符。':'Unexpected model-analysis engine.');
      setState({key:requestKey,phase:'ok',response:verified,question:mode==='model'?submittedQuestion:undefined});
    }catch(error){if(controller.signal.aborted||sequence!==seq.current||keyRef.current!==requestKey)return;setState({key:requestKey,phase:'error',error:error instanceof Error?error.message:(zh?'解讀失敗':'Explanation failed')});}
  };
  const act=(action:AnalysisAction)=>{
    if(!current?.response||current.phase!=='ok'||keyRef.current!==key)return;
    if(action.kind==='navigate')navigate(action.tab,action.filters,action.label);
    else openDrillDown({title:action.label,dimensionName:zh?'產品':'Product',dimensionValue:action.filters.product,sourceDashboard:context!.pageId,groupBy:'customer',filterOverrides:action.filters,evidence:dashboard?.evidence,rows:[]});
  };
  const result=current?.response?.analysis;
  return <section data-testid={`verified-analysis-${panelId}`} className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-white dark:bg-slate-900 p-4 space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-900 dark:text-white">{zh?'解讀目前視圖':'Explain this view'}</h3><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{zh?'以目前查詢快照產生可核對的資料解讀；數字與比較均保留來源。':'Verified explanation from the current query snapshot, with facts and comparisons bound to their source.'}</p></div><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={!context||needsSelection||pending} onClick={()=>run('brief')}>{pending?(zh?'讀取中…':'Loading…'):(zh?'產生資料解讀':'Generate verified explanation')}</button>{pending&&<button type="button" className={button} onClick={cancel}>{zh?'取消':'Cancel'}</button>}</div></div>
    <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">{dashboard?`${dashboard.pageId} · ${panelId} · Invoice Date ${dashboard.filters.month} · ${dashboard.filters.company} · ${productKey||dashboard.filters.product} · USD / KG`:zh?'等待目前看板資料。':'Waiting for current dashboard data.'}</p>
    {needsSelection&&<p className="text-xs text-amber-700 dark:text-amber-300">{zh?'先在上方圖表選取一項產品，再解讀其規模與毛利位置。':'Select a product in the chart above before explaining its scale and margin.'}</p>}
    {!context&&dashboard&&<p role="status" className="text-xs text-amber-700 dark:text-amber-300">{zh?'目前資料沒有可用的來源快照；請重新載入看板。':'A source snapshot is unavailable. Reload the dashboard.'}</p>}
    <details className="text-xs"><summary className="cursor-pointer text-slate-600 dark:text-slate-300">{zh?'模型輔助分析問題':'Model-assisted question'}</summary><div className="mt-3 space-y-2"><label className="block text-slate-700 dark:text-slate-200">{zh?'針對目前視圖的分析問題':'Question about this view'}<textarea value={question} maxLength={2000} rows={2} disabled={!aiEnabled||pending} onChange={event=>setQuestion(event.target.value)} className="mt-1 w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 p-2" placeholder={zh?'希望從目前資料了解什麼？':'What would you like to understand from this data?'}/></label><button type="button" className={button} disabled={!aiEnabled||!question.trim()||!context||needsSelection||pending} onClick={()=>run('model')}>{zh?'執行模型輔助解讀':'Run model-assisted explanation'}</button>{!aiEnabled&&<p className="text-slate-500">{zh?'模型尚未啟用；上方資料解讀可獨立使用。':'The model is not enabled; verified explanation above is available independently.'}</p>}</div></details>
    {current?.phase==='pending'&&<p role="status" className="text-sm text-slate-500">{zh?'正在核對目前來源、篩選與快照…':'Checking current source, filters and snapshot…'}</p>}
    {current?.phase==='error'&&<p role="alert" className="rounded border border-rose-200 dark:border-rose-900 p-3 text-sm text-rose-700 dark:text-rose-300">{current.error}{onRefresh&&<button type="button" className={button+' ml-3'} onClick={onRefresh}>{zh?'重新載入看板':'Reload dashboard'}</button>}</p>}
    {result&&<div className="space-y-3" aria-live="polite"><p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">{current!.response!.engine==='deterministic'?(zh?'資料規則解讀（未呼叫模型）':'Verified rule-based explanation (no model call)'):(zh?'模型選取，事實與算術敘述經伺服器核對':'Model-selected facts and arithmetic, verified by the server')}</p>{current?.question&&<p className="text-xs text-slate-600 dark:text-slate-300">{current.question}</p>}<ul className="list-disc pl-5 space-y-2 text-sm leading-6 text-slate-700 dark:text-slate-200">{result.claims.map(claim=><li key={claim.id}>{claim.text}<details className="mt-1 text-xs text-slate-500 dark:text-slate-400"><summary className="cursor-pointer">{zh?'核對此項證據':'Inspect this evidence'}</summary><ul className="mt-1 space-y-1 break-all">{claim.factIds.map(id=>{const fact=result.facts.find(f=>f.id===id)!;return <li key={id}>{fact.label}: {fact.value===null?'—':fact.value} {fact.unit} · {id}</li>;})}</ul><p className="break-all">Request ID: {claim.evidenceRef}</p></details></li>)}</ul><div className="flex flex-wrap gap-2">{result.nextActions.map(action=><button type="button" key={action.id} className={button} onClick={()=>act(action)}>{action.label}</button>)}</div><ul className="list-disc pl-4 text-xs leading-5 text-slate-500 dark:text-slate-400">{result.limitations.map((text,index)=><li key={index}>{text}</li>)}</ul><details className="text-xs text-slate-600 dark:text-slate-300"><summary className="cursor-pointer">{zh?'本次使用的來源與證據':'Source and evidence used'}</summary><dl className="mt-2 space-y-1 break-all"><div>Cube: {result.usedContext.source.database} / {result.usedContext.source.cube}</div><div>Invoice Date: {result.usedContext.filters.month} · USD / KG</div><div>{zh?'查詢時間':'Queried at'}: {result.usedContext.queriedAt}</div><div>Request ID: {result.usedContext.requestId}</div><div>Query hash: {result.usedContext.queryHash}</div><div>Snapshot: {result.usedContext.snapshotId}</div></dl></details></div>}
  </section>;
}
export default VerifiedAnalysisPanel;
