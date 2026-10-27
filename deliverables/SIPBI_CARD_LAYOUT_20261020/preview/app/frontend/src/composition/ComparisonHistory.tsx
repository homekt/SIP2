import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { fetchSalesDashboard } from '../services/salesApi';
import type { DashboardResponse, Filters, Member } from '../types/sales';
import { EChartsContainer } from '../components/charts/EChartsContainer';
import { downloadCsv, fmtUSD } from '../utils/salesFormat';
import { comparisonMonths, loadBounded, rankComparison, trailingAverage } from './comparisonMath';

type Dimension = 'company' | 'salesperson' | 'customer' | 'product';
interface Props { slicer: Filters; dimension: Dimension; maxMembers?: number; metric?: 'netSalesUSD' | 'grossProfitUSD'; showRanks?: boolean }
interface Loaded { member: Member; response: DashboardResponse }

export function ComparisonHistory({ slicer, dimension, maxMembers = 5, metric = 'netSalesUSD', showRanks = false }: Props) {
  const { metadata, metadataLoading, metadataError, theme, lang } = useApp();
  const zh = lang === 'zh-TW';
  const dark = theme === 'dark';
  const cap = Math.min(5, Math.max(1, maxMembers));
  const members = metadata?.members[dimension] || [];
  const [chosen, setChosen] = useState<string[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [focus, setFocus] = useState<string | null>(null);
  const [result, setResult] = useState<{ context: string; rows: Loaded[]; error: string | null; pending: boolean }>({ context: '', rows: [], error: null, pending: false });
  const validMembers = members.filter(member => member.key !== 'All');
  const fixed = slicer[dimension] !== 'All';
  const keys = fixed ? [slicer[dimension]] : chosen.filter(key => validMembers.some(member => member.key === key));
  const resolvedKeys = keys.length ? keys.slice(0, cap) : validMembers.slice(0, cap).map(member => member.key);
  const context = JSON.stringify({ slicer, dimension, keys: resolvedKeys, refresh });
  const current = result.context === context ? result : null;
  const pending = !current || current.pending;
  const loaded = current?.rows || [];

  useEffect(() => {
    if (!resolvedKeys.length) return;
    const controller = new AbortController();
    setResult({ context, rows: [], error: null, pending: true });
    setFocus(null);
    loadBounded(resolvedKeys, async key => {
      const filters = { ...slicer, [dimension]: key };
      const response = await fetchSalesDashboard('D02', filters, controller.signal);
      if (response.source.currency !== 'USD' || response.source.dateRole !== 'Invoice Date' || Object.entries(filters).some(([field, value]) => response.filters[field as keyof Filters] !== value)) throw new Error(zh ? '比較查詢的來源或篩選不一致' : 'Comparison source or filters do not match');
      return { member: validMembers.find(member => member.key === key) || { key, label: key }, response };
    }, 2, controller.signal).then(rows => {
      if (!controller.signal.aborted) setResult({ context, rows, error: null, pending: false });
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ context, rows: [], error: error instanceof Error ? error.message : String(error), pending: false });
    });
    return () => controller.abort();
  }, [context]);

  const months = useMemo(() => comparisonMonths(loaded.map(item => item.response.datasets.monthly), 12), [loaded]);
  const values = loaded.map(item => {
    const byMonth = new Map(item.response.datasets.monthly.map(row => [row.key, row[metric]]));
    return months.map(month => byMonth.get(month) ?? null);
  });
  const averages = loaded.map(item => {
    const source = item.response.datasets.monthly;
    const calculated = trailingAverage(source.map(row => ({ key: row.key, value: row[metric] })), 3);
    const byMonth = new Map(source.map((row, index) => [row.key, calculated[index]]));
    return months.map(month => byMonth.get(month) ?? null);
  });
  const numbers = values.flat().filter((value): value is number => value !== null && Number.isFinite(value));
  const lower = Math.min(0, ...numbers);
  const upper = Math.max(1, ...numbers);
  const range = Math.max(upper - lower, 1);
  const yMin = lower < 0 ? lower - range * .08 : 0;
  const yMax = upper + range * .08;
  const ranks = months.map((_, index) => rankComparison(values.map(series => series[index])));
  const palette = ['#6366f1', dark ? '#2dd4bf' : '#0f766e', '#b45309', '#7c3aed', '#64748b'];
  const axis = dark ? '#cbd5e1' : '#475569';
  const compact = (value: number) => `${value < 0 ? '−' : ''}$${(Math.abs(value) / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })}k`;
  const metricLabel = metric === 'netSalesUSD' ? (zh ? '淨銷售額' : 'Net sales') : (zh ? '毛利額' : 'Gross profit');
  const dimensionLabel = ({ company: zh ? '公司' : 'companies', salesperson: zh ? '業務員' : 'salespeople', customer: zh ? '客戶' : 'customers', product: zh ? '產品' : 'products' })[dimension];
  const exportRows = loaded.flatMap((item, index) => months.map((month, m) => [item.member.key, item.member.label, month, values[index][m], averages[index][m], ranks[m][index], item.response.evidence.requestId, item.response.evidence.queryHash]));

  return <section className="space-y-4 min-w-0" data-testid={`comparison-${dimension}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="font-semibold text-slate-900 dark:text-slate-100">{zh ? `${dimensionLabel}趨勢比較` : `Compare ${dimensionLabel} over time`}</h3><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{zh ? `固定選取母體，共用 USD 尺度；原始月值與三個完整月移動平均，最多 ${cap} 個成員。` : `Fixed selected population, shared USD scale; raw months and a three-complete-month moving average, up to ${cap} members.`}</p></div>
      <button type="button" disabled={pending || !exportRows.length} onClick={() => downloadCsv(`comparison-${dimension}-${slicer.month}.csv`, ['Key', 'Label', 'InvoiceMonth', `${metric}_USD`, 'MovingAverage3USD', 'SelectedPopulationRank', 'RequestId', 'QueryHash'], exportRows)} className="px-3 py-2 text-xs font-semibold rounded border border-slate-300 dark:border-slate-600 disabled:opacity-40">{zh ? '匯出比較與證據 CSV' : 'Export comparison and evidence CSV'}</button>
    </div>
    {!fixed && <fieldset className="flex flex-wrap gap-2"><legend className="mb-2 text-xs text-slate-500">{zh ? '比較成員（不改全頁篩選；名次僅限所選母體）' : 'Comparison members (page filters unchanged; ranks within this selection)'}</legend>{validMembers.map(member => <label key={member.key} className="inline-flex items-center gap-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 px-2 py-1.5"><input type="checkbox" checked={resolvedKeys.includes(member.key)} disabled={!resolvedKeys.includes(member.key) && resolvedKeys.length >= cap} onChange={() => {
      const next = resolvedKeys.includes(member.key) ? resolvedKeys.filter(key => key !== member.key) : [...resolvedKeys, member.key];
      if (next.length) setChosen(next);
    }} />{member.label}</label>)}</fieldset>}
    {metadataError && !resolvedKeys.length ? <div role="alert" className="rounded border border-rose-300 p-4 text-sm"><p>{zh ? '成員主檔無法載入，無法建立比較。請重新載入頁面重試。' : 'Member metadata failed to load. Reload the page to retry.'}</p><button type="button" className="underline mt-2" onClick={() => window.location.reload()}>{zh ? '重新載入頁面' : 'Reload page'}</button></div> : !metadataLoading && !resolvedKeys.length ? <p className="py-6 text-sm text-slate-500">{zh ? '此維度沒有可比較的成員。' : 'No comparison members in this dimension.'}</p> : pending ? <p role="status" className="py-8 text-sm text-slate-500">{zh ? '正在讀取各成員的實際 Cube 月份序列…' : 'Loading governed member-by-month Cube queries…'}</p> : current?.error ? <div role="alert" className="rounded border border-rose-300 p-4 text-sm"><p>{current.error}</p><button type="button" className="underline mt-2" onClick={() => setRefresh(value => value + 1)}>{zh ? '重試比較查詢' : 'Retry comparison queries'}</button></div> : !months.length ? <p className="py-6 text-sm text-slate-500">{zh ? '這個範圍沒有月份資料。' : 'No monthly data in this scope.'}</p> : <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{loaded.map((item, index) => {
        const average = averages[index];
        const muted = focus !== null && focus !== item.member.key;
        return <div key={item.member.key} className={`rounded border p-3 min-w-0 ${focus === item.member.key ? 'border-indigo-500' : 'border-slate-200 dark:border-slate-700'}`}>
          <button type="button" aria-pressed={focus === item.member.key} onClick={() => setFocus(focus === item.member.key ? null : item.member.key)} className="text-left text-sm font-semibold text-indigo-700 dark:text-indigo-300 mb-1">{item.member.label} <span className="text-xs font-normal text-slate-500">{item.member.key}</span></button>
          <EChartsContainer height="225px" option={{ animation: false, tooltip: { trigger: 'axis', valueFormatter: (value: number | null) => fmtUSD(value) }, legend: { data: [zh ? '原始月值' : 'Raw month', zh ? '3 月移動平均' : '3-month average'], textStyle: { color: axis, fontSize: 11 } }, grid: { left: 8, right: 10, top: 38, bottom: 10, containLabel: true }, xAxis: { type: 'category', data: months, axisLabel: { fontSize: 11, color: axis, formatter: (value: string) => `${value.slice(0, 4)}/${value.slice(4)}` } }, yAxis: { type: 'value', min: yMin, max: yMax, name: 'USD', axisLabel: { formatter: compact, fontSize: 11, color: axis } }, series: [{ name: zh ? '原始月值' : 'Raw month', type: 'line', smooth: false, connectNulls: false, data: values[index], symbolSize: 5, lineStyle: { width: 2, opacity: muted ? .3 : 1 }, itemStyle: { color: palette[index % palette.length], opacity: muted ? .3 : 1 } }, { name: zh ? '3 月移動平均' : '3-month average', type: 'line', connectNulls: false, smooth: false, symbol: 'none', data: average, lineStyle: { type: 'dashed', color: '#64748b', opacity: muted ? .3 : 1 } }] }} />
          <p className="text-xs text-slate-500 mt-1">{months.at(-1)} · {metricLabel} {fmtUSD(values[index].at(-1) ?? null)}</p>
        </div>;
      })}</div>
      {showRanks && loaded.length > 1 && <div className="rounded border border-slate-200 dark:border-slate-700 p-4 min-w-0"><h4 className="font-semibold text-sm">{zh ? '所選母體名次變化（Bump）' : 'Rank movement within selected population (Bump)'}</h4><p className="text-xs text-slate-500 my-2">{zh ? '同值並列：1、1、3；任一成員月份缺值時，該月全部名次留空。名次提升不代表金額成長。' : 'Competition ties: 1, 1, 3. Any missing member makes the month unranked. Better rank does not imply revenue growth.'}</p><EChartsContainer height="290px" option={{ animation: false, grid: { left: 10, right: 16, top: 35, bottom: 10, containLabel: true }, tooltip: { trigger: 'axis', valueFormatter: (value: number | null) => value === null ? '—' : `#${value}` }, legend: { top: 0, textStyle: { color: axis, fontSize: 11 } }, xAxis: { type: 'category', data: months, axisLabel: { color: axis, fontSize: 11 } }, yAxis: { type: 'value', inverse: true, min: 1, max: Math.max(2, loaded.length), interval: 1, axisLabel: { color: axis, formatter: '#{value}' } }, series: loaded.map((item, index) => ({ name: item.member.label, type: 'line', smooth: false, connectNulls: false, symbolSize: 7, data: ranks.map(month => month[index]), lineStyle: { width: focus === item.member.key ? 4 : 2, opacity: focus && focus !== item.member.key ? .25 : 1 }, itemStyle: { color: palette[index % palette.length] } })) }} /></div>}
      {focus && <button className="text-sm underline text-indigo-600 dark:text-indigo-300" type="button" onClick={() => setFocus(null)}>{zh ? '清除高亮（比較母體不變）' : 'Clear highlight (population unchanged)'}</button>}
      <details className="rounded border border-slate-200 dark:border-slate-700 p-3"><summary className="cursor-pointer text-sm font-semibold">{zh ? '精確數值、名次與來源證據' : 'Exact values, ranks and source evidence'}</summary><div className="overflow-x-auto mt-3"><table className="w-full text-xs tabular-nums"><caption className="text-left text-slate-500 pb-2">Invoice Date · USD · {zh ? '合成測試資料；每個成員有獨立查詢證據。' : 'Synthetic data; each member retains its own query evidence.'}</caption><thead><tr><th className="text-left p-2">{zh ? '成員' : 'Member'}</th><th className="p-2">{zh ? '月份' : 'Month'}</th><th className="text-right p-2">{metricLabel} USD</th><th className="p-2">{zh ? '3 月移動平均 USD' : '3M average USD'}</th><th className="p-2">{zh ? '所選名次' : 'Selected rank'}</th><th className="text-left p-2">Request ID</th></tr></thead><tbody>{loaded.flatMap((item, index) => months.map((month, m) => <tr key={`${item.member.key}-${month}`} className="border-t border-slate-100 dark:border-slate-800"><td className="p-2">{item.member.label}</td><td className="p-2 text-center">{month}</td><td className="p-2 text-right">{fmtUSD(values[index][m])}</td><td className="p-2 text-right">{fmtUSD(averages[index][m])}</td><td className="p-2 text-center">{ranks[m][index] ?? '—'}</td><td className="p-2 font-mono break-all">{item.response.evidence.requestId}</td></tr>))}</tbody></table></div></details>
    </>}
  </section>;
}
