import React, { useEffect, useState } from 'react';
import { ComparisonHistory } from '../composition/ComparisonHistory';
import { Filters } from '../types/sales';
import { useSalesDashboard } from '../services/salesApi';
import { StateGuard } from '../components/common/StateGuard';
import { KpiCard } from '../components/charts/KpiCard';
import { EChartsContainer } from '../components/charts/EChartsContainer';
import { AiInsightCard } from '../components/ai/AiInsightCard';
import { useApp } from '../context/AppContext';
import { getFilterSummaryLabels } from '../utils/slicerData';
import {
  DASH,
  exportSalesRowsCsv,
  fmtCount,
  fmtKG,
  fmtPercent,
  fmtPriceUSD,
  fmtSignedPercent,
  fmtUSD,
} from '../utils/salesFormat';

interface Props {
  slicer: Filters;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function exactUSD(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return DASH;
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}$${abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })}`;
}

function exactPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return DASH;
  return `${(value * 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}%`;
}

function exactKG(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return DASH;
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 6 })} KG`;
}

function axisUSD(value: number): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  const sign = amount < 0 ? '−' : '';
  const abs = Math.abs(amount);
  const body =
    abs >= 1_000_000
      ? `${(abs / 1_000_000).toFixed(1)}M`
      : abs >= 10_000
        ? `${Math.round(abs / 1000)}k`
        : abs.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return `${sign}$${body}`;
}

