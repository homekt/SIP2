import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { EChartsContainer } from '../components/charts/EChartsContainer';
import { fetchOperationsDashboard, exportOperationsDataset } from '../services/operationsApi';
import type { OperationsKind, OperationsResponse, OperationsRow, OperationsDataset } from '../types/operations';

const card = 'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 min-w-0';
const button = 'rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-blue-500';
const number = (row: OperationsRow | undefined, key: string): number | null => typeof row?.[key] === 'number' ? row[key] as number : null;
const text = (row: OperationsRow, key: string) => String(row[key] ?? '—');
const fmt = (v: number | null | undefined, percent = false) => v == null ? '—' : percent ? `${(v * 100).toFixed(2)}%` : v.toLocaleString('en-US', { maximumFractionDigits: 2 });
const pct = (value: number) => `${value}%`;
function previousMonth(month: string) { const date = new Date(Number(month.slice(0, 4)), Number(month.slice(4)) - 2, 1); return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`; }

const OperationsDashboard: React.FC<{ kind: OperationsKind }> = ({ kind }) => {
  const { lang, theme, operationsMonth: month, setOperationsMonth: setMonth } = useApp();
  const zh = lang === 'zh-TW';
  const tr = (a: string, b: string) => zh ? a : b;
  const [response, setResponse] = useState<OperationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [mode, setMode] = useState<'full' | 'toDate'>('toDate');
  const [metric, setMetric] = useState<'Scheduled Job OEE %' | 'Scrap Rate %'>('Scheduled Job OEE %');
  const [allMachines, setAllMachines] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setResponse(null); setError(null);
    fetchOperationsDashboard(kind, month, controller.signal).then(data => { if (!controller.signal.aborted) setResponse(data); }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [kind, month, revision]);
  // Never show the old version beneath new period or domain controls.
  const data = response?.kind === kind && response.month === month ? response : null;
  const dataset = (name: string) => data?.datasets.find(item => item.name === name);
  const rows = (name: string) => dataset(name)?.rows || [];
  const summary = rows('summary')[0];
  const backlog = rows('backlogSummary')[0];
  const color = theme === 'dark' ? '#94a3b8' : '#475569';
  const base = { tooltip: { trigger: 'axis', renderMode: 'richText' }, grid: { left: 12, right: 24, top: 38, bottom: 18, containLabel: true }, textStyle: { color, fontSize: 12 }, animation: false };
  const title = kind === 'production' ? tr('生產效率與品質', 'Production efficiency & quality') : kind === 'fulfilment' ? tr('交付與積壓', 'Delivery & backlog') : tr('月度預算檢討', 'Monthly budget review');
  const target = mode === 'full' ? 'Budget Sales CNY' : 'Budget Sales To Date CNY';
  const gap = mode === 'full' ? 'Budget Gap CNY' : 'Budget Gap To Date CNY';
  const achievement = mode === 'full' ? 'Budget Achievement %' : 'Budget Achievement To Date %';
  const targetLabel = mode === 'full' ? tr('完整月計畫', 'Full-month plan') : tr('截至固定資料日的計畫', 'Plan elapsed through fixed cutoff');
  const kpis: { label: string; value: number | null; suffix?: string; ratio?: boolean }[] = kind === 'production' ? [
    { label: 'Scheduled Job OEE', value: number(summary, 'Scheduled Job OEE %'), ratio: true },
    { label: tr('投入', 'Input'), value: number(summary, 'Input KG'), suffix: 'KG' },
    { label: tr('良品', 'Good output'), value: number(summary, 'Good KG'), suffix: 'KG' },
    { label: tr('報廢率', 'Scrap rate'), value: number(summary, 'Scrap Rate %'), ratio: true },
  ] : kind === 'fulfilment' ? [
    { label: tr('所選月準交率', 'Selected-month on-time delivery'), value: number(summary, 'On Time Delivery %'), ratio: true },
    { label: tr('所選月已交行數', 'Selected-month shipped lines'), value: number(summary, 'Shipped Line Count') },
    { label: tr('固定快照積壓', 'Fixed-snapshot backlog'), value: number(backlog, 'Backlog CNY'), suffix: 'CNY' },
    { label: tr('固定快照逾期行數', 'Fixed-snapshot overdue lines'), value: number(backlog, 'Overdue Line Count') },
  ] : [
    { label: tr('實際淨銷售', 'Actual net sales'), value: number(summary, 'Net Sales CNY'), suffix: 'CNY' },
    { label: targetLabel, value: number(summary, target), suffix: 'CNY' },
    { label: tr('實際 − 計畫', 'Actual − plan'), value: number(summary, gap), suffix: 'CNY' },
    { label: tr('達成率', 'Achievement'), value: number(summary, achievement), ratio: true },
  ];
  const machines = [...rows('machines')].sort((a, b) => (number(a, metric) ?? Infinity) - (number(b, metric) ?? Infinity));
  const histories = rows('machineHistory');
  const comparisonMachines = machines.slice(0, 6);
  const comparisonPoints = comparisonMachines.map(machine => ({
    prior: number(histories.find(row => row.company_key === machine.company_key && row.machine_key === machine.machine_key && row.month_key === previousMonth(month)), 'Scheduled Job OEE %'),
    current: number(machine, 'Scheduled Job OEE %'),
  }));
  const productionComparisonOption = {
    ...base, legend: { top: 4, textStyle: { color } },
    xAxis: { type: 'value', min: 0, max: 100, axisLabel: { color, formatter: pct } },
    yAxis: { type: 'category', data: comparisonMachines.map(row => text(row, 'machine_label')), axisLabel: { color } },
    series: [
      ...comparisonPoints.map((point, index) => ({ type: 'line', silent: true, symbol: 'none', lineStyle: { color: '#94a3b8', width: 2 }, data: point.prior === null || point.current === null ? [] : [[point.prior * 100, index], [point.current * 100, index]] })),
      { name: previousMonth(month), type: 'scatter', symbol: 'emptyCircle', symbolSize: 10, itemStyle: { color: '#94a3b8' }, data: comparisonPoints.map((point, index) => point.prior === null ? null : [point.prior * 100, index]) },
      { name: month, type: 'scatter', symbolSize: 10, itemStyle: { color: '#3b82f6' }, data: comparisonPoints.map((point, index) => point.current === null ? null : [point.current * 100, index]) },
    ],
  };
  const deliveryPeriods = (dataset('deliveryTrend')?.period as string[]) || [];
  const deliveryRows = deliveryPeriods.map(key => rows('deliveryTrend').find(row => row.month_key === key));
  const productionMonths = (dataset('machineHistory')?.period as string[]) || [];
  const reasons = [...rows('downtimeReasons')].sort((a, b) => (number(b, 'Reason Downtime Minutes') ?? -Infinity) - (number(a, 'Reason Downtime Minutes') ?? -Infinity));
  const reasonValues = reasons.map(row => number(row, 'Reason Downtime Minutes'));
  const validPareto = reasonValues.length > 0 && reasonValues.every(v => v !== null && v >= 0) && reasonValues.reduce<number>((sum, v) => sum + (v || 0), 0) > 0;
  const reasonTotal = validPareto ? reasonValues.reduce<number>((sum, v) => sum + (v || 0), 0) : 0;
  let cumulative = 0;
  const cumulativeValues = reasonValues.map(v => { cumulative += v || 0; return reasonTotal > 0 ? cumulative / reasonTotal * 100 : null; });
  const companies = [...rows('companies')].sort((a, b) => (number(a, gap) ?? Infinity) - (number(b, gap) ?? Infinity));
  let running = 0;
  const validGap = companies.length > 0 && companies.every(row => number(row, gap) !== null);
  const waterfall = companies.map(row => { const v = number(row, gap); const before = running; running += v || 0; return { start: before, end: running, signed: v }; });
  const companyNames = companies.map(row => text(row, 'company_label'));
  const budgetWaterfallOption = {
    ...base,
    tooltip: { trigger: 'item', renderMode: 'richText', formatter: (p: { name: string; value: number[] }) => p.name + ': ' + fmt(p.value[3]) + ' CNY' },
    xAxis: { type: 'category', data: [...companyNames, tr('總差額', 'Total gap')], axisLabel: { color, width: 80, overflow: 'truncate' } },
    yAxis: { type: 'value', name: 'CNY', axisLabel: { color } },
    series: [{
      name: tr('差額', 'Gap'), type: 'custom', encode: { x: 0, y: [1, 2], tooltip: 3 },
      data: [...waterfall.map((row, index) => [index, row.start, row.end, row.signed]), [companies.length, 0, running, running]],
      // Signed waterfall endpoints avoid ECharts' separate positive/negative stacks.
      renderItem: (_params: unknown, api: { value: (i: number) => number; coord: (values: number[]) => number[]; size: (values: number[]) => number[] }) => {
        const start = api.coord([api.value(0), api.value(1)]);
        const end = api.coord([api.value(0), api.value(2)]);
        const width = Math.max(4, api.size([1, 0])[0] * 0.55);
        return { type: 'rect', shape: { x: start[0] - width / 2, y: Math.min(start[1], end[1]), width, height: Math.max(1, Math.abs(end[1] - start[1])) }, style: { fill: api.value(0) === companies.length ? '#64748b' : api.value(3) < 0 ? '#e11d48' : '#3b82f6' } };
      },
    }],
  };
  const bandKeys = [...new Set(rows('backlogAging').map(row => text(row, 'aging_key')))];
  const backlogCompanyKeys = [...new Set(rows('backlogAging').map(row => text(row, 'company_key')))];
  const backlogCompanyNames = backlogCompanyKeys.map(key => text(rows('backlogAging').find(row => row.company_key === key)!, 'company_label'));
  const table = (d: OperationsDataset) => {
    const fields = [...new Set(d.rows.flatMap(row => Object.keys(row)))];
    return <section key={d.name} className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3"><div><h3 className="font-semibold">{d.name}</h3><p className="text-sm text-slate-500 dark:text-slate-400">{d.dateRole} · {Array.isArray(d.period) ? d.period.join(' … ') : d.period} · {d.rows.length} {tr('列', 'rows')}</p></div><button className={button} onClick={() => data && exportOperationsDataset(d, data)}>CSV</button></div>
      {d.rows.length === 0 ? <p>{tr('此粒度沒有資料。', 'No rows at this grain.')}</p> : <div className="overflow-auto max-h-96"><table className="w-full text-sm border-collapse"><caption className="sr-only">{d.name} {d.dateRole}</caption><thead><tr>{fields.map(field => <th scope="col" className="text-left p-3 whitespace-nowrap border-b border-slate-200 dark:border-slate-700" key={field}>{field}</th>)}</tr></thead><tbody>{d.rows.map((row, i) => <tr key={i}>{fields.map(field => <td className="p-3 whitespace-nowrap border-b border-slate-100 dark:border-slate-800 tabular-nums" key={field}>{typeof row[field] === 'number' ? fmt(row[field] as number, field.endsWith('%')) : row[field] ?? '—'}</td>)}</tr>)}</tbody></table></div>}
    </section>;
  };
  return <main className="space-y-5 text-slate-900 dark:text-slate-100">
    <header className={card}>
      <div className="flex flex-wrap justify-between items-start gap-4"><div><p className="text-sm font-medium text-blue-600 dark:text-blue-400">SI Manufacturing BI · CNY</p><h1 className="text-2xl font-semibold mt-1">{title}</h1></div>
        <label className="text-sm">{tr('獨立營運月份', 'Operations month')}<input aria-label={tr('營運月份', 'Operations month')} className="block mt-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2" type="month" min="1000-01" max="9999-12" value={`${month.slice(0, 4)}-${month.slice(4)}`} onChange={e => { if (/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(e.target.value)) setMonth(e.target.value.replace('-', '')); }} /></label>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">{tr('合成資料截至 2026-10-19。營運視圖使用獨立月份與鍵值，不套用上方銷售公司／客戶切片。', 'Synthetic data through 2026-10-19. Operations use an independent month and keyspace; global sales company/customer filters do not apply.')}</p>
      <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">{kind === 'production' ? tr('ProductionDate · 排程作業 OEE，非整廠班次稼動率；比率由加總分子／分母計算。', 'ProductionDate · Scheduled-job OEE, not whole-plant shift utilization; ratios use aggregate numerators/denominators.') : kind === 'fulfilment' ? tr('ActualShipDate 已交表現與 AsOfDate 固定快照分開呈現；切換月份不改動 2026-10-19 積壓。', 'ActualShipDate delivery and AsOfDate snapshot are separate; changing month does not change 2026-10-19 backlog.') : tr('EventDate 實際對 MonthStart 月計畫；to-date 依截至固定資料日的平日比例，無國定假日日曆。', 'EventDate actuals versus MonthStart plans; to-date uses weekdays elapsed through the fixed cutoff, without a national holiday calendar.')}</p>
      {kind === 'budget' && <label className="block mt-3 text-sm">{tr('計畫口徑', 'Plan basis')} <select className="ml-2 p-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900" value={mode} onChange={e => setMode(e.target.value as 'full' | 'toDate')}><option value="toDate">{tr('截至資料日計畫', 'To-date plan')}</option><option value="full">{tr('完整月計畫', 'Full-month plan')}</option></select></label>}
    </header>
    {(error || data?.status === 'unavailable') ? <section role="alert" className={card}><h2 className="text-lg font-semibold">{tr('營運來源暫時無法使用', 'Operations source unavailable')}</h2><p className="my-3">{error || data?.error?.message}</p><button className={button} onClick={() => setRevision(r => r + 1)}>{tr('重試', 'Retry')}</button></section> : !data ? <section role="status" className={card}>{tr('讀取獨立營運來源…', 'Loading operations source…')}</section> : <>
      {data.status === 'no_data' && <p role="status" className={card}>{tr('所選範圍沒有數值；空值保留為 —。', 'No numeric data for the requested scope; nulls remain —.')}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{kpis.map(item => <section key={item.label} className={card}><h2 className="text-sm text-slate-600 dark:text-slate-400">{item.label}</h2><p className="text-3xl font-semibold tabular-nums mt-3">{fmt(item.value, item.ratio)} <span className="text-sm font-normal">{item.suffix}</span></p><p className="mt-2 text-sm text-slate-500">{kind === 'fulfilment' && item.label.includes(zh ? '快照' : 'snapshot') ? 'AsOfDate 2026-10-19' : month}</p></section>)}</div>
      {kind === 'production' && <>
        <section className={card}><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-semibold">{tr('機台時間模式 · 相同 0–100% 尺度', 'Machine patterns · shared 0–100% scale')}</h2><p className="text-sm text-slate-500 mt-1">{tr('按所選月指標由低到高排序；唯一鍵包含公司。缺月保留斷點。', 'Sorted by selected-month metric, low to high; identity includes company. Missing months remain gaps.')}</p></div><label className="text-sm">{tr('指標', 'Metric')} <select className="p-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900" value={metric} onChange={e => setMetric(e.target.value as typeof metric)}><option>Scheduled Job OEE %</option><option>Scrap Rate %</option></select></label></div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">{(allMachines ? machines : machines.slice(0, 6)).map(machine => <div className="rounded-lg border border-slate-100 dark:border-slate-800 p-3" key={text(machine, 'machine_key')}><h3 className="font-medium">{text(machine, 'machine_label')}</h3><p className="text-sm text-slate-500">{text(machine, 'company_label')}</p><EChartsContainer height="160px" option={{ ...base, grid: { left: 5, right: 8, top: 16, bottom: 10, containLabel: true }, xAxis: { type: 'category', data: productionMonths.map(m => m.slice(0, 4) + '-' + m.slice(4)), axisLabel: { color } }, yAxis: { type: 'value', min: 0, max: 100, axisLabel: { formatter: pct, color } }, series: [{ name: metric, type: 'line', connectNulls: false, data: productionMonths.map(m => { const v = number(histories.find(row => row.machine_key === machine.machine_key && row.company_key === machine.company_key && row.month_key === m), metric); return v === null ? null : v * 100; }), itemStyle: { color: '#3b82f6' } }] }} /></div>)}</div>
          {machines.length > 6 && <button className={`${button} mt-4`} onClick={() => setAllMachines(v => !v)}>{allMachines ? tr('顯示前 6 台', 'Show first 6 machines') : tr(`顯示全部 ${machines.length} 台（目前 6 台）`, `Show all ${machines.length} machines (6 shown)`)}</button>}
        </section>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5"><section className={card}><h2 className="text-lg font-semibold">{tr('停機原因 · 分鐘與完整母體累計', 'Downtime reasons · minutes & full-population cumulative share')}</h2><EChartsContainer height="300px" option={{ ...base, legend: { textStyle: { color }, top: 4 }, xAxis: { type: 'category', data: reasons.map(r => text(r, 'reason_label')), axisLabel: { color } }, yAxis: [{ type: 'value', name: 'min', axisLabel: { color } }, { type: 'value', min: 0, max: 100, axisLabel: { color, formatter: pct } }], series: [{ name: tr('分鐘', 'Minutes'), type: 'bar', data: reasonValues, itemStyle: { color: '#3b82f6' } }, ...(validPareto ? [{ name: tr('累計 %', 'Cumulative %'), type: 'line', yAxisIndex: 1, data: cumulativeValues, itemStyle: { color: '#d97706' } }] : [])] }} /><p className="text-sm text-slate-500">{tr('累計只用完整非負分鐘母體；未預設 80/20 或管理門檻。', 'Cumulative share requires complete nonnegative minutes; no assumed 80/20 law or management threshold.')}</p></section>
          <section className={card}><h2 className="text-lg font-semibold">{tr('機台當月與前月 OEE · 百分點差異', 'Machine OEE · current versus prior month')}</h2><p className="text-sm text-slate-500 mt-1">{previousMonth(month)} → {month} · {tr('完整數值與報廢 KG 見下方機台表', 'Exact values and scrap KG in the machine table below')}</p><p className="text-sm text-slate-500 mt-2">{tr('圖示前 6 台；完整比較表如下。', 'First 6 machines in chart; complete comparison table below.')}</p><EChartsContainer height="280px" option={productionComparisonOption} /><div className="overflow-auto max-h-80 mt-3"><table className="w-full text-sm"><thead><tr><th className="text-left p-2">{tr('機台', 'Machine')}</th><th>{tr('前月', 'Prior')}</th><th>{tr('當月', 'Current')}</th><th>Δ pp</th></tr></thead><tbody>{machines.map(machine => { const current = number(machine, 'Scheduled Job OEE %'); const prior = number(histories.find(r => r.company_key === machine.company_key && r.machine_key === machine.machine_key && r.month_key === previousMonth(month)), 'Scheduled Job OEE %'); return <tr key={text(machine, 'machine_key')}><th className="text-left p-2 font-normal">{text(machine, 'machine_label')}</th><td className="text-right p-2">{fmt(prior, true)}</td><td className="text-right p-2">{fmt(current, true)}</td><td className="text-right p-2">{current === null || prior === null ? '—' : ((current - prior) * 100).toFixed(2)}</td></tr>; })}</tbody></table></div></section></div>
      </>}
      {kind === 'fulfilment' && <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <section className={card}><h2 className="text-lg font-semibold">{tr('交付表現 · ActualShipDate', 'Delivery performance · ActualShipDate')}</h2><p className="text-sm text-slate-500 mt-1">{tr('最近六個月，終點為所選月；分母只包含已交行。', 'Six months ending in selected month; denominator includes shipped lines only.')}</p><EChartsContainer height="300px" option={{ ...base, xAxis: { type: 'category', data: deliveryPeriods.map(key => key.slice(0, 4) + '-' + key.slice(4)), axisLabel: { color } }, yAxis: { type: 'value', min: 0, max: 100, axisLabel: { color, formatter: pct } }, series: [{ name: tr('準交率 %', 'On-time %'), type: 'line', connectNulls: false, data: deliveryRows.map(r => { const v = number(r, 'On Time Delivery %'); return v === null ? null : v * 100; }), itemStyle: { color: '#3b82f6' } }] }} /><p className="text-sm text-slate-500">{tr('無出貨時準交率為 —；已交／準交行數與延遲日總數保留於表格。', 'No shipments means — on-time rate; shipped/on-time lines and late-day sum remain in the table.')}</p></section>
        <section className={card}><h2 className="text-lg font-semibold">{tr('未交壓力 · AsOfDate 2026-10-19', 'Open-order pressure · AsOfDate 2026-10-19')}</h2><p className="text-sm text-slate-500 mt-1">{tr('固定快照，非所選月月底；互斥帳齡帶，單位 CNY。', 'Fixed snapshot, not the selected month-end; mutually exclusive aging bands in CNY.')}</p><EChartsContainer height="300px" option={{ ...base, legend: { textStyle: { color }, top: 4 }, grid: { ...base.grid, top: 64 }, xAxis: { type: 'value', name: 'CNY', axisLabel: { color } }, yAxis: { type: 'category', data: backlogCompanyNames, axisLabel: { color } }, series: bandKeys.map((band, i) => ({ name: text(rows('backlogAging').find(r => r.aging_key === band)!, 'aging_label'), type: 'bar', stack: 'backlog', itemStyle: { color: ['#3b82f6', '#60a5fa', '#f59e0b', '#f97316', '#e11d48'][i % 5] }, data: backlogCompanyKeys.map(company => number(rows('backlogAging').find(r => r.company_key === company && r.aging_key === band), 'Backlog CNY')) })) }} /><p className="text-sm text-slate-500">{tr('缺值保留 —；沒有歷史快照，不呈現積壓月份趨勢。', 'Nulls remain —; historical backlog trends are unavailable.')}</p></section>
      </div>}
      {kind === 'budget' && <>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5"><section className={card}><h2 className="text-lg font-semibold">{tr('公司實際對合法計畫', 'Company actuals versus valid plan')}</h2><p className="text-sm text-slate-500 mt-1">CNY · {targetLabel} · {tr('藍條實際／橙線計畫，無績效色帶', 'Blue actual / orange plan marker, no performance bands')}</p><EChartsContainer height="340px" option={{ ...base, xAxis: { type: 'value', name: 'CNY', axisLabel: { color } }, yAxis: { type: 'category', data: companyNames, axisLabel: { color } }, series: [{ name: tr('實際', 'Actual'), type: 'bar', barMaxWidth: 24, data: companies.map(r => number(r, 'Net Sales CNY')), itemStyle: { color: '#3b82f6' } }, { name: targetLabel, type: 'scatter', symbol: 'rect', symbolSize: [3, 32], data: companies.map((r, i) => { const v = number(r, target); return v === null ? null : [v, i]; }), itemStyle: { color: '#d97706' } }] }} /></section>
          <section className={card}><h2 className="text-lg font-semibold">{tr('公司差額對帳瀑布', 'Company gap reconciliation waterfall')}</h2><p className="text-sm text-slate-500 mt-1">CNY · {tr('實際 − 計畫；全部公司與總差額', 'Actual − plan; all companies and total gap')}</p>{validGap ? <EChartsContainer height="340px" option={budgetWaterfallOption} /> : <p className="mt-6">{tr('差額含空值，無法形成完整瀑布；詳見原始表。', 'Null gaps prevent a complete waterfall; inspect source rows below.')}</p>}</section></div>
        <section className={card}><h2 className="text-lg font-semibold">{tr('公司計畫差額的持續性 · 同一 CNY 尺度', 'Persistence of company plan gaps · shared CNY scale')}</h2><EChartsContainer height="320px" option={{ ...base, legend: { textStyle: { color }, top: 4 }, xAxis: { type: 'category', data: dataset('companyHistory')?.period || [], axisLabel: { color } }, yAxis: { type: 'value', name: 'CNY', axisLabel: { color } }, series: companies.map(company => ({ name: text(company, 'company_label'), type: 'line', connectNulls: false, data: ((dataset('companyHistory')?.period as string[]) || []).map(m => number(rows('companyHistory').find(r => r.company_key === company.company_key && r.month_key === m), gap)) })) }} /></section>
      </>}
      <details className={card} open><summary className="cursor-pointer text-lg font-semibold">{tr('精確數值、CSV 與可追溯證據', 'Exact values, CSV & traceable evidence')}</summary><p className="text-sm text-slate-500 my-3">{tr('KPI、圖表、表格和 CSV 使用同一版本回應。百分比不相加；空白 CSV 數值代表 null。', 'KPIs, charts, tables and CSV use the same response. Percentages are not summed; blank CSV numeric cells mean null.')}</p><div className="space-y-4">{data.datasets.map(table)}</div></details>
      <details className={card}><summary className="cursor-pointer font-semibold">{tr('來源與查詢收據', 'Source & query receipts')}</summary><p className="text-sm my-3 break-all">{data.source.database} / {data.source.cube} · {data.source.currency} · {data.source.dataset} · synthetic · as-of {data.source.asOf}<br />{data.evidence.requestId} · {data.evidence.queriedAt}</p><p className="text-sm mb-3">{data.evidence.nullPolicy}<br />{data.evidence.snapshotPolicy}</p>{data.datasets.map(d => <details key={d.name} className="border-t border-slate-200 dark:border-slate-700 py-3"><summary className="cursor-pointer break-all">{d.name} · {d.status} · {d.dateRole} · {d.grain.join(' × ') || 'All'}<br /><span className="text-sm font-mono">SHA256 {d.queryHash}</span></summary><pre className="whitespace-pre-wrap break-all text-sm mt-3">{d.query}</pre><p className="text-sm mt-2">{d.measures.join(' · ')}</p></details>)}</details>
    </>}
  </main>;
};
export default OperationsDashboard;
