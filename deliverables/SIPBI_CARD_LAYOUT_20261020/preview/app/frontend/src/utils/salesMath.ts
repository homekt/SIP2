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
export interface DrilldownSummary {
  netSalesUSD: number;
  grossProfitUSD: number;
  grossMarginPercent: number | null;
  netQtyKG: number;
  salesQtyKG: number;
  returnQtyKG: number;
  averageSellingPriceUSD: number | null;
  returnRatePercent: number | null;
  salesLineCount: number;
  orderCount: null;
}
export function computeDrilldownSummary(rows: SalesRow[]): DrilldownSummary | null {
  if (!rows || rows.length === 0) return null;
  let netSalesUSD = 0;
  let grossProfitUSD = 0;
  let netQtyKG = 0;
  let salesQtyKG = 0;
  let returnQtyKG = 0;
  let salesLineCount = 0;
  for (const r of rows) {
    netSalesUSD += r.netSalesUSD ?? 0;
    grossProfitUSD += r.grossProfitUSD ?? 0;
    netQtyKG += r.netQtyKG ?? 0;
    salesQtyKG += r.salesQtyKG ?? 0;
    returnQtyKG += r.returnQtyKG ?? 0;
    salesLineCount += r.salesLineCount ?? 0;
  }
  const grossMarginPercent = netSalesUSD !== 0 ? grossProfitUSD / netSalesUSD : null;
  const averageSellingPriceUSD = netQtyKG !== 0 ? netSalesUSD / netQtyKG : null;
  const returnRatePercent = salesQtyKG !== 0 ? returnQtyKG / salesQtyKG : null;
  return {
    netSalesUSD,
    grossProfitUSD,
    grossMarginPercent,
    netQtyKG,
    salesQtyKG,
    returnQtyKG,
    averageSellingPriceUSD,
    returnRatePercent,
    salesLineCount,
    orderCount: null,
  };
}
export function computeGmAxisBounds(bound: { min: number; max: number }): { min: number; max: number } {
  if (!bound || !Number.isFinite(bound.min) || !Number.isFinite(bound.max)) {
    return { min: 0, max: 30 };
  }
  const rawMin = Math.min(bound.min, bound.max);
  const rawMax = Math.max(bound.min, bound.max);
  const span = Math.max(rawMax - rawMin, 0);
  const padLow = Math.max(2.5, span * 0.25);
  const padHigh = Math.max(2.0, span * 0.25);
  let min = Math.floor((rawMin - padLow) / 2) * 2;
  let max = Math.ceil((rawMax + padHigh) / 2) * 2;
  if (rawMin >= 0 && min < 0) {
    min = 0;
  }
  if (max - min < 6) {
    max = min + 6;
  }
  return { min, max };
}
export function computeParetoPercentAxis(
  windowMaxPct: number,
  view: 'top20' | 'all'
): { min: number; max: number; interval: number; showPareto80Line: boolean } {
  if (view === 'all' || !Number.isFinite(windowMaxPct) || !(windowMaxPct > 0) || windowMaxPct >= 65) {
    return { min: 0, max: 100, interval: 20, showPareto80Line: true };
  }
  if (windowMaxPct <= 10) {
    return { min: 0, max: 12, interval: 3, showPareto80Line: false };
  }
  if (windowMaxPct <= 22) {
    return { min: 0, max: 25, interval: 5, showPareto80Line: false };
  }
  if (windowMaxPct <= 36) {
    return { min: 0, max: 40, interval: 10, showPareto80Line: false };
  }
  if (windowMaxPct <= 54) {
    return { min: 0, max: 60, interval: 15, showPareto80Line: false };
  }
  return { min: 0, max: 80, interval: 20, showPareto80Line: true };
}