export const D13SalespersonPerformance: React.FC<Props> = ({ slicer }) => {
  const { theme, lang, openDrillDown, metadata, setLastDashboardContext } = useApp();
  const isDark = theme === 'dark';
  const isZh = lang === 'zh-TW';

  const { phase, data, error, reload } = useSalesDashboard('D13', slicer, setLastDashboardContext);
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
  const analysis = data?.analysis;
  const salespeople = data?.datasets?.salespeople || [];
  const topRep = salespeople[0];
  const repCount = salespeople.length;

  // Local selection by stable key: highlight first, drill only on explicit action.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  useEffect(() => {
    setSelectedKey(null);
  }, [slicer.month, slicer.company, slicer.product, slicer.customer, slicer.salesperson, slicer.plant, slicer.costCenter]);
  const selectedRep = selectedKey ? salespeople.find((row) => row.key === selectedKey) ?? null : null;

  // Primary comparison: current revenue + GP side by side (Top 15 bars, full list in table + CSV).
  const topReps = [...salespeople]
    .sort((a, b) => {
      const av = typeof a.netSalesUSD === 'number' && Number.isFinite(a.netSalesUSD) ? a.netSalesUSD : -Infinity;
      const bv = typeof b.netSalesUSD === 'number' && Number.isFinite(b.netSalesUSD) ? b.netSalesUSD : -Infinity;
      return bv - av || a.key.localeCompare(b.key);
    })
    .slice(0, 15);

  // Matrix population: both axes must be present. Null rows stay in table + CSV only.
  const matrixRows = salespeople.filter(
    (row) => row.netSalesUSD != null && row.grossMarginPercent != null
  );
  const absentCount = repCount - matrixRows.length;

  // Overall weighted GM% as the statistical reference line (not a target).
  const meanGm = kpis?.grossMarginPercent ?? null;
  const meanGmPct = meanGm === null ? null : meanGm * 100;

  const yoy = analysis?.yoyGrowth ?? null;
  const yoyTrend = yoy === null ? 'neutral' : yoy > 0 ? 'up' : yoy < 0 ? 'down' : 'neutral';

  const salesBlue = isDark ? '#60a5fa' : '#2563eb';
  const refSlate = '#64748b';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';
  const splitColor = isDark ? '#1e293b' : '#e2e8f0';
  const salesName = isZh ? '淨銷售額 (USD)' : 'Net sales (USD)';
  const gpName = isZh ? '毛利額 (USD)' : 'Gross profit (USD)';

  const openRepDrill = (row: (typeof salespeople)[number]) => {
    openDrillDown({
      title: isZh ? `${row.key} (${row.label}) 客戶實績下鑽` : `${row.key} (${row.label}) Customer Drill-Down`,
      dimensionName: isZh ? '業務員' : 'Salesperson',
      dimensionValue: row.key,
      sourceDashboard: 'D13',
      groupBy: 'customer',
      filterOverrides: { salesperson: row.key },
      summaryMetrics: [
        { label: isZh ? '淨銷售額' : 'Net Sales', value: fmtUSD(row.netSalesUSD) },
        { label: isZh ? '毛利額' : 'Gross Profit', value: fmtUSD(row.grossProfitUSD) },
        { label: isZh ? '毛利率' : 'GM %', value: fmtPercent(row.grossMarginPercent) },
        { label: isZh ? '訂單數' : 'Orders', value: fmtCount(row.orderCount) },
      ],
      rows: [],
    });
  };

  const teal = isDark ? '#2dd4bf' : '#0d9488';
  const barLabelColor = isDark ? '#cbd5e1' : '#334155';
  const repBarOption = {
    title: {
      text: isZh
        ? `業務員當期營收與毛利額對照 Top 15（共享 USD 尺度）`
        : `Rep revenue vs gross profit Top 15 (shared USD scale)`,
      subtext: isZh
        ? `依淨銷售額排序；藍=淨銷售額，深青=毛利額，零為基準。點選只高亮不篩選；全體 ${repCount} 位見明細與 CSV。無配額、無目標。`
        : `Ordered by net sales; blue = net sales, teal = gross profit, zero baseline. Click highlights only; all ${repCount} reps in table and CSV. No quota or target.`,
      subtextStyle: { fontSize: 11, color: mutedColor },
      textStyle: { fontSize: 14, fontWeight: 'bold', color: barLabelColor },
    },
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow' as const },
      confine: true,
      textStyle: { fontSize: 12 },
      extraCssText: 'max-width:380px;white-space:normal;',
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? (params as Array<{ dataIndex?: unknown }>) : [];
        const first = list[0];
        const row = first && typeof first.dataIndex === 'number' ? topReps[first.dataIndex] : undefined;
        if (!row) return '';
        return `<div style="font-size:12px;line-height:1.45">
          <div><b>${escapeHtml(row.label || DASH)}</b></div>
          <div style="font-family:ui-monospace,monospace">${escapeHtml(row.key)}</div>
          <div>${escapeHtml(salesName)}: ${exactUSD(row.netSalesUSD)}</div>
          <div>${escapeHtml(gpName)}: ${exactUSD(row.grossProfitUSD)}</div>
          <div>${isZh ? '毛利率' : 'GM %'}: ${exactPct(row.grossMarginPercent)}</div>
          <div>${isZh ? '訂單數' : 'Orders'}: ${fmtCount(row.orderCount)} / ${fmtCount(row.salesLineCount)} ${isZh ? '行' : 'lines'}</div>
          <div>${isZh ? '點選只高亮，再用橫幅下鑽客戶' : 'Click highlights; drill into customers from the banner'}</div>
        </div>`;
      },
    },
    legend: {
      type: 'scroll' as const,
      top: 0,
      textStyle: { color: barLabelColor, fontSize: 12 },
    },
    grid: { left: 8, right: 64, top: 56, bottom: 8, containLabel: true },
    xAxis: {
      type: 'value' as const,
      min: (bound: { min: number }) => Math.min(0, Number.isFinite(bound.min) ? bound.min : 0),
      max: (bound: { max: number }) => Math.max(0, Number.isFinite(bound.max) ? bound.max : 0),
      axisLabel: { color: mutedColor, fontSize: 12, formatter: (value: number) => axisUSD(value) },
      axisLine: { show: true, onZero: true, lineStyle: { color: refSlate, width: 1.25 } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: splitColor } },
    },
    yAxis: {
      type: 'category' as const,
      inverse: true,
      data: topReps.map((row) => (row.label.trim() ? row.label : row.key)),
      axisLabel: { color: barLabelColor, fontSize: 12, width: 150, overflow: 'truncate' as const, margin: 8 },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series: [
      {
        name: salesName,
        type: 'bar' as const,
        cursor: 'pointer',
        barMaxWidth: 14,
        label: {
          show: true,
          position: 'right' as const,
          fontSize: 11,
          color: mutedColor,
          formatter: (p: { value?: unknown }) => {
            const v = p && typeof p.value === 'object' && p.value !== null
              ? (p.value as { value?: unknown }).value
              : p?.value;
            return typeof v === 'number' && Number.isFinite(v) ? axisUSD(v) : DASH;
          },
        },
        data: topReps.map((row) => ({
          value: row.netSalesUSD,
          itemStyle:
            selectedKey !== null && row.key === selectedKey
              ? { color: '#4f46e5', borderRadius: [0, 3, 3, 0] }
              : { color: salesBlue, opacity: selectedKey === null ? 0.9 : 0.35, borderRadius: [0, 3, 3, 0] },
        })),
      },
      {
        name: gpName,
        type: 'bar' as const,
        cursor: 'pointer',
        barMaxWidth: 14,
        label: {
          show: true,
          position: 'right' as const,
          fontSize: 11,
          color: mutedColor,
          formatter: (p: { value?: unknown }) => {
            const v = p && typeof p.value === 'object' && p.value !== null
              ? (p.value as { value?: unknown }).value
              : p?.value;
            return typeof v === 'number' && Number.isFinite(v) ? axisUSD(v) : DASH;
          },
        },
        data: topReps.map((row) => ({
          value: row.grossProfitUSD,
          itemStyle:
            selectedKey !== null && row.key === selectedKey
              ? { color: '#4f46e5', borderRadius: [0, 3, 3, 0] }
              : { color: teal, opacity: selectedKey === null ? 0.9 : 0.35, borderRadius: [0, 3, 3, 0] },
        })),
      },
    ],
  };
  const matrixOption = {
    tooltip: {
      trigger: 'item' as const,
      confine: true,
      textStyle: { fontSize: 12 },
      extraCssText: 'max-width:380px;white-space:normal;',
      formatter: (params: { dataIndex?: unknown }) => {
        const row = typeof params?.dataIndex === 'number' ? matrixRows[params.dataIndex] : undefined;
        if (!row) return '';
        return `<div style="font-size:12px;line-height:1.45">
          <div><b>${escapeHtml(row.label || DASH)}</b></div>
          <div style="font-family:ui-monospace,monospace">${escapeHtml(row.key)}</div>
          <div>${escapeHtml(salesName)}: ${exactUSD(row.netSalesUSD)}</div>
          <div>${escapeHtml(gpName)}: ${exactUSD(row.grossProfitUSD)}</div>
          <div>${isZh ? '毛利率' : 'GM %'}: ${exactPct(row.grossMarginPercent)}</div>
          <div>${isZh ? '訂單數' : 'Orders'}: ${fmtCount(row.orderCount)}</div>
          <div>${isZh ? '淨銷量' : 'Net qty'}: ${exactKG(row.netQtyKG)}</div>
          <div>${isZh ? '平均單價' : 'ASP'}: ${fmtPriceUSD(row.averageSellingPriceUSD)}</div>
          <div>${isZh ? '點擊下鑽該業務員的客戶組合' : 'Click to drill into this rep'}</div>
        </div>`;
      },
    },
    grid: { left: 8, right: 16, top: 24, bottom: 40, containLabel: true },
    xAxis: {
      type: 'value' as const,
      name: 'USD',
      nameLocation: 'middle' as const,
      nameGap: 28,
      nameTextStyle: { color: mutedColor, fontSize: 12 },
      min: (bound: { min: number }) => Math.min(0, Number.isFinite(bound.min) ? bound.min : 0),
      max: (bound: { max: number }) => Math.max(0, Number.isFinite(bound.max) ? bound.max : 0),
      axisLabel: { color: mutedColor, fontSize: 12, formatter: (value: number) => axisUSD(value) },
      axisLine: { show: true, onZero: true, lineStyle: { color: refSlate, width: 1.25 } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: splitColor } },
    },
    yAxis: {
      type: 'value' as const,
      name: 'GM%',
      nameTextStyle: { color: mutedColor, fontSize: 12 },
      min: (bound: { min: number }) => Number.isFinite(bound.min) ? Math.floor(bound.min - 1) : 0,
      max: (bound: { max: number }) => Number.isFinite(bound.max) ? Math.ceil(bound.max + 1) : 1,
      axisLabel: { color: mutedColor, fontSize: 12, formatter: (value: number) => `${value.toFixed(1)}%` },
      splitLine: { lineStyle: { color: splitColor } },
    },
    series: [
      {
        name: isZh ? '業務員（等尺寸圓點不代表第三變數）' : 'Salespeople (fixed-size points)',
        type: 'scatter' as const,
        cursor: 'pointer',
        symbolSize: 11,
        data: matrixRows.map((row) => ({
          value: [
            row.netSalesUSD,
            (row.grossMarginPercent as number) * 100,
          ],
          itemStyle:
            selectedKey !== null && row.key === selectedKey
              ? { color: '#4f46e5', opacity: 1, borderColor: '#312e81', borderWidth: 1.5 }
              : { color: salesBlue, opacity: selectedKey === null ? 0.85 : 0.35 },
        })),
        // point colors are set per datum above to reflect local selection
        markLine:
          meanGmPct === null
            ? undefined
            : {
                silent: true,
                symbol: 'none',
                label: {
                  show: true,
                  position: 'insideEndTop' as const,
                  fontSize: 12,
                  color: refSlate,
                  formatter: isZh
                    ? `加權毛利率 ${fmtPercent(meanGm)}`
                    : `Weighted GM ${fmtPercent(meanGm)}`,
                },
                lineStyle: { color: refSlate, width: 1.25, type: 'dashed' as const },
                data: [{ yAxis: meanGmPct }],
              },
      },
    ],
  };

  return (
    <div className="sales-dashboard space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {isZh ? 'D13 業務員實績 (Salesperson Actuals)' : 'D13 Salesperson Actuals'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isZh
              ? `${repCount} 位業務員的規模與獲利品質分佈。虛線為整體加權毛利率，非目標。`
              : 'Scale and margin quality of the selected reps. Dashed line: overall weighted GM%, not a target.'}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() =>
              exportSalesRowsCsv(`D13_Salespeople_${slicer.month}.csv`, salespeople, 'SalespersonKey')
            }
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 cursor-pointer"
          >
            {isZh ? '📥 匯出業務員實績 CSV' : '📥 Export Salespeople CSV'}
          </button>
        </div>
      </div>

      <StateGuard
        state={state}
        error={error ? { code: error.code, reason: error.message } : null}
        onRetry={reload}
      >
        {kpis && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                title={isZh ? '業務總淨銷售額' : 'Total Net Sales'}
                value={fmtUSD(kpis.netSalesUSD)}
                subValue={
                  yoy === null
                    ? `${repCount} ${isZh ? '位業務員' : 'Salespeople'}`
                    : `YoY ${fmtSignedPercent(yoy)}`
                }
                trend={yoyTrend}
                footnote={
                  yoy === null
                    ? summaryLabels.monthLabel
                    : `${repCount} ${isZh ? '位' : 'reps'} · ${summaryLabels.monthLabel}`
                }
              />
              <KpiCard
                title={isZh ? '業務總毛利額' : 'Total Gross Profit'}
                value={fmtUSD(kpis.grossProfitUSD)}
                subValue={`GM%: ${fmtPercent(kpis.grossMarginPercent)}`}
                trend="neutral"
                footnote={isZh ? '整體加權毛利率' : 'Weighted GM%'}
              />
              <KpiCard
                title={isZh ? '首位業務員 (Top Salesperson)' : 'Top Salesperson'}
                value={topRep ? topRep.key : DASH}
                subValue={topRep ? fmtUSD(topRep.netSalesUSD) : DASH}
                trend="neutral"
                footnote={topRep ? topRep.label : DASH}
              />
              <KpiCard
                title={isZh ? '不重複訂單數 / 明細行數' : 'Orders / Sales Lines'}
                value={fmtCount(kpis.orderCount)}
                subValue={`${fmtCount(kpis.salesLineCount)} ${isZh ? '行' : 'Lines'}`}
                trend="neutral"
                footnote={isZh ? `退貨率: ${fmtPercent(kpis.returnRatePercent)}` : `Return Rate: ${fmtPercent(kpis.returnRatePercent)}`}
              />
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              {topReps.length === 0 ? (
                <p className="py-10 text-xs text-slate-500 dark:text-slate-400">
                  {isZh ? '此切片沒有業務員列。' : 'No salesperson rows in this slice.'}
                </p>
              ) : (
                <EChartsContainer
                  option={repBarOption}
                  height={`${Math.max(300, 110 + topReps.length * 36)}px`}
                  onEvents={{
                    click: (params: { dataIndex?: unknown }) => {
                      const idx = typeof params?.dataIndex === 'number' ? params.dataIndex : -1;
                      const row = idx >= 0 ? topReps[idx] : undefined;
                      if (!row) return;
                      setSelectedKey((prev) => (prev === row.key ? null : row.key));
                    },
                  }}
                />
              )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              <div className="xl:col-span-7 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {isZh
                  ? `業務員績效矩陣（x 營收 USD，y 毛利率 %，共 ${matrixRows.length} 位）`
                  : `Rep performance matrix (x revenue USD, y GM %, ${matrixRows.length} reps)`}
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {isZh
                  ? `每點一位業務員；越右營收越高，越上毛利率越高，毛利率軸依資料範圍顯示。點選只高亮，再用右側摘要下鑽客戶。缺值未繪 ${absentCount} 位，完整資料見明細與 CSV。`
                  : `One point per rep. Revenue increases to the right; margin increases upward on a data-range axis. Click highlights only; drill from the side summary. ${absentCount} null-valued reps excluded; full data in table and CSV.`}
              </p>
              {matrixRows.length === 0 ? (
                <p className="py-10 text-xs text-slate-500 dark:text-slate-400">
                  {isZh ? '此切片沒有業務員列。' : 'No salesperson rows in this slice.'}
                </p>
              ) : (
                <EChartsContainer
                  option={matrixOption}
                  height="400px"
                  onEvents={{
                    click: (params: { dataIndex?: unknown }) => {
                      const row =
                        typeof params?.dataIndex === 'number' ? matrixRows[params.dataIndex] : undefined;
                      if (!row) return;
                      setSelectedKey((prev) => (prev === row.key ? null : row.key));
                    },
                  }}
                />
              )}
            </div>

              <div className="xl:col-span-5 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white break-words">
                  {isZh ? '選中業務員摘要（同一穩定鍵同步）' : 'Selected salesperson (synced by stable key)'}
                </h3>
                {selectedRep ? (
                  <div className="mt-2 space-y-1.5 text-xs tabular-nums">
                    <div className="font-bold text-indigo-600 dark:text-indigo-400 text-sm break-words">
                      {selectedRep.label}
                    </div>
                    <div className="font-mono text-[11px] text-slate-400">{selectedRep.key}</div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500 dark:text-slate-400">{isZh ? '淨銷售額 (USD)' : 'Net sales (USD)'}</span>
                      <span className="font-bold">{fmtUSD(selectedRep.netSalesUSD)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500 dark:text-slate-400">{isZh ? '毛利額 (USD)' : 'Gross profit (USD)'}</span>
                      <span className="font-semibold">{fmtUSD(selectedRep.grossProfitUSD)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500 dark:text-slate-400">{isZh ? '毛利率' : 'GM %'}</span>
                      <span className="font-semibold">{fmtPercent(selectedRep.grossMarginPercent)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500 dark:text-slate-400">{isZh ? '淨銷量 (KG)' : 'Net qty (KG)'}</span>
                      <span>{fmtKG(selectedRep.netQtyKG)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500 dark:text-slate-400">{isZh ? '平均單價' : 'ASP'}</span>
                      <span>{fmtPriceUSD(selectedRep.averageSellingPriceUSD)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500 dark:text-slate-400">{isZh ? '退貨率' : 'Return %'}</span>
                      <span>{fmtPercent(selectedRep.returnRatePercent)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500 dark:text-slate-400">{isZh ? '訂單數 / 行數' : 'Orders / Lines'}</span>
                      <span>{fmtCount(selectedRep.orderCount)} / {fmtCount(selectedRep.salesLineCount)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => openRepDrill(selectedRep)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white border border-indigo-600 cursor-pointer"
                      >
                        {isZh ? '下鑽該業務員客戶 ➔' : 'Drill into customers ➔'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedKey(null)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 cursor-pointer"
                      >
                        {isZh ? '清除選擇' : 'Reset selection'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {isZh
                      ? '點長條、散佈點或下表明細列，只高亮同一業務員（不篩選母體）；此處顯示精確摘要並可下鑽其客戶。'
                      : 'Click a bar, scatter point, or table row to highlight one salesperson (no filtering); its exact summary and drill appear here.'}
                  </p>
                )}
              </div>
            </div>

            <ComparisonHistory slicer={slicer} dimension="salesperson" maxMembers={4} showRanks />

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
              <details open>
                <summary className="text-sm font-bold text-slate-900 dark:text-white cursor-pointer">
                  {isZh
                    ? `業務員實績明細（全體 ${repCount} 位，點列只高亮、用摘要下鑽）`
                    : `Salesperson actuals (all ${repCount}; click highlights, drill from summary)`}
                </summary>
                <div className="overflow-x-auto mt-3">
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs tabular-nums">
                    <thead className="bg-slate-50 dark:bg-slate-800/70">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">#</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '業務員 (Key / Label)' : 'Salesperson'}
                        </th>
                        <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '淨銷售額 (USD)' : 'Net Sales (USD)'}
                        </th>
                        <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '毛利額 (USD)' : 'Gross Profit (USD)'}
                        </th>
                        <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '毛利率' : 'GM %'}
                        </th>
                        <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '淨銷量 (KG)' : 'Net Qty (KG)'}
                        </th>
                        <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '平均單價' : 'ASP'}
                        </th>
                        <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '退貨率' : 'Return %'}
                        </th>
                        <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '訂單數 / 行數' : 'Orders / Lines'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                      {salespeople.map((row, index) => (
                        <tr
                          key={row.key}
                          onClick={() => setSelectedKey((prev) => (prev === row.key ? null : row.key))}
                          className={`cursor-pointer transition-colors ${row.key === selectedKey ? 'bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-950/70' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                        >
                          <td className="px-3 py-2 text-slate-400">{index + 1}</td>
                          <td className="px-3 py-2 font-sans">
                            <div className="font-bold text-indigo-600 dark:text-indigo-400">{row.label}</div>
                            <div className="text-[11px] font-mono text-slate-400">{row.key}</div>
                          </td>
                          <td className="px-3 py-2 text-right font-bold">{fmtUSD(row.netSalesUSD)}</td>
                          <td className="px-3 py-2 text-right font-semibold">{fmtUSD(row.grossProfitUSD)}</td>
                          <td className="px-3 py-2 text-right font-semibold">{fmtPercent(row.grossMarginPercent)}</td>
                          <td className="px-3 py-2 text-right">{fmtKG(row.netQtyKG)}</td>
                          <td className="px-3 py-2 text-right">{fmtPriceUSD(row.averageSellingPriceUSD)}</td>
                          <td className="px-3 py-2 text-right">{fmtPercent(row.returnRatePercent)}</td>
                          <td className="px-3 py-2 text-right">
                            {fmtCount(row.orderCount)} / {fmtCount(row.salesLineCount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>

            <AiInsightCard
              title={isZh ? 'D13 業務員銷售實績摘要' : 'D13 Salesperson Actuals Summary'}
              data={{
                observed: isZh
                  ? `矩陣共 ${matrixRows.length} 位（缺值 ${absentCount} 位未繪）。總淨銷售額 ${fmtUSD(
                      kpis.netSalesUSD
                    )}，總毛利額 ${fmtUSD(kpis.grossProfitUSD)}（整體加權毛利率 ${fmtPercent(
                      kpis.grossMarginPercent
                    )}）${
                      topRep
                        ? `。首位業務員為 ${topRep.key} (${topRep.label})，實績淨銷售額 ${fmtUSD(
                            topRep.netSalesUSD
                          )}，毛利率 ${fmtPercent(topRep.grossMarginPercent)}。`
                        : '。'
                    }`
                  : `Matrix covers ${matrixRows.length} reps (${absentCount} with null values not plotted). Total Net Sales ${fmtUSD(
                      kpis.netSalesUSD
                    )}, Gross Profit ${fmtUSD(kpis.grossProfitUSD)} (overall weighted GM% ${fmtPercent(
                      kpis.grossMarginPercent
                    )})${
                      topRep
                        ? `. Top salesperson is ${topRep.key} (${topRep.label}) with ${fmtUSD(
                            topRep.netSalesUSD
                          )} in Net Sales.`
                        : '.'
                    }`,
                interpretation: isZh
                  ? '長條只比較當期營收與毛利額，矩陣只描述規模與品質位置，不做迴歸、排名或生產力推論；虛線為整體加權毛利率統計參照非目標。點選只高亮，再用摘要下鑽其客戶。'
                  : 'Bars compare current revenue against gross profit only; the matrix describes scale and quality positions with no regression, ranking, or productivity claim; the dashed line is a statistical reference, not a target. Clicking highlights; drill from the summary.',
                claimType: 'OBSERVATION',
                coverage: `${summaryLabels.monthLabel} · ${summaryLabels.companyLabel}`,
                confidence: 'SSAS Direct',
                evidenceId: data?.evidence?.requestId || 'D13',
                evidence: data?.evidence,
                source: data?.source,
                limitations: [
                  isZh
                    ? '只呈現實際銷售與毛利，無配額預算或達成率；矩陣僅含雙軸皆有值者其餘在明細與 CSV'
                    : 'Displays actual sales and gross profit only, with no quota, budget, or attainment; the matrix includes only rows with both axes present, the rest remain in the table and CSV.',
                ],
                nextSteps: [
                  isZh ? '進入 D06 檢視客戶營收與毛利貢獻' : 'Go to D06 Customer Contribution',
                  isZh ? '進入 D08 檢視各業務線產品獲利品質' : 'Go to D08 Profitability Quality',
                ],
              }}
            />
          </div>
        )}
      </StateGuard>
    </div>
  );
};

export default D13SalespersonPerformance;
