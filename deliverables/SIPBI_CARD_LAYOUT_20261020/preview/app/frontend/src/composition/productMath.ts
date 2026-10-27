import type { SalesRow } from '../types/sales';

export function bubbleEligible(row: Pick<SalesRow, 'netSalesUSD'|'grossMarginPercent'|'netQtyKG'>): boolean {
  return typeof row.netSalesUSD === 'number' && Number.isFinite(row.netSalesUSD) && row.netSalesUSD > 0
    && typeof row.grossMarginPercent === 'number' && Number.isFinite(row.grossMarginPercent)
    && typeof row.netQtyKG === 'number' && Number.isFinite(row.netQtyKG) && row.netQtyKG > 0;
}

// Diameter is proportional to sqrt(quantity), so circular AREA encodes quantity.
// No minimum radius or per-point cap: zero/missing/negative quantity has no bubble.
export function quantityDiameter(quantity: number|null, maxQuantity: number, maxDiameter = 48): number {
  if (quantity === null || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(maxQuantity) || maxQuantity <= 0) return 0;
  return Math.sqrt(quantity / maxQuantity) * maxDiameter;
}

export function topAbsoluteImpact<T extends {key:string;delta:number}>(rows:T[], limit=8):T[] {
  return [...rows].filter(row=>Number.isFinite(row.delta)).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)||a.key.localeCompare(b.key)).slice(0,limit);
}

export function categoryShares<T extends {key:string;netSalesUSD:number|null;netQtyKG:number|null}>(rows:T[]) {
  if (!rows.length || rows.some(r=>r.netSalesUSD===null || !Number.isFinite(r.netSalesUSD) || r.netSalesUSD<0 || r.netQtyKG===null || !Number.isFinite(r.netQtyKG) || r.netQtyKG<0)) return null;
  const sales=rows.reduce((sum,r)=>sum+r.netSalesUSD!,0),quantity=rows.reduce((sum,r)=>sum+r.netQtyKG!,0);
  if(sales<=0 || quantity<=0) return null;
  return rows.map(row=>({...row,salesShare:row.netSalesUSD!/sales,quantityShare:row.netQtyKG!/quantity}));
}
