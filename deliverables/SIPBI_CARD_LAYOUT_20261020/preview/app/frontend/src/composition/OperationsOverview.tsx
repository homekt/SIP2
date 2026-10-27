import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { fetchOperationsDashboard } from '../services/operationsApi';
import type { OperationsResponse } from '../types/operations';

export function OperationsOverview({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { lang, operationsMonth: month, setOperationsMonth: setMonth } = useApp();
  const zh = lang === 'zh-TW';
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState<{ month: string; production: OperationsResponse; delivery: OperationsResponse } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setLoaded(null); setError(null);
    Promise.all([fetchOperationsDashboard('production', month, controller.signal), fetchOperationsDashboard('fulfilment', month, controller.signal)]).then(([production, delivery]) => {
      if (production.status === 'unavailable' || delivery.status === 'unavailable') throw new Error('Operations source unavailable');
      if (!controller.signal.aborted) setLoaded({ month, production, delivery });
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [month, revision]);
  const data = loaded?.month === month ? loaded : null;
  const metric = (source: OperationsResponse | undefined, dataset: string, key: string) => {
    const value = source?.datasets.find(item => item.name === dataset)?.rows[0]?.[key];
    return typeof value === 'number' ? value : null;
  };
  const format = (value: number | null, ratio = false) => value === null ? '—' : ratio ? `${(value * 100).toFixed(2)}%` : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const items = [
    { label: zh ? '排程作業 OEE' : 'Scheduled-job OEE', value: metric(data?.production, 'summary', 'Scheduled Job OEE %'), ratio: true, role: `ProductionDate · ${month}`, target: 'OPS_PRODUCTION' },
    { label: zh ? '報廢率' : 'Scrap rate', value: metric(data?.production, 'summary', 'Scrap Rate %'), ratio: true, role: `ProductionDate · ${month}`, target: 'OPS_PRODUCTION' },
    { label: zh ? '已交行數準交率' : 'Shipped-line on-time rate', value: metric(data?.delivery, 'summary', 'On Time Delivery %'), ratio: true, role: `ActualShipDate · ${month}`, target: 'OPS_FULFILMENT' },
    { label: zh ? '固定快照積壓 CNY' : 'Fixed-snapshot backlog CNY', value: metric(data?.delivery, 'backlogSummary', 'Backlog CNY'), ratio: false, role: 'AsOfDate · 2026-10-19', target: 'OPS_FULFILMENT' },
  ];
  return <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3" data-testid="operations-overview">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-bold">{zh ? '營運會議補充：生產與交付' : 'Operations briefing: production & delivery'}</h2><p className="text-xs leading-5 text-slate-500 mt-1">SI Manufacturing BI · {zh ? '獨立來源與月份；上方 USD 銷售篩選不套用於此，金額不混加。' : 'Separate source and month; USD sales filters above do not apply here. Monetary values are not combined.'}</p></div><label className="text-xs">{zh ? '營運月份' : 'Operations month'} <input aria-label={zh ? '首頁營運月份' : 'Home operations month'} type="month" value={`${month.slice(0, 4)}-${month.slice(4)}`} onChange={event => { const key = event.target.value.replace('-', ''); if (/^\d{6}$/.test(key)) setMonth(key); }} className="border border-slate-300 dark:border-slate-600 bg-transparent rounded px-2 py-1.5" /></label></div>
    {error ? <div role="alert" className="text-sm text-rose-700 dark:text-rose-300">{zh ? '營運來源暫時無法使用，銷售頁仍可操作。' : 'Operations source is unavailable; sales remains usable.'} <button type="button" className="underline" onClick={() => setRevision(value => value + 1)}>{zh ? '重試' : 'Retry'}</button></div> : !data ? <p className="text-sm text-slate-500" role="status">{zh ? '正在讀取營運來源…' : 'Loading operations source…'}</p> : <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">{items.map(item => <button key={item.label} type="button" onClick={() => onNavigate(item.target)} className="text-left rounded border border-slate-200 dark:border-slate-700 px-3 py-3 hover:border-indigo-500 focus-visible:outline-2 focus-visible:outline-indigo-500"><p className="text-xs text-slate-500">{item.label}</p><p className="my-1 text-xl font-semibold tabular-nums">{format(item.value, item.ratio)}</p><p className="text-xs text-slate-500">{item.role}</p><span className="text-xs text-indigo-600 dark:text-indigo-300">{zh ? '查看分析與證據 →' : 'Analysis & evidence →'}</span></button>)}</div>}
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-indigo-600 dark:text-indigo-300">{[['OPS_PRODUCTION', zh ? '機台效率／停機原因' : 'Machine efficiency / downtime'], ['OPS_FULFILMENT', zh ? '交付趨勢／積壓帳齡' : 'Delivery trend / backlog aging'], ['OPS_BUDGET', zh ? '預算執行／差額對帳' : 'Budget execution / gap reconciliation']].map(([tab, label]) => <button type="button" className="underline" key={tab} onClick={() => onNavigate(tab)}>{label}</button>)}</div>
  </section>;
}
