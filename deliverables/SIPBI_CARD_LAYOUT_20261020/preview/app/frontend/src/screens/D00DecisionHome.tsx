import React, { useState, useMemo } from 'react';
import { OperationsOverview } from '../composition/OperationsOverview';
import { Filters, SalesRow } from '../types/sales';
import { useSalesDashboard } from '../services/salesApi';
import { StateGuard } from '../components/common/StateGuard';
import { KpiCard } from '../components/charts/KpiCard';
import { EChartsContainer } from '../components/charts/EChartsContainer';
import { AiInsightCard } from '../components/ai/AiInsightCard';
import { useApp } from '../context/AppContext';
import { getVisibleDashboards } from '../components/common/Header';
import { getFilterSummaryLabels } from '../utils/slicerData';
import {
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
  onNavigate: (dashboardId: string) => void;
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

export const D00DecisionHome: React.FC<Props> = ({ slicer, onNavigate }) => {
  const { theme, lang, navigate, openDrillDown, metadata, aiEnabled, setLastDashboardContext } =
    useApp();
  const isDark = theme === 'dark';
  const isZh = lang === 'zh-TW';
  const [showAllDirectory, setShowAllDirectory] = useState(false);

  const { phase, data, error, reload } = useSalesDashboard('D00', slicer, setLastDashboardContext);
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
  const categories = data?.datasets?.categories || [];
  const monthly = data?.datasets?.monthly || [];
  const visibleDashboards = getVisibleDashboards(aiEnabled);

  const handlePortalNavigate = (targetId: string, filterUpdates?: Partial<Filters>) => {
    navigate(targetId, filterUpdates);
    onNavigate(targetId);
  };

  // Restrained semantic palette
  const salesColor = isDark ? '#60a5fa' : '#2563eb';
  const gpColor = isDark ? '#fbbf24' : '#d97706';
  const slateColor = '#64748b';
  const axisLabelColor = isDark ? '#cbd5e1' : '#334155';
  const axisSubColor = isDark ? '#94a3b8' : '#64748b';
  const splitLineColor = isDark ? '#1e293b' : '#f1f5f9';

  // Up to 12 months ending on selected month for KPI sparklines
  const salesTrend = useMemo(
    () => getMonthlyTrendSeries(monthly, slicer.month, (m) => m.netSalesUSD),
    [monthly, slicer.month]
  );
  const gpTrend = useMemo(
    () => getMonthlyTrendSeries(monthly, slicer.month, (m) => m.grossProfitUSD),
    [monthly, slicer.month]
  );
  const qtyTrend = useMemo(
    () => getMonthlyTrendSeries(monthly, slicer.month, (m) => m.netQtyKG),
    [monthly, slicer.month]
  );
  const orderTrend = useMemo(
    () => getMonthlyTrendSeries(monthly, slicer.month, (m) => m.orderCount),
    [monthly, slicer.month]
  );

  // Primary Core Trend: Monthly Net Sales & Gross Profit (USD, single scale, unsmoothed, gaps preserved)
  const monthlyTrendOption = {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any[]) => {
        const idx = params?.[0]?.dataIndex;
        const m = typeof idx === 'number' ? monthly[idx] : undefined;
        if (!m) return '';
        return [
          `<strong>${escapeHtml(m.label || m.key)} (${escapeHtml(m.key)})</strong>`,
          `${isZh ? '淨銷售額 (Net Sales)' : 'Net Sales'}: <strong>${fmtUSD(m.netSalesUSD)}</strong>`,
          `${isZh ? '毛利額 (Gross Profit)' : 'Gross Profit'}: <strong>${fmtUSD(m.grossProfitUSD)}</strong>`,
          `${isZh ? '加權毛利率 (GM%)' : 'GM %'}: ${fmtPercent(m.grossMarginPercent)}`,
          `${isZh ? '淨銷量 (Net Qty)' : 'Net Qty'}: ${fmtKG(m.netQtyKG)}`,
          `${isZh ? '不重複訂單 (Orders)' : 'Distinct Orders'}: ${fmtCount(m.orderCount)}`,
        ].join('<br/>');
      },
    },
    legend: {
      top: 0,
      right: 0,
      textStyle: { color: axisLabelColor, fontSize: 12 },
      data: [
        isZh ? '淨銷售額 (USD, 實線)' : 'Net Sales (USD, Solid)',
        isZh ? '毛利額 (USD, 虛線)' : 'Gross Profit (USD, Dashed)',
      ],
    },
    grid: { left: 12, right: 16, bottom: 12, top: 36, containLabel: true },
    xAxis: {
      type: 'category',
      data: monthly.map((m) => m.key),
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
        name: isZh ? '淨銷售額 (USD, 實線)' : 'Net Sales (USD, Solid)',
        type: 'line',
        smooth: false,
        connectNulls: false,
        symbol: 'circle',
        symbolSize: 6,
        data: monthly.map((m) => m.netSalesUSD),
        itemStyle: { color: salesColor },
        lineStyle: { width: 2.5, type: 'solid', color: salesColor },
      },
      {
        name: isZh ? '毛利額 (USD, 虛線)' : 'Gross Profit (USD, Dashed)',
        type: 'line',
        smooth: false,
        connectNulls: false,
        symbol: 'diamond',
        symbolSize: 6,
        data: monthly.map((m) => m.grossProfitUSD),
        itemStyle: { color: gpColor },
        lineStyle: { width: 2, type: 'dashed', color: gpColor },
      },
    ],
  };

  // Secondary Ranking: Company Net Sales & Gross Profit horizontal bar (single USD axis, full population, starts at 0)
  const orderedCompanies = [...companies].reverse();
  const companyChartOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any[]) => {
        const idx = params?.[0]?.dataIndex;
        const c = typeof idx === 'number' ? orderedCompanies[idx] : undefined;
        if (!c) return '';
        return [
          `<strong>${escapeHtml(c.label)} (${escapeHtml(c.key)})</strong>`,
          `${isZh ? '淨銷售額 (Net Sales)' : 'Net Sales'}: <strong>${fmtUSD(c.netSalesUSD)}</strong>`,
          `${isZh ? '毛利額 (Gross Profit)' : 'Gross Profit'}: <strong>${fmtUSD(c.grossProfitUSD)}</strong>`,
          `${isZh ? '毛利率 (GM%)' : 'GM %'}: ${fmtPercent(c.grossMarginPercent)}`,
          `${isZh ? '淨銷量 (Net Qty)' : 'Net Qty'}: ${fmtKG(c.netQtyKG)}`,
          `${isZh ? '不重複訂單 (Orders)' : 'Distinct Orders'}: ${fmtCount(c.orderCount)}`,
        ].join('<br/>');
      },
    },
    legend: {
      top: 0,
      right: 0,
      textStyle: { color: axisLabelColor, fontSize: 12 },
      data: [
        isZh ? '淨銷售額 (USD)' : 'Net Sales (USD)',
        isZh ? '毛利額 (USD)' : 'Gross Profit (USD)',
      ],
    },
    grid: { left: 12, right: 20, bottom: 12, top: 36, containLabel: true },
    xAxis: {
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
    yAxis: {
      type: 'category',
      data: orderedCompanies.map((c) => `${c.label} (${c.key})`),
      axisLabel: {
        color: axisLabelColor,
        fontSize: 12,
      },
    },
    series: [
      {
        name: isZh ? '淨銷售額 (USD)' : 'Net Sales (USD)',
        type: 'bar',
        data: orderedCompanies.map((c) => c.netSalesUSD),
        itemStyle: { color: salesColor, borderRadius: [0, 3, 3, 0] },
        barMaxWidth: 16,
      },
      {
        name: isZh ? '毛利額 (USD)' : 'Gross Profit (USD)',
        type: 'bar',
        data: orderedCompanies.map((c) => c.grossProfitUSD),
        itemStyle: { color: slateColor, borderRadius: [0, 3, 3, 0] },
        barMaxWidth: 16,
      },
    ],
  };

  const handleOpenCategoryDrillDown = () => {
    openDrillDown({
      title: isZh ? '產品類別與品項銷售下鑽' : 'Product Category & Item Drill-Down',
      dimensionName: isZh ? '產品類別' : 'Category',
      dimensionValue: 'All',
      sourceDashboard: 'D00',
      groupBy: 'category',
      salesRows: categories,
      evidence: data?.evidence,
      rows: [],
      suggestedDrillThrough: [
        {
          targetTab: 'D04',
          label: 'D04',
          description: isZh ? '進入 D04 產品組合分析' : 'Go to D04 Product Mix',
        },
        {
          targetTab: 'D14',
          label: 'D14',
          description: isZh ? '進入 D14 產品營收與毛利矩陣' : 'Go to D14 Product Portfolio',
        },
      ],
    });
  };

  return (
    <div className="sales-dashboard space-y-4">
      {/* Compact Decision Header Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-3 shadow-2xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              {isZh
                ? `D00 決策首頁 (${summaryLabels.companyLabel})`
                : `D00 Decision Home (${summaryLabels.companyLabel})`}
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              {summaryLabels.monthLabel} · USD / KG · Invoice Date
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {isZh
              ? 'SSAS JDE Sales Cube 實測指標彙總（合成示範資料，五家公司共用主檔，免登入）'
              : 'Live SSAS JDE Sales Cube aggregation (Synthetic dataset, 5 shared companies, no login)'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handlePortalNavigate('D01')}
            className="px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            {isZh ? 'D01 銷售總覽 ➔' : 'D01 Executive Sales ➔'}
          </button>
          <button
            type="button"
            onClick={() => handlePortalNavigate('D18')}
            className="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-semibold transition-colors cursor-pointer"
          >
            {isZh ? 'D18 銷售觀察 ➔' : 'D18 Sales Observations ➔'}
          </button>
          {aiEnabled && (
            <button
              type="button"
              onClick={() => handlePortalNavigate('D07')}
              className="px-3 py-1.5 rounded-md bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 dark:hover:bg-teal-900/60 text-[#0f766e] dark:text-[#2dd4bf] border border-teal-200 dark:border-teal-800 text-xs font-semibold transition-colors cursor-pointer"
            >
              {isZh ? 'D07 AI 銷售分析 ➔' : 'D07 AI Workspace ➔'}
            </button>
          )}
          {companies.length > 0 && (
            <button
              type="button"
              onClick={() =>
                exportSalesRowsCsv(`D00_Companies_${slicer.month}.csv`, companies, 'CompanyKey')
              }
              className="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
            >
              {isZh ? '匯出公司 CSV' : 'Export Companies CSV'}
            </button>
          )}
        </div>
      </div>

      <StateGuard
        state={state}
        error={error ? { code: error.code, reason: error.message } : null}
        onRetry={reload}
      >
        {kpis && (
          <>
            {/* Primary 4 Tier-1 KPI Cards with actual monthly sparklines */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <KpiCard
                title={isZh ? '淨銷售額 (Net Sales)' : 'Net Sales (USD)'}
                value={fmtUSD(kpis.netSalesUSD)}
                subValue={`YoY: ${fmtSignedPercent(analysis?.yoyGrowth)}`}
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
                footnote={
                  isZh
                    ? `去年同期: ${fmtUSD(analysis?.priorYearNetSalesUSD)}`
                    : `Prior Yr: ${fmtUSD(analysis?.priorYearNetSalesUSD)}`
                }
                drillThroughTarget="D02"
                trendSeries={salesTrend}
              />
              <KpiCard
                title={isZh ? '毛利額 (Gross Profit)' : 'Gross Profit (USD)'}
                value={fmtUSD(kpis.grossProfitUSD)}
                subValue={`GM%: ${fmtPercent(kpis.grossMarginPercent)}`}
                trend="neutral"
                tone="default"
                footnote={
                  isZh
                    ? `銷售成本: ${fmtUSD(kpis.netCostUSD)}`
                    : `Net Cost: ${fmtUSD(kpis.netCostUSD)}`
                }
                drillThroughTarget="D08"
                trendSeries={gpTrend}
              />
              <KpiCard
                title={isZh ? '淨銷售量 (Net Qty)' : 'Net Quantity (KG)'}
                value={fmtKG(kpis.netQtyKG)}
                subValue={`ASP: ${fmtPriceUSD(kpis.averageSellingPriceUSD)}`}
                trend="neutral"
                footnote={
                  isZh
                    ? `總出貨量: ${fmtKG(kpis.salesQtyKG)}`
                    : `Gross Qty: ${fmtKG(kpis.salesQtyKG)}`
                }
                drillThroughTarget="D04"
                trendSeries={qtyTrend}
              />
              <KpiCard
                title={isZh ? '不重複訂單數 (Orders)' : 'Distinct Orders'}
                value={fmtCount(kpis.orderCount)}
                subValue={`${fmtCount(kpis.salesLineCount)} ${isZh ? '行' : 'Lines'}`}
                trend="neutral"
                footnote={isZh ? 'SSAS 不重複訂單彙總' : 'SSAS Distinct Order Count'}
                drillThroughTarget="D06"
                trendSeries={orderTrend}
              />
            </div>

            {/* Secondary Compact Context Strip: Returns and Concentration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div
                role="button"
                tabIndex={0}
                onClick={() => handlePortalNavigate('D18')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handlePortalNavigate('D18');
                  }
                }}
                className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-2xs hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors cursor-pointer flex items-center justify-between"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {isZh ? '退貨監控 (Return Monitoring)' : 'Return Monitoring'}
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-lg font-bold font-mono text-slate-900 dark:text-white">
                      {fmtPercent(kpis.returnRatePercent)}
                    </span>
                    <span className="text-xs font-mono text-slate-500">
                      {fmtKG(kpis.returnQtyKG)} ({isZh ? '退貨量' : 'Return Qty'})
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                    {isZh
                      ? `全退 ${fmtCount(kpis.fullReturnLineCount)} 行 · 部退 ${fmtCount(
                          kpis.partialReturnLineCount
                        )} 行`
                      : `Full ${fmtCount(kpis.fullReturnLineCount)} · Partial ${fmtCount(
                          kpis.partialReturnLineCount
                        )} lines`}
                  </div>
                </div>
                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
                  D18 ➔
                </span>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => handlePortalNavigate('D11')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handlePortalNavigate('D11');
                  }
                }}
                className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-2xs hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors cursor-pointer flex items-center justify-between"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {isZh ? '前五大客戶集中度 (CR5)' : 'Top 5 Customer Concentration (CR5)'}
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-lg font-bold font-mono text-slate-900 dark:text-white">
                      {analysis?.concentrationStatus === 'available'
                        ? fmtPercent(analysis?.cr5)
                        : '—'}
                    </span>
                    <span className="text-xs font-mono text-slate-500">
                      {analysis?.concentrationStatus === 'available' && analysis.hhi !== null
                        ? `HHI: ${analysis.hhi.toFixed(4)}`
                        : analysis?.concentrationStatus || '—'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                    {isZh ? '依淨銷售額計算客戶營收佔比' : 'Customer revenue share by net sales'}
                  </div>
                </div>
                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
                  D11 ➔
                </span>
              </div>
            </div>

            <OperationsOverview onNavigate={onNavigate} />

            {/* Primary Charts Row: Core Monthly Trend + Company Comparison */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7 chart-panel bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-2xs">
                <div className="chart-panel-header mb-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      {isZh
                        ? '月度淨銷售額與毛利額走勢 (USD)'
                        : 'Monthly Net Sales & Gross Profit Trend (USD)'}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {isZh
                        ? `發票月份連續序列 (${monthly[0]?.key || '202401'}..${
                            monthly[monthly.length - 1]?.key || slicer.month
                          }，共 ${monthly.length} 個月) · 未平滑折線 · 點擊月份切換總覽`
                        : `Invoice Month series (${monthly.length} months) · Unsmoothed lines · Click month to open D01`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handlePortalNavigate('D15')}
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer shrink-0"
                  >
                    {isZh ? 'D15 滾動與累計 ➔' : 'D15 Rolling Sales ➔'}
                  </button>
                </div>
                <EChartsContainer
                  option={monthlyTrendOption}
                  height="300px"
                  onEvents={{
                    click: (params: any) => {
                      const m = monthly[params.dataIndex];
                      if (m) {
                        handlePortalNavigate('D01', { month: m.key });
                      }
                    },
                  }}
                />
              </div>

              <div className="lg:col-span-5 chart-panel bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-2xs">
                <div className="chart-panel-header mb-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      {isZh
                        ? `各營運公司淨銷售額與毛利額排行 (全母體 ${companies.length} 家, USD)`
                        : `Company Net Sales & Gross Profit (All ${companies.length} Companies, USD)`}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {isZh
                        ? `依淨銷售額排序 · 點擊公司長條下鑽產品明細`
                        : `Ranked by netSalesUSD · Click bar to drill down into products`}
                    </p>
                  </div>
                  {categories.length > 0 && (
                    <button
                      type="button"
                      onClick={handleOpenCategoryDrillDown}
                      className="text-xs font-semibold px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer shrink-0"
                    >
                      {isZh
                        ? `產品類別 (${categories.length}) 下鑽 ➔`
                        : `Categories (${categories.length}) Drill ➔`}
                    </button>
                  )}
                </div>
                <EChartsContainer
                  option={companyChartOption}
                  height="300px"
                  onEvents={{
                    click: (params: any) => {
                      const row = orderedCompanies[params.dataIndex];
                      if (row) {
                        openDrillDown({
                          title: isZh
                            ? `${row.key} (${row.label}) 銷售下鑽`
                            : `${row.key} (${row.label}) Drill-Down`,
                          subtitle: isZh
                            ? '依產品維度展開該公司銷售實績'
                            : 'Company sales breakdown by product',
                          dimensionName: isZh ? '公司' : 'Company',
                          dimensionValue: row.key,
                          sourceDashboard: 'D00',
                          groupBy: 'product',
                          filterOverrides: { company: row.key },
                          summaryMetrics: [
                            { label: isZh ? '淨銷售額' : 'Net Sales', value: fmtUSD(row.netSalesUSD) },
                            {
                              label: isZh ? '毛利額' : 'Gross Profit',
                              value: fmtUSD(row.grossProfitUSD),
                            },
                            {
                              label: isZh ? '毛利率' : 'GM %',
                              value: fmtPercent(row.grossMarginPercent),
                            },
                            { label: isZh ? '訂單數' : 'Orders', value: fmtCount(row.orderCount) },
                          ],
                          rows: [],
                          suggestedDrillThrough: [
                            {
                              targetTab: 'D01',
                              label: 'D01',
                              description: isZh
                                ? `鎖定 ${row.key} 查看銷售總覽`
                                : `View D01 for ${row.key}`,
                              slicerUpdates: { company: row.key },
                            },
                            {
                              targetTab: 'D04',
                              label: 'D04',
                              description: isZh
                                ? `鎖定 ${row.key} 查看產品組合`
                                : `View D04 for ${row.key}`,
                              slicerUpdates: { company: row.key },
                            },
                          ],
                        });
                      }
                    },
                  }}
                />
              </div>
            </div>

            {/* Compact Authorized Sales Directory */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    {isZh ? '銷售決策看板目錄 (點擊直達)' : 'Sales Analytics Directory'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {isZh
                      ? `共 ${visibleDashboards.length} 個授權銷售看板，切換時自動同步目前切片狀態`
                      : `${visibleDashboards.length} authorized sales views with synchronized slicer state`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAllDirectory(!showAllDirectory)}
                  className="px-2.5 py-1 rounded text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 cursor-pointer"
                >
                  {showAllDirectory
                    ? isZh
                      ? '精簡目錄'
                      : 'Compact View'
                    : isZh
                    ? '顯示技術基準'
                    : 'Detailed View'}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2.5">
                {visibleDashboards.map((dash) => (
                  <button
                    key={dash.id}
                    type="button"
                    onClick={() => handlePortalNavigate(dash.id)}
                    className="text-left p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30 transition-colors group cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="inline-flex items-center gap-1">
                        <span className="text-sm">{dash.icon}</span>
                        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                          {dash.id}
                        </span>
                      </span>
                      <span className="text-[11px] text-slate-400 group-hover:text-indigo-500 font-medium truncate">
                        {isZh ? dash.categoryZh : dash.categoryEn} ➔
                      </span>
                    </div>
                    <div className="mt-1 text-xs font-bold text-slate-900 dark:text-white truncate">
                      {isZh ? dash.nameZh : dash.nameEn}
                    </div>
                    {showAllDirectory && (
                      <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                        USD / KG · Invoice Date
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Full Monthly Series Table (Retains all raw monthly rows with details disclosure) */}
            {monthly.length > 0 && (
              <details
                open
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-2xs group"
              >
                <summary className="flex flex-wrap items-center justify-between gap-2 cursor-pointer select-none">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white inline-flex items-center gap-2">
                      <span>
                        {isZh
                          ? `發票月份銷售明細表 (共 ${monthly.length} 個完整月份)`
                          : `Invoice Months Sales Table (${monthly.length} Complete Months)`}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {isZh
                        ? '保留完整月度序列 · 點擊任一月份列進入 D01 該月總覽'
                        : 'Full monthly series retained · Click any row to open D01 for that month'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handlePortalNavigate('D15');
                    }}
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    {isZh ? '查看 D15 累計與滾動銷售 ➔' : 'Open D15 Rolling Sales ➔'}
                  </button>
                </summary>
                <div className="sales-table-wrap max-h-72 overflow-y-auto mt-3">
                  <table className="sales-table divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/90 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '發票月份 (Key)' : 'Invoice Month'}
                        </th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '淨銷售額 (USD)' : 'Net Sales (USD)'}
                        </th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '毛利額 (USD)' : 'Gross Profit (USD)'}
                        </th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '毛利率 (GM%)' : 'GM %'}
                        </th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '淨銷量 (KG)' : 'Net Qty (KG)'}
                        </th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '不重複訂單' : 'Distinct Orders'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                      {monthly.map((m) => (
                        <tr
                          key={m.key}
                          onClick={() => handlePortalNavigate('D01', { month: m.key })}
                          className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors ${
                            m.key === slicer.month ? 'bg-indigo-50/50 dark:bg-indigo-950/30' : ''
                          }`}
                        >
                          <td className="px-3 py-2 font-bold text-indigo-600 dark:text-indigo-400">
                            {m.label ? `${m.label} (${m.key})` : m.key}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">
                            {fmtUSD(m.netSalesUSD)}
                          </td>
                          <td className="px-3 py-2 text-right text-amber-600 dark:text-amber-400">
                            {fmtUSD(m.grossProfitUSD)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {fmtPercent(m.grossMarginPercent)}
                          </td>
                          <td className="px-3 py-2 text-right">{fmtKG(m.netQtyKG)}</td>
                          <td className="px-3 py-2 text-right">{fmtCount(m.orderCount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            {/* Quiet Compact Summary & Evidence Disclosure */}
            <AiInsightCard
              title={isZh ? 'D00 決策首頁實測數據摘要' : 'D00 Decision Home Executive Summary'}
              data={{
                observed: isZh
                  ? `當前切片 (${summaryLabels.monthLabel} · ${summaryLabels.companyLabel}) 淨銷售額 ${fmtUSD(
                      kpis.netSalesUSD
                    )}，毛利額 ${fmtUSD(kpis.grossProfitUSD)}（毛利率 ${fmtPercent(
                      kpis.grossMarginPercent
                    )}），淨銷售量 ${fmtKG(kpis.netQtyKG)}，不重複訂單數 ${fmtCount(
                      kpis.orderCount
                    )} 筆，銷售明細行數 ${fmtCount(kpis.salesLineCount)} 行。`
                  : `Current slice (${summaryLabels.monthLabel} · ${summaryLabels.companyLabel}) Net Sales ${fmtUSD(
                      kpis.netSalesUSD
                    )}, Gross Profit ${fmtUSD(kpis.grossProfitUSD)} (GM% ${fmtPercent(
                      kpis.grossMarginPercent
                    )}), Net Volume ${fmtKG(kpis.netQtyKG)}, Distinct Orders ${fmtCount(
                      kpis.orderCount
                    )}, Sales Lines ${fmtCount(kpis.salesLineCount)}.`,
                interpretation: isZh
                  ? `同期比較 YoY 成長率為 ${fmtSignedPercent(
                      analysis?.yoyGrowth
                    )}（去年同期淨銷售額 ${fmtUSD(
                      analysis?.priorYearNetSalesUSD
                    )}）；退貨率為 ${fmtPercent(
                      kpis.returnRatePercent
                    )}，平均銷售單價為 ${fmtPriceUSD(
                      kpis.averageSellingPriceUSD
                    )}，負毛利明細行數 ${fmtCount(kpis.negativeMarginLineCount)} 行。`
                  : `YoY growth is ${fmtSignedPercent(
                      analysis?.yoyGrowth
                    )} (Prior Year Net Sales ${fmtUSD(
                      analysis?.priorYearNetSalesUSD
                    )}); Return Rate is ${fmtPercent(
                      kpis.returnRatePercent
                    )}, Average Selling Price is ${fmtPriceUSD(
                      kpis.averageSellingPriceUSD
                    )}, Negative Margin Lines: ${fmtCount(kpis.negativeMarginLineCount)}.`,
                claimType: 'OBSERVATION',
                coverage: `${summaryLabels.monthLabel} · ${summaryLabels.companyLabel}`,
                confidence: 'SSAS Direct',
                evidenceId: data?.evidence?.requestId || 'D00',
                evidence: data?.evidence,
                source: data?.source,
                limitations: [
                  isZh
                    ? '本系統展示合成示範資料 (Synthetic Data)，五家公司共用維度主檔，免登入即可檢視公開銷售指標'
                    : 'Synthetic demo dataset with shared master dimensions across 5 companies; no login required',
                ],
                nextSteps: [
                  isZh ? '進入 D02 檢視月度銷售動能與同期 YoY 比較' : 'Go to D02 Sales Momentum & YoY',
                  isZh ? '進入 D04 檢視產品組合與類別銷售結構' : 'Go to D04 Product Mix',
                  isZh ? '進入 D06 檢視客戶營收與毛利貢獻排行' : 'Go to D06 Customer Contribution',
                ],
              }}
            />
          </>
        )}
      </StateGuard>
    </div>
  );
};

export default D00DecisionHome;
