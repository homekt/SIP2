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

export const D01ExecutiveOverview: React.FC<Props> = ({ slicer }) => {
  const { theme, lang, navigate, openDrillDown, metadata, setLastDashboardContext } = useApp();
  const isDark = theme === 'dark';
  const isZh = lang === 'zh-TW';

  const { phase, data, error, reload } = useSalesDashboard('D01', slicer, setLastDashboardContext);
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
  const monthly = data?.datasets?.monthly || [];
  const companies = data?.datasets?.companies || [];
  const plants = data?.datasets?.plants || [];

  // Restrained semantic palette
  const salesColor = isDark ? '#60a5fa' : '#2563eb';
  const gmLineColor = isDark ? '#fbbf24' : '#d97706';
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

  const handleMonthDrillDown = (dataIndex: number) => {
    const m = monthly[dataIndex];
    if (m) {
      openDrillDown({
        title: isZh ? `${m.key} 月份銷售下鑽` : `${m.key} Monthly Sales Drill-Down`,
        dimensionName: isZh ? '月份' : 'Month',
        dimensionValue: m.key,
        sourceDashboard: 'D01',
        groupBy: 'product',
        filterOverrides: { month: m.key },
        summaryMetrics: [
          { label: isZh ? '淨銷售額' : 'Net Sales', value: fmtUSD(m.netSalesUSD) },
          { label: isZh ? '毛利額' : 'Gross Profit', value: fmtUSD(m.grossProfitUSD) },
          { label: isZh ? '毛利率' : 'GM %', value: fmtPercent(m.grossMarginPercent) },
          { label: isZh ? '訂單數' : 'Orders', value: fmtCount(m.orderCount) },
        ],
        rows: [],
      });
    }
  };

  // Primary Analytical View: Consolidate monthly monetary & GM% into ONE clear combo chart
  // Blue bars: Net Sales USD (left y-axis, 0-baseline)
  // Amber line: Weighted Gross Margin % (right y-axis)
  const monthlyComboOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', crossStyle: { color: axisSubColor } },
      formatter: (params: any[]) => {
        const idx = params?.[0]?.dataIndex;
        const m = typeof idx === 'number' ? monthly[idx] : undefined;
        if (!m) return '';
        return [
          `<strong>${escapeHtml(m.label || m.key)} (${escapeHtml(m.key)})</strong>`,
          `<span style="color:${salesColor}">●</span> ${isZh ? '淨銷售額 (Net Sales)' : 'Net Sales'}: <strong>${fmtUSD(
            m.netSalesUSD
          )}</strong>`,
          `${isZh ? '毛利額 (Gross Profit)' : 'Gross Profit'}: <strong>${fmtUSD(
            m.grossProfitUSD
          )}</strong>`,
          `<span style="color:${gmLineColor}">●</span> ${isZh ? '加權毛利率 (Weighted GM%)' : 'Weighted GM %'}: <strong>${fmtPercent(
            m.grossMarginPercent
          )}</strong>`,
          `${isZh ? '淨銷售量 (Net Qty)' : 'Net Qty'}: ${fmtKG(m.netQtyKG)}`,
          `${isZh ? '不重複訂單 (Orders)' : 'Distinct Orders'}: ${fmtCount(m.orderCount)}`,
        ].join('<br/>');
      },
    },
    legend: {
      bottom: 0,
      type: 'scroll',
      textStyle: { color: axisLabelColor, fontSize: 12 },
      data: [
        isZh ? '淨銷售額 (USD, 長條)' : 'Net Sales (USD, Bars)',
        isZh ? '加權毛利率 (%, 折線)' : 'Weighted GM % (Line)',
      ],
    },
    grid: { left: 16, right: 20, bottom: 42, top: 28, containLabel: true },
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
    yAxis: [
      {
        type: 'value',
        name: 'USD',
        min: (bound: { min: number }) => Math.min(0, Number.isFinite(bound.min) ? bound.min : 0),
        position: 'left',
        nameTextStyle: { color: salesColor, fontSize: 12, fontWeight: 'bold' },
        axisLine: { show: true, lineStyle: { color: salesColor } },
        axisLabel: {
          color: salesColor,
          fontSize: 12,
          formatter: (v: number) => Math.abs(v) >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : `$${(v / 1000).toFixed(0)}k`,
        },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      {
        type: 'value',
        name: 'GM %',
        position: 'right',
        nameTextStyle: { color: gmLineColor, fontSize: 12, fontWeight: 'bold' },
        axisLine: { show: true, lineStyle: { color: gmLineColor } },
        axisLabel: {
          color: gmLineColor,
          fontSize: 12,
          formatter: (v: number) => `${v.toFixed(0)}%`,
        },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: isZh ? '淨銷售額 (USD, 長條)' : 'Net Sales (USD, Bars)',
        type: 'bar',
        yAxisIndex: 0,
        data: monthly.map((m) => m.netSalesUSD),
        itemStyle: { color: salesColor, borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 16,
      },
      {
        name: isZh ? '加權毛利率 (%, 折線)' : 'Weighted GM % (Line)',
        type: 'line',
        yAxisIndex: 1,
        smooth: false,
        connectNulls: false,
        symbol: 'circle',
        symbolSize: 6,
        data: monthly.map((m) =>
          m.grossMarginPercent !== null ? m.grossMarginPercent * 100 : null
        ),
        itemStyle: { color: gmLineColor },
        lineStyle: { width: 2.5, type: 'solid', color: gmLineColor },
      },
    ],
  };

  // Secondary Analytical View: Plant Net Sales Ranking (10 plants with key drill)
  const orderedPlants = [...plants].reverse();
  const plantBarOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any[]) => {
        const idx = params?.[0]?.dataIndex;
        const p = typeof idx === 'number' ? orderedPlants[idx] : undefined;
        if (!p) return '';
        return [
          `<strong>${escapeHtml(p.label)} (${escapeHtml(p.key)})</strong>`,
          `${isZh ? '淨銷售額 (Net Sales)' : 'Net Sales'}: <strong>${fmtUSD(p.netSalesUSD)}</strong>`,
          `${isZh ? '毛利額 (Gross Profit)' : 'Gross Profit'}: ${fmtUSD(p.grossProfitUSD)}`,
          `${isZh ? '加權毛利率 (GM%)' : 'GM %'}: ${fmtPercent(p.grossMarginPercent)}`,
          `${isZh ? '淨銷量 (Net Qty)' : 'Net Qty'}: ${fmtKG(p.netQtyKG)}`,
          `${isZh ? '不重複訂單 (Orders)' : 'Distinct Orders'}: ${fmtCount(p.orderCount)}`,
        ].join('<br/>');
      },
    },
    grid: { left: 12, right: 36, bottom: 12, top: 20, containLabel: true },
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
      data: orderedPlants.map((p) => p.key.split('|').pop() || p.key),
      axisLabel: { color: axisLabelColor, fontSize: 12 },
    },
    series: [
      {
        name: isZh ? '淨銷售額 (USD)' : 'Net Sales (USD)',
        type: 'bar',
        data: orderedPlants.map((p) => p.netSalesUSD),
        itemStyle: { color: salesColor, borderRadius: [0, 4, 4, 0] },
        barMaxWidth: 16,
        label: {
          show: true,
          position: 'right',
          color: axisLabelColor,
          fontSize: 12,
          formatter: (params: any) =>
            typeof params.value === 'number' ? `$${(params.value / 1000).toFixed(0)}k` : '',
        },
      },
    ],
  };

  return (
    <div className="sales-dashboard space-y-4">
      {/* Header bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-3 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              {isZh ? 'D01 銷售總覽 (Executive Sales)' : 'D01 Executive Sales'}
            </h2>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              {summaryLabels.monthLabel} · {summaryLabels.companyLabel}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isZh
              ? '涵蓋淨銷售額、加權毛利率、淨銷量、平均單價、訂單數與各廠區實績分解'
              : 'Comprehensive view of Net Sales, Weighted GM%, Net Qty, ASP, Orders, and Plant contribution'}
          </p>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={() =>
              exportSalesRowsCsv(`D01_Companies_${slicer.month}.csv`, companies, 'CompanyKey')
            }
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
          >
            {isZh ? '📥 匯出公司銷售 CSV' : '📥 Export Company CSV'}
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
                footnote={
                  isZh
                    ? `去年同期: ${fmtUSD(analysis?.priorYearNetSalesUSD)}`
                    : `Prior Year: ${fmtUSD(analysis?.priorYearNetSalesUSD)}`
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
                    ? `淨銷售成本: ${fmtUSD(kpis.netCostUSD)}`
                    : `Net Cost: ${fmtUSD(kpis.netCostUSD)}`
                }
                drillThroughTarget="D08"
                trendSeries={gpTrend}
              />
              <KpiCard
                title={isZh ? '淨銷售量 (Net Qty)' : 'Net Quantity (KG)'}
                value={fmtKG(kpis.netQtyKG)}
                subValue={fmtPriceUSD(kpis.averageSellingPriceUSD)}
                trend="neutral"
                footnote={
                  isZh
                    ? `總出貨量: ${fmtKG(kpis.salesQtyKG)} | 退貨量: ${fmtKG(kpis.returnQtyKG)}`
                    : `Sales Qty: ${fmtKG(kpis.salesQtyKG)} | Return: ${fmtKG(kpis.returnQtyKG)}`
                }
                drillThroughTarget="D04"
                trendSeries={qtyTrend}
              />
              <KpiCard
                title={isZh ? '不重複訂單數 / 明細行數' : 'Distinct Orders / Lines'}
                value={fmtCount(kpis.orderCount)}
                subValue={`${fmtCount(kpis.salesLineCount)} ${isZh ? '行' : 'Lines'}`}
                trend="neutral"
                footnote={
                  isZh
                    ? `退貨率: ${fmtPercent(kpis.returnRatePercent)}`
                    : `Return Rate: ${fmtPercent(kpis.returnRatePercent)}`
                }
                drillThroughTarget="D18"
                trendSeries={orderTrend}
              />
            </div>

            {/* Consolidated Primary Analytical Views */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Primary View: Consolidated Combo Chart (Net Sales Bars USD left + Weighted GM% Line right) */}
              <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="chart-panel-header mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {isZh
                          ? '月度淨銷售額與加權毛利率走勢 (USD 長條 + GM% 折線組合圖)'
                          : 'Monthly Net Sales & Weighted Gross Margin (USD Bars + GM% Line)'}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {isZh
                          ? '左軸淨銷售額（藍色柱狀，0 基線）· 右軸加權毛利率（琥珀色折線）· 點擊月份下鑽產品明細'
                          : 'Left axis: Net Sales (blue bars, 0-baseline); Right axis: Weighted GM% (amber line); Click month to drill'}
                      </p>
                    </div>
                  </div>
                  <EChartsContainer
                    option={monthlyComboOption}
                    height="360px"
                    onEvents={{
                      click: (params: any) => handleMonthDrillDown(params.dataIndex),
                    }}
                  />
                </div>
              </div>

              {/* Secondary View: Plant Net Sales Ranking (10 Plants) */}
              <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="chart-panel-header mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {isZh
                          ? `各廠區 (Plant) 淨銷售額排行 (全母體 ${plants.length} 廠區, USD)`
                          : `Plant Net Sales Ranking (All ${plants.length} Plants, USD)`}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {isZh
                          ? '依淨銷售額降冪排序 · 點擊廠區長條下鑽該廠產品明細'
                          : 'Ranked by Net Sales (USD) · Click plant bar to drill down into products'}
                      </p>
                    </div>
                  </div>
                  <EChartsContainer
                    option={plantBarOption}
                    height="360px"
                    onEvents={{
                      click: (params: any) => {
                        const p = orderedPlants[params.dataIndex];
                        if (p) {
                          openDrillDown({
                            title: isZh
                              ? `${p.key} (${p.label}) 廠區銷售下鑽`
                              : `${p.key} (${p.label}) Plant Drill-Down`,
                            dimensionName: isZh ? '廠區' : 'Plant',
                            dimensionValue: p.key,
                            sourceDashboard: 'D01',
                            groupBy: 'product',
                            filterOverrides: { plant: p.key },
                            summaryMetrics: [
                              {
                                label: isZh ? '淨銷售額' : 'Net Sales',
                                value: fmtUSD(p.netSalesUSD),
                              },
                              {
                                label: isZh ? '毛利率' : 'GM %',
                                value: fmtPercent(p.grossMarginPercent),
                              },
                              {
                                label: isZh ? '淨銷量' : 'Net Qty',
                                value: fmtKG(p.netQtyKG),
                              },
                            ],
                            rows: [],
                          });
                        }
                      },
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Companies Performance Table with native details */}
            <details
              open
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-2xs group"
            >
              <summary className="flex items-center justify-between cursor-pointer select-none">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {isZh
                      ? '營運公司銷售與獲利明細表 (點擊公司進入 D02 動能分析)'
                      : 'Company Sales & Profitability Breakdown (Click row for D02 Momentum)'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {isZh
                      ? `全母體 ${companies.length} 家營運公司 · 依淨銷售額排序`
                      : `All ${companies.length} operating companies · Sorted by Net Sales (USD)`}
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
                        {isZh ? '銷售成本 (USD)' : 'Net Cost (USD)'}
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
                        {isZh ? '訂單數 / 行數' : 'Orders / Lines'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                    {companies.map((c) => (
                      <tr
                        key={c.key}
                        onClick={() => navigate('D02', { company: c.key })}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-2 font-sans">
                          <div className="font-bold text-indigo-600 dark:text-indigo-400">
                            {c.label}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">{c.key}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-bold">{fmtUSD(c.netSalesUSD)}</td>
                        <td className="px-3 py-2 text-right">{fmtUSD(c.netCostUSD)}</td>
                        <td className="px-3 py-2 text-right text-amber-600 dark:text-amber-400 font-semibold">
                          {fmtUSD(c.grossProfitUSD)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">
                          {fmtPercent(c.grossMarginPercent)}
                        </td>
                        <td className="px-3 py-2 text-right">{fmtKG(c.netQtyKG)}</td>
                        <td className="px-3 py-2 text-right">
                          {fmtPriceUSD(c.averageSellingPriceUSD)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {fmtCount(c.orderCount)} / {fmtCount(c.salesLineCount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            {/* Compact Summary & Evidence Receipt */}
            <AiInsightCard
              title={isZh ? 'D01 銷售總覽核心指標解讀' : 'D01 Executive Sales Highlights'}
              data={{
                observed: isZh
                  ? `於 ${summaryLabels.monthLabel} (${summaryLabels.companyLabel})，總淨銷售額為 ${fmtUSD(
                      kpis.netSalesUSD
                    )}，銷售成本 ${fmtUSD(kpis.netCostUSD)}，毛利額 ${fmtUSD(
                      kpis.grossProfitUSD
                    )}，加權毛利率 ${fmtPercent(kpis.grossMarginPercent)}。`
                  : `For ${summaryLabels.monthLabel} (${summaryLabels.companyLabel}), Total Net Sales is ${fmtUSD(
                      kpis.netSalesUSD
                    )}, Net Cost ${fmtUSD(kpis.netCostUSD)}, Gross Profit ${fmtUSD(
                      kpis.grossProfitUSD
                    )}, Weighted GM% ${fmtPercent(kpis.grossMarginPercent)}.`,
                interpretation: isZh
                  ? `累計年初至今 (YTD) 淨銷售額為 ${fmtUSD(
                      analysis?.ytdNetSalesUSD
                    )}，近 3 個月滾動銷售 (R3M) 為 ${fmtUSD(
                      analysis?.rolling3NetSalesUSD
                    )}，近 12 個月滾動銷售 (R12M) 為 ${fmtUSD(analysis?.rolling12NetSalesUSD)}。`
                  : `YTD Net Sales is ${fmtUSD(
                      analysis?.ytdNetSalesUSD
                    )}, Rolling 3-Month Sales is ${fmtUSD(
                      analysis?.rolling3NetSalesUSD
                    )}, and Rolling 12-Month Sales is ${fmtUSD(analysis?.rolling12NetSalesUSD)}.`,
                claimType: 'OBSERVATION',
                coverage: `${summaryLabels.monthLabel} · ${summaryLabels.companyLabel}`,
                confidence: 'SSAS Direct',
                evidenceId: data?.evidence?.requestId || 'D01',
                evidence: data?.evidence,
                source: data?.source,
                limitations: [
                  isZh
                    ? '不重複訂單數 (Order Count) 由 SSAS Cube Distinct Count 直接計算，不可由子維度直接相加'
                    : 'Distinct Order Count is evaluated directly by SSAS Cube and is non-additive across dimensions',
                ],
                nextSteps: [
                  isZh ? '進入 D02 檢視銷售動能與同期成長率' : 'Go to D02 Sales Momentum',
                  isZh ? '進入 D08 檢視產品與成本中心獲利品質' : 'Go to D08 Profitability',
                  isZh ? '進入 D15 檢視 YTD 與 R3M/R12M 滾動趨勢' : 'Go to D15 Rolling Sales',
                ],
              }}
            />
          </>
        )}
      </StateGuard>
    </div>
  );
};

export default D01ExecutiveOverview;
