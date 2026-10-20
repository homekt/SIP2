import React, { useMemo } from 'react';
import { Filters, SalesRow } from '../types/sales';
import { useSalesDashboard } from '../services/salesApi';
import { StateGuard } from '../components/common/StateGuard';
import { KpiCard } from '../components/charts/KpiCard';
import { EChartsContainer } from '../components/charts/EChartsContainer';
import { AiInsightCard } from '../components/ai/AiInsightCard';
import { useApp } from '../context/AppContext';
import { getFilterSummaryLabels } from '../utils/slicerData';
import {
  exportSalesRowsCsv,
  fmtCount,
  fmtKG,
  fmtPercent,
  fmtPriceUSD,
  fmtSignedPercent,
  fmtSignedUSD,
  fmtUSD,
} from '../utils/salesFormat';

interface Props {
  slicer: Filters;
}


function escapeHtml(value: string | null | undefined): string {
  if (!value) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getMonthlyTrendSeries(
  monthly: SalesRow[],
  selectedMonth: string,
  metricExtractor: (m: SalesRow) => number | null
): { values: Array<number | null>; labels: string[]; caption: string } | undefined {
  if (!monthly || monthly.length === 0) return undefined;

  let targetIndex = monthly.length - 1;
  if (selectedMonth && selectedMonth !== 'All') {
    const idx = monthly.findIndex((m) => m.key === selectedMonth);
    if (idx === -1) return undefined;
    targetIndex = idx;
  }

  const startIndex = Math.max(0, targetIndex - 11);
  const slice = monthly.slice(startIndex, targetIndex + 1);
  if (slice.length === 0) return undefined;

  return {
    values: slice.map(metricExtractor),
    labels: slice.map((m) => m.key),
    caption: `${slice[0].key}..${slice[slice.length - 1].key}`,
  };
}

export const D02SalesMomentum: React.FC<Props> = ({ slicer }) => {
  const { theme, lang, navigate, openDrillDown, metadata, setLastDashboardContext } = useApp();
  const isDark = theme === 'dark';
  const isZh = lang === 'zh-TW';

  const { phase, data, error, reload } = useSalesDashboard('D02', slicer, setLastDashboardContext);
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
  const companies = data?.datasets?.companies || [];
  const monthly = data?.datasets?.monthly || [];

  const yoyDelta =
    kpis?.netSalesUSD !== null &&
    kpis?.netSalesUSD !== undefined &&
    analysis?.priorYearNetSalesUSD !== null &&
    analysis?.priorYearNetSalesUSD !== undefined
      ? kpis.netSalesUSD - analysis.priorYearNetSalesUSD
      : null;

  // Build aligned same complete-month prior-year series from monthly dataset;
  // unavailable prior-year months (e.g. 202401..202412) remain null gaps without extrapolation.
  const alignedMonthlySeries = useMemo(() => {
    const byMonth = new Map(monthly.map((row) => [row.key, row]));
    return monthly.map((row) => {
      const yearNum = Number(row.key.slice(0, 4));
      const monthPart = row.key.slice(4, 6);
      const priorKey = `${String(yearNum - 1).padStart(4, '0')}${monthPart}`;
      const priorRow = byMonth.get(priorKey);
      const currentSales = row.netSalesUSD;
      const priorSales = priorRow ? priorRow.netSalesUSD : null;
      const hasValidPrior =
        priorSales !== null && priorSales !== undefined && priorSales > 0 && currentSales !== null;
      const deltaUSD =
        priorSales !== null && priorSales !== undefined && currentSales !== null
          ? currentSales - priorSales
          : null;
      const yoyFraction = hasValidPrior ? (currentSales - priorSales) / priorSales : null;
      const yoyPercentValue =
        yoyFraction !== null ? yoyFraction * 100 : null;

      return {
        row,
        priorKey,
        priorSales,
        deltaUSD,
        yoyFraction,
        yoyPercentValue,
      };
    });
  }, [monthly]);

  // Restrained semantic palette
  const salesColor = isDark ? '#60a5fa' : '#2563eb';
  const priorColor = '#64748b';
  const emeraldColor = isDark ? '#34d399' : '#059669';
  const roseColor = isDark ? '#f43f5e' : '#e11d48';
  const axisLabelColor = isDark ? '#cbd5e1' : '#334155';
  const axisSubColor = isDark ? '#94a3b8' : '#64748b';
  const splitLineColor = isDark ? '#1e293b' : '#f1f5f9';

  // KPI Sparklines
  const salesTrend = useMemo(
    () => getMonthlyTrendSeries(monthly, slicer.month, (m) => m.netSalesUSD),
    [monthly, slicer.month]
  );
  const priorTrend = useMemo(() => {
    if (!monthly || monthly.length === 0) return undefined;
    const byMonth = new Map(monthly.map((m) => [m.key, m]));
    let targetIndex = monthly.length - 1;
    if (slicer.month && slicer.month !== 'All') {
      const idx = monthly.findIndex((m) => m.key === slicer.month);
      if (idx === -1) return undefined;
      targetIndex = idx;
    }
    const startIndex = Math.max(0, targetIndex - 11);
    const slice = monthly.slice(startIndex, targetIndex + 1);
    const values = slice.map((m) => {
      const yr = Number(m.key.slice(0, 4));
      const priorKey = `${yr - 1}${m.key.slice(4, 6)}`;
      return byMonth.get(priorKey)?.netSalesUSD ?? null;
    });
    return {
      values,
      labels: slice.map((m) => m.key),
      caption: `${slice[0].key}..${slice[slice.length - 1].key}`,
    };
  }, [monthly, slicer.month]);

  const aspTrend = useMemo(
    () => getMonthlyTrendSeries(monthly, slicer.month, (m) => m.averageSellingPriceUSD),
    [monthly, slicer.month]
  );

  const formatMomentumTooltip = (params: any[]) => {
    const idx = params?.[0]?.dataIndex;
    const item = typeof idx === 'number' ? alignedMonthlySeries[idx] : undefined;
    if (!item) return '';
    const { row, priorKey, priorSales, deltaUSD, yoyFraction } = item;
    const priorStatusText =
      priorSales !== null
        ? fmtUSD(priorSales)
        : isZh
        ? '— (無前期歷史基準 / 空白斷點)'
        : '— (Unavailable history gap)';
    return [
      `<strong>${escapeHtml(row.label || row.key)} (${escapeHtml(row.key)})</strong>`,
      `${isZh ? '當月淨銷售額 (Current)' : 'Current Net Sales'}: <strong>${fmtUSD(
        row.netSalesUSD
      )}</strong>`,
      `${isZh ? `去年同完整月 (${escapeHtml(priorKey)})` : `Prior-Year Same Month (${escapeHtml(priorKey)})`}: <strong>${priorStatusText}</strong>`,
      `${isZh ? '同期差額 (YoY Delta)' : 'YoY Delta (USD)'}: ${fmtSignedUSD(deltaUSD)}`,
      `${isZh ? '同期成長率 (YoY %)' : 'YoY Growth %'}: <strong>${fmtSignedPercent(
        yoyFraction
      )}</strong>`,
      `${isZh ? '當月毛利額 (GP)' : 'Gross Profit'}: ${fmtUSD(row.grossProfitUSD)}`,
    ].join('<br/>');
  };

  // Panel 1: Aligned Like-for-Like Monthly Net Sales Comparison (Same USD Scale)
  const monthlyComparisonOption = {
    tooltip: {
      trigger: 'axis',
      formatter: formatMomentumTooltip,
    },
    legend: {
      top: 0,
      right: 0,
      textStyle: { color: axisLabelColor, fontSize: 12 },
      data: [
        isZh ? '當月淨銷售額 (USD, 實線)' : 'Current Month Net Sales (USD, Solid)',
        isZh ? '去年同完整月淨銷售額 (USD, 虛線)' : 'Prior-Year Same Month (USD, Dashed)',
      ],
    },
    grid: { left: 16, right: 16, bottom: 12, top: 36, containLabel: true },
    xAxis: {
      type: 'category',
      data: alignedMonthlySeries.map((item) => item.row.key),
      axisLabel: {
        color: axisLabelColor,
        fontSize: 12,
        hideOverlap: true,
      },
      axisTick: { alignWithLabel: true },
    },
    yAxis: {
      type: 'value',
      name: 'USD',
      min: (bound: { min: number }) => Math.min(0, Number.isFinite(bound.min) ? bound.min : 0),
      nameTextStyle: { color: axisSubColor, fontSize: 12 },
      axisLabel: {
        color: axisSubColor,
        fontSize: 12,
        formatter: (v: number) => Math.abs(v) >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : `$${(v / 1000).toFixed(0)}k`,
      },
      splitLine: { lineStyle: { color: splitLineColor } },
    },
    series: [
      {
        name: isZh ? '當月淨銷售額 (USD, 實線)' : 'Current Month Net Sales (USD, Solid)',
        type: 'line',
        smooth: false,
        connectNulls: false,
        symbol: 'circle',
        symbolSize: 6,
        data: alignedMonthlySeries.map((item) => item.row.netSalesUSD),
        itemStyle: { color: salesColor },
        lineStyle: { width: 2.5, type: 'solid', color: salesColor },
      },
      {
        name: isZh ? '去年同完整月淨銷售額 (USD, 虛線)' : 'Prior-Year Same Month (USD, Dashed)',
        type: 'line',
        smooth: false,
        connectNulls: false,
        symbol: 'emptyCircle',
        symbolSize: 6,
        data: alignedMonthlySeries.map((item) => item.priorSales),
        itemStyle: { color: priorColor },
        lineStyle: { width: 2, type: 'dashed', color: priorColor },
      },
    ],
  };

  // Panel 2: Aligned Same Complete-Month Prior-Year YoY Growth % (Signed Diverging Bars, Zero Baseline)
  const monthlyDivergingYoyOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: formatMomentumTooltip,
    },
    legend: {
      top: 0,
      right: 0,
      textStyle: { color: axisLabelColor, fontSize: 12 },
      data: [isZh ? '同完整月份 YoY 成長率 (%)' : 'Same-Month YoY Growth (%)'],
      show: false,
    },
    grid: { left: 16, right: 16, bottom: 12, top: 32, containLabel: true },
    xAxis: {
      type: 'category',
      data: alignedMonthlySeries.map((item) => item.row.key),
      axisLabel: {
        color: axisLabelColor,
        fontSize: 12,
        hideOverlap: true,
      },
      axisTick: { alignWithLabel: true },
    },
    yAxis: {
      type: 'value',
      name: 'YoY %',
      nameTextStyle: { color: axisSubColor, fontSize: 12 },
      axisLabel: {
        color: axisSubColor,
        fontSize: 12,
        formatter: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`,
      },
      splitLine: { lineStyle: { color: splitLineColor } },
    },
    series: [
      {
        name: isZh ? '同完整月份 YoY 成長率 (%)' : 'Same-Month YoY Growth (%)',
        type: 'bar',
        data: alignedMonthlySeries.map((item) =>
          item.yoyPercentValue !== null
            ? {
                value: item.yoyPercentValue,
                itemStyle: {
                  color: item.yoyPercentValue >= 0 ? emeraldColor : roseColor,
                  borderRadius: item.yoyPercentValue >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3],
                },
              }
            : null
        ),
        barMaxWidth: 16,
      },
    ],
  };

  const handleMonthClick = (params: any) => {
    const m = monthly[params.dataIndex];
    if (m) {
      navigate('D02', { month: m.key });
    }
  };

  return (
    <div className="sales-dashboard space-y-4">
      {/* Header bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-3 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              {isZh ? 'D02 銷售動能 (Sales Momentum)' : 'D02 Sales Momentum'}
            </h2>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              {summaryLabels.monthLabel} · {summaryLabels.companyLabel}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isZh
              ? '檢視同完整發票月份去年同期 (YoY) 對齊比較、成長動能走勢與營運公司實績'
              : 'Same complete-month prior-year (YoY) aligned comparison, momentum divergence, and company results'}
          </p>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={() =>
              exportSalesRowsCsv(`D02_Monthly_${slicer.company}.csv`, monthly, 'MonthKey')
            }
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
          >
            {isZh ? '📥 匯出月度動能 CSV' : '📥 Export Monthly CSV'}
          </button>
        </div>
      </div>

      <StateGuard
        state={state}
        error={error ? { code: error.code, reason: error.message } : null}
        onRetry={reload}
      >
        {kpis && (
          <>
            {/* 4 Primary Tier-1 KPI Cards with actual monthly sparklines */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <KpiCard
                title={isZh ? '當期淨銷售額 (Current)' : 'Current Net Sales'}
                value={fmtUSD(kpis.netSalesUSD)}
                subValue={`${fmtCount(kpis.orderCount)} ${isZh ? '筆訂單' : 'Orders'}`}
                trend="neutral"
                footnote={summaryLabels.monthLabel}
                trendSeries={salesTrend}
              />
              <KpiCard
                title={isZh ? '去年同完整月 (Prior Year)' : 'Prior-Year Same Month'}
                value={fmtUSD(analysis?.priorYearNetSalesUSD)}
                subValue={analysis?.historyStatus || '—'}
                trend="neutral"
                footnote={
                  isZh
                    ? '同完整發票月份去年實績 (無前期則顯示 —)'
                    : 'Same complete invoice month prior year'
                }
                trendSeries={priorTrend}
              />
              <KpiCard
                title={isZh ? '同完整月 YoY 成長率' : 'Same-Month YoY Growth %'}
                value={fmtSignedPercent(analysis?.yoyGrowth)}
                subValue={fmtSignedUSD(yoyDelta)}
                trend={
                  analysis?.yoyGrowth !== null && analysis?.yoyGrowth !== undefined
                    ? analysis.yoyGrowth > 0
                      ? 'up'
                      : analysis.yoyGrowth < 0
                      ? 'down'
                      : 'neutral'
                    : 'neutral'
                }
                tone="default"
                footnote={isZh ? '點擊穿透 D16 成長貢獻瀑布' : 'Click for D16 Waterfall'}
                drillThroughTarget="D16"
              />
              <KpiCard
                title={isZh ? '當期平均銷售單價 (ASP)' : 'Average Selling Price'}
                value={fmtPriceUSD(kpis.averageSellingPriceUSD)}
                subValue={`GM%: ${fmtPercent(kpis.grossMarginPercent)}`}
                trend="neutral"
                footnote={
                  isZh ? `淨銷量: ${fmtKG(kpis.netQtyKG)}` : `Net Qty: ${fmtKG(kpis.netQtyKG)}`
                }
                drillThroughTarget="D08"
                trendSeries={aspTrend}
              />
            </div>

            {/* Exactly 2 Primary Analytical Panels: Aligned Comparison + Diverging Deltas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Panel 1: Aligned Like-for-Like Monetary Comparison */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="chart-panel-header mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {isZh
                          ? '月度淨銷售額與同完整月份前期對比 (USD · 單一尺度)'
                          : 'Monthly Net Sales vs. Same-Month Prior Year (USD · Single Scale)'}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {isZh
                          ? '藍色實線為當月實績，板岩灰虛線為去年同期；2024 年前期空白斷點自然呈現'
                          : 'Blue solid line: current month; Slate dashed line: prior year; Gaps preserved'}
                      </p>
                    </div>
                  </div>
                  <EChartsContainer
                    option={monthlyComparisonOption}
                    height="320px"
                    onEvents={{
                      click: handleMonthClick,
                    }}
                  />
                </div>
              </div>

              {/* Panel 2: Diverging YoY Growth % Bars from Zero Baseline */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="chart-panel-header mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {isZh
                          ? '月度同完整月份 YoY 成長率 (% · 零基線正負偏離長條)'
                          : 'Aligned Same-Month YoY Growth % (Zero Baseline Divergence)'}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {isZh
                          ? '翡翠綠代表正成長，玫瑰紅代表衰退；2024 年無歷史基準月份保留空白斷點不補零'
                          : 'Emerald: positive growth; Rose: decline; Missing prior periods kept as unbridged gaps'}
                      </p>
                    </div>
                  </div>
                  <EChartsContainer
                    option={monthlyDivergingYoyOption}
                    height="320px"
                    onEvents={{
                      click: handleMonthClick,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Subordinate Company Performance Table with native details */}
            <details
              open
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-2xs group"
            >
              <summary className="flex items-center justify-between cursor-pointer select-none">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {isZh
                      ? '各營運公司當期銷售動能與獲利指標表 (點擊公司下鑽產品)'
                      : 'Company Sales Momentum & Volume Table (Click row to drill down)'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {isZh
                      ? `全母體 ${companies.length} 家公司 · 完整保留淨銷售額、毛利額、GM%、淨銷量、ASP 與退貨率`
                      : `All ${companies.length} companies · Full Net Sales, GP, GM%, Net Qty, ASP, and Return Rate`}
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  {companies.length} {isZh ? '家公司' : 'Companies'}
                </span>
              </summary>
              <div className="sales-table-wrap mt-3">
                <table className="sales-table divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/70">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '公司 (Label / Key)' : 'Company'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '淨銷售額 (USD)' : 'Net Sales (USD)'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '毛利額 (USD)' : 'Gross Profit (USD)'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '毛利率 (GM%)' : 'GM %'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '淨銷量 (KG)' : 'Net Qty (KG)'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '平均單價 (ASP)' : 'ASP'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '退貨率' : 'Return %'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                    {companies.map((c) => (
                      <tr
                        key={c.key}
                        onClick={() =>
                          openDrillDown({
                            title: isZh
                              ? `${c.key} (${c.label}) 產品銷售下鑽`
                              : `${c.key} (${c.label}) Product Drill-Down`,
                            dimensionName: isZh ? '公司' : 'Company',
                            dimensionValue: c.key,
                            sourceDashboard: 'D02',
                            groupBy: 'product',
                            filterOverrides: { company: c.key },
                            rows: [],
                          })
                        }
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-2 font-sans">
                          <div className="font-bold text-indigo-600 dark:text-indigo-400">
                            {c.label}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">{c.key}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-bold">{fmtUSD(c.netSalesUSD)}</td>
                        <td className="px-3 py-2 text-right text-amber-600 dark:text-amber-400">
                          {fmtUSD(c.grossProfitUSD)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">
                          {fmtPercent(c.grossMarginPercent)}
                        </td>
                        <td className="px-3 py-2 text-right">{fmtKG(c.netQtyKG)}</td>
                        <td className="px-3 py-2 text-right">
                          {fmtPriceUSD(c.averageSellingPriceUSD)}
                        </td>
                        <td className="px-3 py-2 text-right">{fmtPercent(c.returnRatePercent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            {/* Compact Summary & Evidence Receipt */}
            <AiInsightCard
              title={isZh ? 'D02 銷售動能與同期比較證據' : 'D02 Sales Momentum & YoY Evidence'}
              data={{
                observed: isZh
                  ? `當期 (${summaryLabels.monthLabel}) 淨銷售額 ${fmtUSD(
                      kpis.netSalesUSD
                    )}，去年同期淨銷售額 ${fmtUSD(
                      analysis?.priorYearNetSalesUSD
                    )}，同期變動差額 ${fmtSignedUSD(yoyDelta)}，YoY 成長率 ${fmtSignedPercent(
                      analysis?.yoyGrowth
                    )}（歷史狀態：${analysis?.historyStatus}）。`
                  : `Current (${summaryLabels.monthLabel}) Net Sales ${fmtUSD(
                      kpis.netSalesUSD
                    )}, Prior Year Net Sales ${fmtUSD(
                      analysis?.priorYearNetSalesUSD
                    )}, YoY Delta ${fmtSignedUSD(yoyDelta)}, YoY Growth ${fmtSignedPercent(
                      analysis?.yoyGrowth
                    )} (History Status: ${analysis?.historyStatus}).`,
                interpretation:
                  analysis?.historyStatus === 'available'
                    ? isZh
                      ? `歷史同期資料完整可用；可進一步前往 D16 檢視各產品對同期差額 ${fmtSignedUSD(
                          yoyDelta
                        )} 的算術瀑布貢獻。`
                      : `Prior-year comparison is certified available. Proceed to D16 to inspect product-level arithmetic waterfall contributions.`
                    : isZh
                    ? `目前發票月份切片 (${slicer.month}) 之歷史比較狀態為 ${analysis?.historyStatus}，系統依合約規範將不適用或缺少前期之 YoY 指標顯示為「—」，絕不偽造推估。`
                    : `History status for month=${slicer.month} is ${analysis?.historyStatus}. Per contract rules, YoY metrics are displayed as '—' without extrapolation.`,
                claimType: 'ARITHMETIC_CONTRIBUTION',
                coverage: `${summaryLabels.monthLabel} · ${summaryLabels.companyLabel}`,
                confidence: 'SSAS Direct',
                evidenceId: data?.evidence?.requestId || 'D02',
                evidence: data?.evidence,
                source: data?.source,
                limitations: [
                  isZh
                    ? '若去年同期銷售額 <= 0、超出資料涵蓋期間 (202401..202609) 或選擇 All 月份，YoY 成長率嚴格回傳 null (顯示 —)'
                    : 'YoY Growth returns null (—) when prior year sales <= 0, outside 202401..202609 coverage, or when month is All',
                ],
                nextSteps: [
                  isZh ? '進入 D16 檢視產品成長與衰退產品瀑布貢獻' : 'Go to D16 Growth Contribution',
                  isZh ? '進入 D15 檢視 YTD 與 R3M/R12M 滾動銷售' : 'Go to D15 Rolling Sales',
                  isZh ? '進入 D04 檢視產品組合結構' : 'Go to D04 Product Mix',
                ],
              }}
            />
          </>
        )}
      </StateGuard>
    </div>
  );
};

export default D02SalesMomentum;
