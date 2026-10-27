import React, { useEffect, useMemo, useState } from 'react';
import { Filters } from '../types/sales';
import { useSalesDashboard } from '../services/salesApi';
import { StateGuard } from '../components/common/StateGuard';
import { KpiCard } from '../components/charts/KpiCard';
import { EChartsContainer } from '../components/charts/EChartsContainer';
import { AiInsightCard } from '../components/ai/AiInsightCard';
import { useApp } from '../context/AppContext';
import { getFilterSummaryLabels } from '../utils/slicerData';
import {
  downloadCsv,
  exportSalesRowsCsv,
  fmtCount,
  fmtKG,
  fmtObservation,
  fmtPercent,
  fmtUSD,
} from '../utils/salesFormat';

const escapeHtml = (v: string) => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string));

interface Props {
  slicer: Filters;
  onNavigate?: (dashboardId: string) => void;
}

export const D18ExceptionMonitor: React.FC<Props> = ({ slicer }) => {
  const { theme, lang, openDrillDown, metadata, setLastDashboardContext } = useApp();
  const isDark = theme === 'dark';
  const isZh = lang === 'zh-TW';

  const { phase, data, error, reload } = useSalesDashboard('D18', slicer, setLastDashboardContext);
  const state =
    phase === 'pending'
      ? 'LOADING'
      : phase === 'no_data'
      ? 'NO_DATA'
      : phase === 'error'
      ? 'ERROR'
      : 'READY';

  const summaryLabels = getFilterSummaryLabels(slicer, metadata, isZh);
  const kpis = data?.kpis;
  const observations = data?.analysis?.observations || [];
  const products = data?.datasets?.products || [];
  const customers = data?.datasets?.customers || [];
  const [customerSearch, setCustomerSearch] = useState('');
  // Ranking dimension: counts (Lines) and amounts (KG) are NEVER mixed in one scale.
  type RankField = 'negativeMarginLineCount' | 'fullReturnLineCount' | 'partialReturnLineCount' | 'allowanceLineCount' | 'returnQtyKG';
  const [rankField, setRankField] = useState<RankField>('negativeMarginLineCount');
  // Local product selection by stable key: highlight first, drill only on explicit action.
  const [selectedProductKey, setSelectedProductKey] = useState<string | null>(null);
  useEffect(() => {
    setSelectedProductKey(null);
  }, [slicer.month, slicer.company, slicer.product, slicer.customer, slicer.salesperson, slicer.plant, slicer.costCenter]);
  const rankMeta: Record<RankField, { unit: 'Lines' | 'KG' }> = {
    negativeMarginLineCount: { unit: 'Lines' },
    fullReturnLineCount: { unit: 'Lines' },
    partialReturnLineCount: { unit: 'Lines' },
    allowanceLineCount: { unit: 'Lines' },
    returnQtyKG: { unit: 'KG' },
  };
  const rankLabel = (field: RankField): string => {
    switch (field) {
      case 'negativeMarginLineCount': return isZh ? '負毛利行數' : 'Negative-margin lines';
      case 'fullReturnLineCount': return isZh ? '全退行數' : 'Full-return lines';
      case 'partialReturnLineCount': return isZh ? '部退行數' : 'Partial-return lines';
      case 'allowanceLineCount': return isZh ? '折讓行數' : 'Allowance lines';
      case 'returnQtyKG': return isZh ? '退貨量 (KG)' : 'Return qty (KG)';
      default: return field;
    }
  };
  // One metric at a time, Top 10 products. Nulls sort last and stay visible as dash.
  const rankedByField = useMemo(
    () =>
      [...products]
        .sort((a, b) => {
          const av = a[rankField] ?? -Infinity;
          const bv = b[rankField] ?? -Infinity;
          if (av === -Infinity && bv === -Infinity) return a.key.localeCompare(b.key);
          if (av === -Infinity) return 1;
          if (bv === -Infinity) return -1;
          return (bv as number) - (av as number) || a.key.localeCompare(b.key);
        })
        .slice(0, 10),
    [products, rankField]
  );
  const selectedProduct = selectedProductKey
    ? products.find((p) => p.key === selectedProductKey) ?? null
    : null;
  // Independent exception counts per flag: never summed across overlapping categories.
  const exceptionCounts = useMemo(() => {
    const flagged = (field: 'negativeMarginLineCount' | 'fullReturnLineCount' | 'partialReturnLineCount' | 'allowanceLineCount') =>
      products.filter((p) => (p[field] ?? 0) > 0).length;
    return {
      negProducts: flagged('negativeMarginLineCount'),
      fullProducts: flagged('fullReturnLineCount'),
      partialProducts: flagged('partialReturnLineCount'),
      allowProducts: flagged('allowanceLineCount'),
      negCustomers: customers.filter((c) => (c.negativeMarginLineCount ?? 0) > 0).length,
    };
  }, [products, customers]);
  const openProductDrill = (p: (typeof products)[number]) => {
    openDrillDown({
      title: isZh ? `${p.key} (${p.label}) 銷售觀察下鑽` : `${p.key} (${p.label}) Observation Drill-Down`,
      dimensionName: isZh ? '產品' : 'Product',
      dimensionValue: p.key,
      sourceDashboard: 'D18',
      groupBy: 'customer',
      filterOverrides: { product: p.key },
      summaryMetrics: [
        { label: isZh ? '負毛利行數' : 'Neg Margin Lines', value: fmtCount(p.negativeMarginLineCount) },
        { label: isZh ? '全退行數' : 'Full Returns', value: fmtCount(p.fullReturnLineCount) },
        { label: isZh ? '部退行數' : 'Partial Returns', value: fmtCount(p.partialReturnLineCount) },
        { label: isZh ? '折讓行數' : 'Allowances', value: fmtCount(p.allowanceLineCount) },
        { label: isZh ? '退貨量' : 'Return Qty', value: fmtKG(p.returnQtyKG, 2) },
      ],
      rows: [],
    });
  };
  const rankUnit = rankMeta[rankField].unit;
  const rankOption = useMemo(() => {
    const barColor = rankUnit === 'KG' ? (isDark ? '#2dd4bf' : '#0d9488') : (isDark ? '#818cf8' : '#4f46e5');
    const labelColor = isDark ? '#cbd5e1' : '#334155';
    const mutedColor = isDark ? '#94a3b8' : '#64748b';
    const splitColor = isDark ? '#1e293b' : '#e2e8f0';
    const fmtValue = (v: number | null | undefined): string =>
      v === null || v === undefined || !Number.isFinite(v)
        ? '—'
        : rankUnit === 'KG'
          ? fmtKG(v, 2)
          : fmtCount(v);
    return {
      title: {
        text: isZh
          ? `產品${rankLabel(rankField)}排行 Top 10（單位 ${rankUnit}，單一指標）`
          : `Product ${rankLabel(rankField)} Top 10 (unit ${rankUnit}, single metric)`,
        subtext: isZh
          ? `同一時間只排一種指標，不與其他單位混排；空值排最後並顯示為 —，仍保留於明細。旗標可能重疊，不可跨類加總。點選只高亮不篩選。`
          : `One metric at a time, never mixed with other units; nulls sort last as — and stay in the table. Flags may overlap and must not be summed. Click highlights only.`,
        subtextStyle: { fontSize: 11, color: mutedColor },
        textStyle: { fontSize: 14, fontWeight: 'bold', color: labelColor },
      },
      tooltip: {
        trigger: 'item' as const,
        confine: true,
        textStyle: { fontSize: 12 },
        extraCssText: 'max-width:380px;white-space:normal;',
        formatter: (params: { dataIndex?: unknown }) => {
          const p = typeof params?.dataIndex === 'number' ? rankedByField[params.dataIndex] : undefined;
          if (!p) return '';
          const v = p[rankField];
          return `<div style="font-size:12px;line-height:1.45">
            <div><b>${escapeHtml(p.label || '—')}</b></div>
            <div style="font-family:ui-monospace,monospace">${escapeHtml(p.key)}</div>
            <div>${escapeHtml(rankLabel(rankField))}: ${fmtValue(v)}${rankUnit === 'Lines' && v !== null ? ' Lines' : ''}</div>
            <div>${isZh ? '點選只高亮，再用橫幅下鑽客戶' : 'Click highlights; drill into customers from the banner'}</div>
          </div>`;
        },
      },
      grid: { left: 8, right: 72, top: 24, bottom: 8, containLabel: true },
      xAxis: {
        type: 'value' as const,
        min: (bound: { min: number }) => Math.min(0, Number.isFinite(bound.min) ? bound.min : 0),
        max: (bound: { max: number }) => Math.max(0, Number.isFinite(bound.max) ? bound.max : 0),
        axisLabel: {
          color: mutedColor,
          fontSize: 12,
          formatter: (value: number) => (rankUnit === 'KG'
            ? (Math.abs(value) >= 10000 ? `${Math.round(value / 1000)}k` : `${value}`)
            : fmtCount(value)),
        },
        axisLine: { show: true, onZero: true, lineStyle: { color: '#64748b', width: 1.25 } },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: splitColor } },
      },
      yAxis: {
        type: 'category' as const,
        inverse: true,
        data: rankedByField.map((p) => p.key),
        axisLabel: { color: labelColor, fontSize: 12, width: 150, overflow: 'truncate' as const, margin: 8 },
        axisTick: { show: false },
        axisLine: { show: false },
      },
      series: [
        {
          name: rankLabel(rankField),
          type: 'bar' as const,
          cursor: 'pointer',
          barMaxWidth: 18,
          label: {
            show: true,
            position: 'right' as const,
            fontSize: 11,
            color: mutedColor,
            formatter: (p: { value?: unknown }) => {
              const raw = p && typeof p.value === 'object' && p.value !== null
                ? (p.value as { value?: unknown }).value
                : p?.value;
              return fmtValue(typeof raw === 'number' ? raw : null);
            },
          },
          data: rankedByField.map((p) => ({
            value: p[rankField],
            itemStyle:
              selectedProductKey !== null && p.key === selectedProductKey
                ? { color: '#312e81', borderRadius: [0, 3, 3, 0] }
                : { color: barColor, opacity: selectedProductKey === null ? 0.9 : 0.35, borderRadius: [0, 3, 3, 0] },
          })),
        },
      ],
    };
  }, [rankedByField, rankField, rankUnit, selectedProductKey, isZh, isDark]);

  const filteredCustomers = customers.filter(
    (c) =>
      !customerSearch.trim() ||
      c.key.toLowerCase().includes(customerSearch.trim().toLowerCase()) ||
      c.label.toLowerCase().includes(customerSearch.trim().toLowerCase())
  );

  // Severity ordering uses ONE documented actual measure: negative-margin line count.
  // The four observation categories may overlap (one line can carry several flags),
  // so counts are never summed; heatmap cells show each category independently (unit: Lines).
  const rankedProducts = [...products].sort((a, b) => {
    const av = a.negativeMarginLineCount ?? -1;
    const bv = b.negativeMarginLineCount ?? -1;
    return bv - av || a.key.localeCompare(b.key);
  });
  const topProducts = rankedProducts.slice(0, 12);

  const obsTypes = [
    { field: 'negativeMarginLineCount' as const, label: isZh ? '負毛利行數' : 'Negative Margin Lines' },
    { field: 'fullReturnLineCount' as const, label: isZh ? '全退行數' : 'Full Return Lines' },
    { field: 'partialReturnLineCount' as const, label: isZh ? '部退行數' : 'Partial Return Lines' },
    { field: 'allowanceLineCount' as const, label: isZh ? '折讓行數' : 'Allowance Lines' },
  ];

  const heatData: Array<[number, number, number | null]> = [];
  topProducts.forEach((p, y) => {
    obsTypes.forEach((t, x) => {
      heatData.push([x, y, p[t.field] ?? null]);
    });
  });
  const maxCell =
    heatData.reduce<number>((m, d) => (d[2] !== null && d[2] > m ? d[2] : m), 0) || 1;

  const heatmapOption = {
    title: {
      text: isZh
        ? `產品 × 觀察類型熱力圖（按負毛利行數排序 Top 12／共 ${products.length} 項）`
        : `Product × Observation-Type Heatmap (Top 12 of ${products.length} by Negative Margin Lines)`,
      subtext: isZh
        ? '排序依據：負毛利行數；單位 Lines；四類可能重疊，計數不可加總；無人工閾值'
        : 'Ordered by negative-margin line count; unit Lines; categories may overlap, counts are not additive; no invented thresholds',
      subtextStyle: { fontSize: 11, color: isDark ? '#94a3b8' : '#64748b' },
      textStyle: { fontSize: 14, fontWeight: 'bold', color: isDark ? '#f1f5f9' : '#0f172a' },
    },
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const [x, y, v] = params.value as [number, number, number | string | null];
        const p = topProducts[y];
        if (!p) return '';
        return `<strong>${escapeHtml(p.key)} (${escapeHtml(p.label)})</strong><br/>${obsTypes[x].label}: ${
          v === null || v === '-' ? '—' : `${fmtCount(Number(v))} Lines`
        }`;
      },
    },
    grid: { left: '4%', right: '10%', bottom: 82, top: '24%', containLabel: true },
    xAxis: {
      type: 'category',
      data: obsTypes.map((t) => t.label),
      axisLabel: {
        fontSize: 12, interval: 0, color: isDark ? '#cbd5e1' : '#334155',
        formatter: (_value: string, index: number) => isZh
          ? ['負毛利', '全退', '部退', '折讓'][index]
          : ['Neg.\nmargin', 'Full\nreturn', 'Partial\nreturn', 'Allow-\nance'][index],
      },
      splitArea: { show: true },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: topProducts.map((p) => p.key),
      axisLabel: { fontSize: 12, color: isDark ? '#cbd5e1' : '#334155' },
      splitArea: { show: true },
    },
    visualMap: {
      min: 0,
      max: maxCell,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      textStyle: { fontSize: 11, color: isDark ? '#94a3b8' : '#64748b' },
      inRange: {
        color: isDark ? ['#1e293b', '#60a5fa'] : ['#eff6ff', '#1d4ed8'],
      },
    },
    series: [
      {
        name: isZh ? '觀察行數 (Lines)' : 'Observation Lines',
        type: 'heatmap',
        data: heatData.map(([x, y, v]) => ({ value: [x, y, v ?? '-'], itemStyle: { opacity: selectedProductKey === null || topProducts[y].key === selectedProductKey ? 1 : .3 } })),
        label: {
          show: true,
          fontSize: 12,
          rich: {
            light: { color: '#ffffff', fontSize: 12, fontWeight: 'bold' },
            dark: { color: '#000000', fontSize: 12, fontWeight: 'bold' },
          },
          formatter: (params: any) => {
            const v = params.value[2];
            const ratio = Math.max(0, Math.min(1, Number(v) / maxCell));
            const start = isDark ? [30, 41, 59] : [239, 246, 255];
            const end = isDark ? [96, 165, 250] : [29, 78, 216];
            const linear = start.map((channel, i) => {
              const c = (channel + (end[i] - channel) * ratio) / 255;
              return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            });
            const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
            const ink = luminance > 0.179 ? 'dark' : 'light';
            return `{${ink}|${v === '-' ? '—' : fmtCount(Number(v))}}`;
          },
        },
        itemStyle: {
          borderColor: isDark ? '#0f172a' : '#ffffff',
          borderWidth: 2,
        },
        emphasis: {
          itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.3)' },
        },
      },
    ],
  };

  const handleExportObservationsCsv = () => {
    downloadCsv(
      `D18_Observations_${slicer.month}.csv`,
      ['Code', 'Label', 'Value', 'Unit'],
      observations.map((o) => [o.code, o.label, o.value, o.unit])
    );
  };

  return (
    <div className="sales-dashboard">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {isZh ? 'D18 銷售觀察 (Sales Observations)' : 'D18 Sales Observations'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isZh
              ? '彙總 SSAS 實際退貨行數、部分退貨行數、折讓行數與負毛利交易行數之客觀觀察紀錄'
              : 'Objective SSAS observation counts for full returns, partial returns, allowances, and negative-margin lines'}
          </p>
        </div>
        {observations.length > 0 && (
          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportObservationsCsv}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 cursor-pointer"
            >
              {isZh ? '📥 匯出銷售觀察 CSV' : '📥 Export Observations CSV'}
            </button>
          </div>
        )}
      </div>

      <StateGuard
        state={state}
        error={error ? { code: error.code, reason: error.message } : null}
        onRetry={reload}
      >
        {kpis && (
          <>
            {selectedProduct && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-indigo-50/70 dark:bg-indigo-950/40 px-4 py-3 mb-4">
                <div className="text-xs text-slate-700 dark:text-slate-200">
                  {isZh ? '已選產品（僅高亮，未篩選）' : 'Selected product (highlighted, not filtered)'}:{' '}
                  <span className="font-bold text-indigo-700 dark:text-indigo-300">{selectedProduct.label}</span>
                  <span className="ml-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">{selectedProduct.key}</span>
                  <span className="ml-2 font-mono">
                    {fmtCount(selectedProduct.negativeMarginLineCount)} / {fmtCount(selectedProduct.fullReturnLineCount)} / {fmtCount(selectedProduct.partialReturnLineCount)} / {fmtCount(selectedProduct.allowanceLineCount)}
                  </span>
                </div>
                <div className="flex items-center gap-2 sm:ml-auto">
                  <button
                    type="button"
                    onClick={() => openProductDrill(selectedProduct)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white border border-indigo-600 cursor-pointer"
                  >
                    {isZh ? '下鑽該產品客戶 ➔' : 'Drill into customers ➔'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedProductKey(null)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 cursor-pointer"
                  >
                    {isZh ? '清除選擇' : 'Reset selection'}
                  </button>
                </div>
              </div>
            )}
          <>
          </>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                title={isZh ? '負毛利明細行數' : 'Negative Margin Lines'}
                value={fmtCount(kpis.negativeMarginLineCount)}
                subValue={`${isZh ? '總行數' : 'Total Lines'}: ${fmtCount(kpis.salesLineCount)}`}
                trend="neutral"
                footnote={isZh ? 'Gross Profit < 0 之交易行' : 'Sales lines with Gross Profit < 0'}
                drillThroughTarget="D08"
              />
              <KpiCard
                title={isZh ? '全額退貨行數 (Full Return)' : 'Full Return Lines'}
                value={fmtCount(kpis.fullReturnLineCount)}
                subValue={fmtKG(kpis.returnQtyKG)}
                trend="neutral"
                footnote={isZh ? `退貨率: ${fmtPercent(kpis.returnRatePercent)}` : `Return Rate: ${fmtPercent(kpis.returnRatePercent)}`}
              />
              <KpiCard
                title={isZh ? '部分退貨行數 (Partial Return)' : 'Partial Return Lines'}
                value={fmtCount(kpis.partialReturnLineCount)}
                subValue={fmtPercent(kpis.returnRatePercent)}
                trend="neutral"
                footnote={isZh ? '含部分退回數量之明細行' : 'Lines with partial return quantity'}
              />
              <KpiCard
                title={isZh ? '折讓明細行數 (Allowance)' : 'Allowance Lines'}
                value={fmtCount(kpis.allowanceLineCount)}
                subValue={fmtUSD(kpis.netSalesUSD)}
                trend="neutral"
                footnote={isZh ? '含價格折讓之交易明細行' : 'Sales lines with price allowances'}
              />
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <EChartsContainer
                option={heatmapOption}
                height="420px"
                onEvents={{
                  click: (params: any) => {
                    const v = params.value as [number, number, number | string] | undefined;
                    const p = v ? topProducts[v[1]] : undefined;
                    if (p) setSelectedProductKey(prev => prev === p.key ? null : p.key);
                  },
                }}
              />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {isZh
                  ? '註：負毛利、全退、部退、折讓四類旗標可能重疊，不能相加成唯一事件數。點選只高亮同一產品；用上方已選產品橫幅明確下鑽。'
                  : 'Flags can overlap and must not be summed into unique events. Clicking highlights the same product; use the selected-product banner to drill explicitly.'}
              </p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              <div className="xl:col-span-7 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label={isZh ? '排行指標' : 'Ranking metric'}>
                  {(['negativeMarginLineCount', 'fullReturnLineCount', 'partialReturnLineCount', 'allowanceLineCount', 'returnQtyKG'] as RankField[]).map((field) => (
                    <button
                      key={field}
                      type="button"
                      aria-pressed={rankField === field}
                      onClick={() => setRankField(field)}
                      className={rankField === field
                        ? 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white border border-indigo-600 cursor-pointer'
                        : 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 cursor-pointer'}
                    >
                      {rankLabel(field)}
                    </button>
                  ))}
                </div>
                <EChartsContainer
                  option={rankOption}
                  height={`${Math.max(300, 110 + rankedByField.length * 34)}px`}
                  onEvents={{
                    click: (params: { dataIndex?: unknown }) => {
                      const p = typeof params?.dataIndex === 'number' ? rankedByField[params.dataIndex] : undefined;
                      if (!p) return;
                      setSelectedProductKey((prev) => (prev === p.key ? null : p.key));
                    },
                  }}
                />
              </div>

              <div className="xl:col-span-5 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white break-words">
                  {isZh ? '例外概覽（各旗標獨立計數，不加總）' : 'Exception overview (independent counts, never summed)'}
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400 break-words">
                  {isZh
                    ? `共 ${products.length} 項產品。同一交易行可同時帶多個旗標，故各類計數不可相加為事件總數；此處只呈現實測計數，不設嚴重度。`
                    : `${products.length} products. One sales line may carry several flags, so category counts must not be added into an event total; actual counts only, no severity invented.`}
                </p>
                <div className="mt-2 space-y-1.5 text-xs tabular-nums">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400">{isZh ? '有負毛利行產品數' : 'Products with neg-margin lines'}</span>
                    <span className="font-bold text-rose-600 dark:text-rose-400">{exceptionCounts.negProducts}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400">{isZh ? '有全退行產品數' : 'Products with full returns'}</span>
                    <span className="font-bold">{exceptionCounts.fullProducts}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400">{isZh ? '有部退行產品數' : 'Products with partial returns'}</span>
                    <span className="font-bold">{exceptionCounts.partialProducts}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400">{isZh ? '有折讓行產品數' : 'Products with allowances'}</span>
                    <span className="font-bold">{exceptionCounts.allowProducts}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400">{isZh ? '有負毛利行客戶數' : 'Customers with neg-margin lines'}</span>
                    <span className="font-bold text-rose-600 dark:text-rose-400">{exceptionCounts.negCustomers}</span>
                  </div>
                </div>
              </div>
            </div>

            <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs" data-testid="product-observations-full">
              <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-bold">{isZh ? `完整產品觀察表（全體 ${products.length} 項）` : `Full product observations (${products.length} products)`}</h3><button type="button" disabled={!products.length} onClick={() => exportSalesRowsCsv(`D18_Product_Observations_${slicer.month}.csv`, products, 'ProductKey')} className="text-xs text-indigo-600 dark:text-indigo-300 underline disabled:opacity-40">{isZh ? '匯出完整產品 CSV' : 'Export all products CSV'}</button></div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{isZh ? '與上方圖表相同查詢版本；Top N 外產品與空值完整保留（—），各旗標獨立計數。選取只高亮；點「下鑽」才開啟客戶組合。' : 'Same query version as the charts; all products outside Top N and nulls (—) remain. Flags are counted independently. Selection highlights only; Drill opens the customer mix.'} · Request ID: {data?.evidence.requestId}</p>
              <div className="overflow-auto max-h-96 mt-3"><table className="w-full text-xs tabular-nums"><thead><tr><th className="p-2 text-left">{isZh ? '產品' : 'Product'}</th>{obsTypes.map(item => <th className="p-2 text-right whitespace-nowrap" key={item.field}>{item.label}</th>)}<th className="p-2 text-right whitespace-nowrap">{isZh ? '退貨量 KG' : 'Return qty KG'}</th><th className="p-2 text-right whitespace-nowrap">{isZh ? '淨銷售 USD' : 'Net sales USD'}</th><th className="p-2 text-right whitespace-nowrap">{isZh ? '毛利 USD' : 'Gross profit USD'}</th><th className="p-2">{isZh ? '分析' : 'Analysis'}</th></tr></thead><tbody>{products.map(product => <tr key={product.key} className={`border-t border-slate-200 dark:border-slate-700 ${selectedProductKey === product.key ? 'bg-indigo-50 dark:bg-indigo-950/50' : ''}`}><td className="p-2"><button type="button" aria-pressed={selectedProductKey === product.key} className="text-left text-indigo-600 dark:text-indigo-300 underline" onClick={() => setSelectedProductKey(prev => prev === product.key ? null : product.key)}>{product.label}<span className="block font-mono text-slate-500">{product.key}</span></button></td>{obsTypes.map(item => <td className="p-2 text-right" key={item.field}>{fmtCount(product[item.field])}</td>)}<td className="p-2 text-right">{fmtKG(product.returnQtyKG, 2)}</td><td className="p-2 text-right">{fmtUSD(product.netSalesUSD)}</td><td className="p-2 text-right">{fmtUSD(product.grossProfitUSD)}</td><td className="p-2"><button type="button" className="text-indigo-600 dark:text-indigo-300 underline whitespace-nowrap" onClick={() => openProductDrill(product)}>{isZh ? '下鑽' : 'Drill'}</button></td></tr>)}</tbody></table></div>
            </section>

            <AiInsightCard
              title={isZh ? 'D18 銷售觀察實測計數摘要' : 'D18 Sales Observations Summary'}
              data={{
                observed: isZh
                  ? `於 ${summaryLabels.monthLabel} (${summaryLabels.companyLabel}) 共 ${fmtCount(
                      kpis.salesLineCount
                    )} 筆銷售明細行中：負毛利行數 ${fmtCount(
                      kpis.negativeMarginLineCount
                    )} 行、全額退貨行數 ${fmtCount(
                      kpis.fullReturnLineCount
                    )} 行、部分退貨行數 ${fmtCount(
                      kpis.partialReturnLineCount
                    )} 行、折讓行數 ${fmtCount(
                      kpis.allowanceLineCount
                    )} 行；總退貨量 ${fmtKG(kpis.returnQtyKG)}（退貨率 ${fmtPercent(
                      kpis.returnRatePercent
                    )}）。`
                  : `Across ${fmtCount(
                      kpis.salesLineCount
                    )} sales lines in ${summaryLabels.monthLabel} (${summaryLabels.companyLabel}): Negative Margin Lines ${fmtCount(
                      kpis.negativeMarginLineCount
                    )}, Full Return Lines ${fmtCount(
                      kpis.fullReturnLineCount
                    )}, Partial Return Lines ${fmtCount(
                      kpis.partialReturnLineCount
                    )}, Allowance Lines ${fmtCount(
                      kpis.allowanceLineCount
                    )}; Return Qty ${fmtKG(kpis.returnQtyKG)} (Return Rate ${fmtPercent(
                      kpis.returnRatePercent
                    )}).`,
                interpretation: isZh
                  ? '熱力圖列按負毛利行數排序（Top 12），各單元格為該類獨立實測行數；四類旗標可能重疊，不做任何跨類加總。本頁所有指標均為 SSAS Cube 直接聚合之實測發生次數與比例，不設定任何人工主觀警戒線或虛構異常門檻。'
                  : 'Heatmap rows are ordered by negative-margin lines (Top 12); each cell is an independent actual count per category. Categories may overlap and are never summed. All observation metrics are direct SSAS Cube counts and ratios without invented alert thresholds.',
                claimType: 'OBSERVATION',
                coverage: `${summaryLabels.monthLabel} · ${summaryLabels.companyLabel}`,
                confidence: 'SSAS Direct',
                evidenceId: data?.evidence?.requestId || 'D18',
                evidence: data?.evidence,
                source: data?.source,
                limitations: [
                  isZh
                    ? '僅呈現實際交易行數與退貨/折讓/負毛利統計，不捏造單筆訂單號'
                    : 'Shows actual line counts and return/allowance/negative-margin statistics without fabricated order IDs',
                ],
                nextSteps: [
                  isZh ? '進入 D08 檢視產品與成本中心獲利品質' : 'Go to D08 Profitability Quality',
                  isZh ? '進入 D06 檢視客戶退貨與毛利貢獻' : 'Go to D06 Customer Contribution',
                ],
              }}
            />

            {/* Structured Observations Cards from analysis.observations */}
            {observations.length > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
                  {isZh ? 'SSAS 認證銷售觀察指標清單 (analysis.observations)' : 'Certified Sales Observation Metrics'}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {observations.map((obs) => (
                    <div
                      key={obs.code}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-2xs font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                          {obs.code}
                        </div>
                        <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                          {obs.label}
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="text-base font-extrabold text-slate-900 dark:text-white">
                          {fmtObservation(obs.value, obs.unit)}
                        </div>
                        <div className="text-2xs text-slate-400">{obs.unit}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Customer & Product Observation Breakdown Table */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {isZh ? '各客戶退貨、折讓與負毛利明細行數統計表' : 'Customer Return, Allowance & Negative Margin Line Counts'}
                </h3>
                <div className="flex items-center space-x-2">
                  <button type="button" disabled={!customers.length} onClick={() => exportSalesRowsCsv(`D18_Customer_Observations_${slicer.month}.csv`, customers, 'CustomerKey')} className="text-xs text-indigo-600 dark:text-indigo-300 underline disabled:opacity-40">{isZh ? '匯出完整客戶 CSV' : 'Export all customers CSV'}</button>
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder={isZh ? '🔍 搜尋客戶名稱或代碼...' : '🔍 Search customer...'}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-48 sm:w-60"
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/70">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '客戶' : 'Customer'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '淨銷售額 (USD)' : 'Net Sales'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '退貨量 (KG)' : 'Return Qty (KG)'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '退貨率' : 'Return %'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '全退行數' : 'Full Return Lines'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '部退行數' : 'Partial Return Lines'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '折讓行數' : 'Allowance Lines'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '負毛利行數' : 'Neg GM Lines'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                    {filteredCustomers.map((c) => (
                      <tr
                        key={c.key}
                        onClick={() =>
                          openDrillDown({
                            title: isZh ? `${c.key} (${c.label}) 產品下鑽` : `${c.key} (${c.label}) Product Drill-Down`,
                            dimensionName: isZh ? '客戶' : 'Customer',
                            dimensionValue: c.key,
                            sourceDashboard: 'D18',
                            groupBy: 'product',
                            filterOverrides: { customer: c.key },
                            rows: [],
                          })
                        }
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-2 font-sans">
                          <div className="font-bold text-indigo-600 dark:text-indigo-400">{c.label}</div>
                          <div className="text-2xs font-mono text-slate-400">{c.key}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-bold">{fmtUSD(c.netSalesUSD)}</td>
                        <td className="px-3 py-2 text-right">{fmtKG(c.returnQtyKG)}</td>
                        <td className="px-3 py-2 text-right">{fmtPercent(c.returnRatePercent)}</td>
                        <td className="px-3 py-2 text-right">{fmtCount(c.fullReturnLineCount)}</td>
                        <td className="px-3 py-2 text-right">{fmtCount(c.partialReturnLineCount)}</td>
                        <td className="px-3 py-2 text-right">{fmtCount(c.allowanceLineCount)}</td>
                        <td className="px-3 py-2 text-right">
                          {c.negativeMarginLineCount && c.negativeMarginLineCount > 0 ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900">
                              ⚠ {fmtCount(c.negativeMarginLineCount)}
                            </span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </StateGuard>
    </div>
  );
};

export default D18ExceptionMonitor;
