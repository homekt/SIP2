import type {SalesRow} from '../types/sales';

const monthIndex = (key:string) => Number(key.slice(0,4))*12+Number(key.slice(4,6))-1;
function total(rows:SalesRow[]):number|null {
  if(!rows.length || rows.some(r=>r.netSalesUSD===null)) return null;
  if(rows.some((r,i)=>i>0 && monthIndex(r.key)!==monthIndex(rows[i-1].key)+1)) return null;
  return rows.reduce((sum,r)=>sum+r.netSalesUSD!,0);
}
export function enrichMonthly(rows:SalesRow[]) {
  return rows.map((row,index)=>{
    const year=row.key.slice(0,4);
    const ytd=rows.slice(0,index+1).filter(r=>r.key.startsWith(year));
    return {row,ytdVal:ytd[0]?.key===year+'01'?total(ytd):null,r3Val:index>=2?total(rows.slice(index-2,index+1)):null,r12Val:index>=11?total(rows.slice(index-11,index+1)):null};
  });
}
type Contribution={key:string;label:string;prior:number;current:number;delta:number};
export interface WaterfallStep {key:string;label:string;kind:'total'|'product'|'other';from:number;to:number;delta:number}
export function waterfallSteps(prior:number|null,current:number|null,items:Contribution[],limit=12):WaterfallStep[] {
  if(prior===null || current===null || !items.length)return [];
  const sorted=[...items].sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)||a.key.localeCompare(b.key));
  const chosen=sorted.slice(0,limit);
  const steps:WaterfallStep[]=[{key:'__prior',label:'Prior',kind:'total',from:0,to:prior,delta:prior}];
  let running=prior;
  for(const row of chosen){const to=running+row.delta;steps.push({...row,kind:'product',from:running,to});running=to;}
  if(sorted.length>limit){const delta=sorted.slice(limit).reduce((sum,row)=>sum+row.delta,0);steps.push({key:'__other',label:'Other',kind:'other',from:running,to:running+delta,delta});}
  steps.push({key:'__current',label:'Current',kind:'total',from:0,to:current,delta:current});
  return steps;
}
