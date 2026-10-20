import type { SalesRow, Filters } from '../types/sales';

export const DASH = '—';

export const DEFAULT_FILTERS: Filters = {
  month: '202609',
  company: 'All',
  product: 'All',
  customer: 'All',
  salesperson: 'All',
  plant: 'All',
  costCenter: 'All',
};

export function isNullish(v: unknown): v is null | undefined {
  return v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));
}

export function fmtUSD(v: number | null | undefined, decimals = 0): string {
  if (isNullish(v)) return DASH;
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  return `${sign}$${abs.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function fmtSignedUSD(v: number | null | undefined, decimals = 0): string {
  if (isNullish(v)) return DASH;
  const sign = v > 0 ? '+' : v < 0 ? '-' : '';
  const abs = Math.abs(v);
  return `${sign}$${abs.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function fmtPriceUSD(v: number | null | undefined): string {
  if (isNullish(v)) return DASH;
  return `${fmtUSD(v, 2)} / KG`;
}

export function fmtKG(v: number | null | undefined, decimals = 0): string {
  if (isNullish(v)) return DASH;
  return `${v.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  })} KG`;
}

export function fmtCount(v: number | null | undefined): string {
  if (isNullish(v)) return DASH;
  return Math.round(v).toLocaleString('en-US');
}

/**
 * Percent values in the contract are FRACTIONS (e.g. 0.235 -> 23.5%).
 */
export function fmtPercent(v: number | null | undefined, decimals = 1): string {
  if (isNullish(v)) return DASH;
  return `${(v * 100).toFixed(decimals)}%`;
}

export function fmtSignedPercent(v: number | null | undefined, decimals = 1): string {
  if (isNullish(v)) return DASH;
  const pct = v * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(decimals)}%`;
}

export function fmtHHI(v: number | null | undefined): string {
  if (isNullish(v)) return DASH;
  if (v <= 1) {
    return v.toFixed(4);
  }
  return Math.round(v).toLocaleString('en-US');
}

export function fmtObservation(value: number | null | undefined, unit: string): string {
  if (isNullish(value)) return DASH;
  const u = (unit || '').toLowerCase();
  if (u === 'usd' || u === '$') return fmtUSD(value, 2);
  if (u === 'kg') return fmtKG(value, 2);
  if (u === 'percent' || u === '%' || u === 'fraction' || u === 'rate') return fmtPercent(value, 2);
  if (u === 'count' || u === 'lines' || u === 'orders' || u === 'rows') return fmtCount(value);
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 4 })}${unit ? ` ${unit}` : ''}`;
}

export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  return `"${String(v).replace(/"/g, '""')}"`;
}

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>): void {
  const lines = [
    headers.map(h => csvCell(h)).join(','),
    ...rows.map(r => r.map(c => csvCell(c)).join(',')),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportSalesRowsCsv(filename: string, rows: SalesRow[], dimensionHeader = 'Key'): void {
  const headers = [
    dimensionHeader,
    'Label',
    'netSalesUSD',
    'netCostUSD',
    'grossProfitUSD',
    'grossMarginPercent',
    'netQtyKG',
    'salesQtyKG',
    'returnQtyKG',
    'returnRatePercent',
    'averageSellingPriceUSD',
    'orderCount',
    'salesLineCount',
    'fullReturnLineCount',
    'partialReturnLineCount',
    'allowanceLineCount',
    'negativeMarginLineCount',
  ];
  const body = rows.map(r => [
    r.key,
    r.label,
    r.netSalesUSD,
    r.netCostUSD,
    r.grossProfitUSD,
    r.grossMarginPercent,
    r.netQtyKG,
    r.salesQtyKG,
    r.returnQtyKG,
    r.returnRatePercent,
    r.averageSellingPriceUSD,
    r.orderCount,
    r.salesLineCount,
    r.fullReturnLineCount,
    r.partialReturnLineCount,
    r.allowanceLineCount,
    r.negativeMarginLineCount,
  ]);
  downloadCsv(filename, headers, body);
}
