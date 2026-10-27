import type {DashboardResponse, Filters, Source} from '../../types/sales';

export interface AnalysisContext {
  pageId:string; filters:Filters; panelId:string; productKey:string|null;
  locale:'zh-TW'|'en'; expectedSnapshotId:string;
}
export interface AnalysisFact {id:string;metric:string;value:number|null;unit:string;label:string;entityKey:string|null;evidenceRef:string}
export interface AnalysisClaim {id:string;text:string;factIds:string[];evidenceRef:string;kind:string}
export interface AnalysisAction {id:string;kind:'navigate'|'drill';tab:string;groupBy?:'customer';filters:Filters;label:string}
export interface VerifiedAnalysis {
  claims:AnalysisClaim[];facts:AnalysisFact[];nextActions:AnalysisAction[];limitations:string[];
  usedContext:Omit<AnalysisContext,'expectedSnapshotId'> & {snapshotId:string;source:Source;requestId:string;queryHash:string;queriedAt:string;grain:string;measures:string[]};
}
export interface AnalysisResponse {status:'ok';engine:'deterministic'|'model-selected';analysis:VerifiedAnalysis}
const filterKeys=['month','company','product','customer','salesperson','plant','costCenter'] as const;
const tabs=new Set(['D00','D01','D02','D04','D06','D08','D11','D13','D14','D15','D16','D18']);

export function makeAnalysisContext(dashboard:DashboardResponse|null,panelId:string,productKey:string|null,locale:'zh-TW'|'en'):AnalysisContext|null {
  if(!dashboard || dashboard.status!=='ok' || !dashboard.evidence.snapshotId || dashboard.source.currency!=='USD' || dashboard.source.dateRole!=='Invoice Date' || dashboard.source.cube!=='JDE Sales')return null;
  return {pageId:dashboard.pageId,filters:{...dashboard.filters},panelId,productKey,locale,expectedSnapshotId:dashboard.evidence.snapshotId};
}
export function analysisContextKey(context:AnalysisContext|null):string {
  return context?JSON.stringify([context.pageId,context.panelId,context.productKey,context.locale,context.expectedSnapshotId,...filterKeys.map(key=>context.filters[key])]):'';
}

export function validateAnalysisResponse(value:unknown,requested:AnalysisContext,dashboard:DashboardResponse):AnalysisResponse {
  const response=value as AnalysisResponse;
  const invalid=()=>{throw new Error(requested.locale==='en'?'The explanation does not match the current source snapshot. Reload the dashboard and retry.':'解讀與目前來源快照不符，請重新載入看板後重試。');};
  if(!response || response.status!=='ok' || !['deterministic','model-selected'].includes(response.engine))return invalid();
  const a=response.analysis,c=a?.usedContext;
  if(!c || c.pageId!==requested.pageId || c.panelId!==requested.panelId || (c.productKey??null)!==requested.productKey || c.locale!==requested.locale || c.snapshotId!==requested.expectedSnapshotId || !filterKeys.every(key=>c.filters?.[key]===requested.filters[key]))return invalid();
  if(c.queryHash!==dashboard.evidence.queryHash || !c.requestId || !c.source || !['server','database','cube','dateRole','currency','quantityUnit','synthetic','coverageStart','coverageEnd'].every(key=>c.source[key as keyof Source]===dashboard.source[key as keyof Source]))return invalid();
  if(!Array.isArray(a.claims)||!Array.isArray(a.facts)||!Array.isArray(a.nextActions)||!Array.isArray(a.limitations)||!a.limitations.every(x=>typeof x==='string'))return invalid();
  if(a.facts.some(f=>!f||typeof f.id!=='string'||typeof f.label!=='string'||(f.value!==null&&(typeof f.value!=='number'||!Number.isFinite(f.value)))))return invalid();
  const ids=new Set(a.facts.map(f=>f.id));
  if(ids.size!==a.facts.length || a.claims.some(claim=>!claim||typeof claim.text!=='string'||!Array.isArray(claim.factIds)||!claim.factIds.length||claim.factIds.some(id=>!ids.has(id))||claim.evidenceRef!==c.requestId))return invalid();
  if(a.nextActions.some(action=>!action||!tabs.has(action.tab)||!['navigate','drill'].includes(action.kind)||typeof action.label!=='string'||!filterKeys.every(key=>typeof action.filters?.[key]==='string'&&(key==='product'||action.filters[key]===requested.filters[key]))||(action.kind==='drill'&&(action.groupBy!=='customer'||action.filters.product==='All'))))return invalid();
  return response;
}
