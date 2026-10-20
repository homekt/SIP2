import React, { useMemo } from 'react';
import { Filters } from '../types/sales';
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
        yoyFraction !== null ? Number((yoyFraction * 100).toFixed(2)) : null;

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

  const salesColor = '#4f46e5';
  const gpColor = isDark ? '#2dd4bf' : '#0f766e';
  const declineColor = isDark ? '#fb7185' : '#be123c';
  const secondaryColor = '#64748b';
  const axisLabelColor = isDark ? '#cbd5e1' : '#334155';
  const axisSubColor = isDark ? '#94a3b8' : '#64748b';
  const splitLineColor = isDark ? '#1e293b' : '#f1f5f9';

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
      `<strong>${row.label || row.key} (${row.key})</strong>`,
      `${isZh ? '當月淨銷售額 (Current)' : 'Current Net Sales'}: <strong>${fmtUSD(
        row.netSalesUSD
      )}</strong>`,
      `${isZh ? `去年同完整月 (${priorKey})` : `Prior-Year Same Month (${priorKey})`}: <strong>${priorStatusText}</strong>`,
      `${isZh ? '同期差額 (YoY Delta)' : 'YoY Delta (USD)'}: ${fmtSignedUSD(deltaUSD)}`,
      `${isZh ? '同期成長率 (YoY %)' : 'YoY Growth %'}: <strong>${fmtSignedPercent(
        yoyFraction
      )}</strong>`,
      `${isZh ? '當月毛利額 (GP)' : 'Gross Profit'}: ${fmtUSD(row.grossProfitUSD)}`,
    ].join('<br/>');
  };

  // Panel 1A: Monthly Net Sales Trend vs. Same Complete-Month Prior Year (USD, unsmoothed, gaps preserved)
  const monthlyTrendOption = {
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
    grid: { left: 12, right: 16, bottom: 10, top: 34, containLabel: true },
    xAxis: {
      type: 'category',
      data: alignedMonthlySeries.map((item) => item.row.key),
      axisLabel: {
        color: axisLabelColor,
        fontSize: 11,
        hideOverlap: true,
      },
      axisTick: { alignWithLabel: true },
    },
    yAxis: {
      type: 'value',
      name: 'USD',
      nameTextStyle: { color: axisSubColor, fontSize: 11 },
      axisLabel: {
        color: axisSubColor,
        fontSize: 11,
        formatter: (v: number) => `$${(v / 1000).toFixed(0)}k`,
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
        itemStyle: { color: secondaryColor },
        lineStyle: { width: 2, type: 'dashed', color: secondaryColor },
      },
    ],
  };

  // Panel 1B: Aligned Same Complete-Month Prior-Year YoY Growth % (Signed bar chart, zero baseline, gaps for unavailable history)
  const monthlyYoyOption = {
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
    grid: { left: 12, right: 16, bottom: 10, top: 30, containLabel: true },
    xAxis: {
      type: 'category',
      data: alignedMonthlySeries.map((item) => item.row.key),
      axisLabel: {
        color: axisLabelColor,
        fontSize: 11,
        hideOverlap: true,
      },
      axisTick: { alignWithLabel: true },
    },
    yAxis: {
      type: 'value',
      name: 'YoY %',
      nameTextStyle: { color: axisSubColor, fontSize: 11 },
      axisLabel: {
        color: axisSubColor,
        fontSize: 11,
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
                  color: item.yoyPercentValue >= 0 ? gpColor : declineColor,
                  borderRadius: item.yoyPercentValue >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3],
                },
              }
            : null
        ),
        barMaxWidth: 18,
      },
    ],
  };

  // Panel 2: Company Net Sales & Gross Profit Ranking (Single USD Scale, Horizontal Labels)
  const orderedCompanies = [...companies].reverse();
  const companyMomentumOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any[]) => {
        const idx = params?.[0]?.dataIndex;
        const c = typeof idx === 'number' ? orderedCompanies[idx] : undefined;
        if (!c) return '';
        return [
          `<strong>${c.label} (${c.key})</strong>`,
          `${isZh ? '淨銷售額 (Net Sales)' : 'Net Sales'}: <strong>${fmtUSD(c.netSalesUSD)}</strong>`,
          `${isZh ? '毛利額 (Gross Profit)' : 'Gross Profit'}: <strong>${fmtUSD(c.grossProfitUSD)}</strong>`,
          `${isZh ? '毛利率 (GM%)' : 'GM %'}: ${fmtPercent(c.grossMarginPercent)}`,
          `${isZh ? '淨銷量 (Net Qty)' : 'Net Qty'}: ${fmtKG(c.netQtyKG)}`,
          `${isZh ? '平均單價 (ASP)' : 'ASP'}: ${fmtPriceUSD(c.averageSellingPriceUSD)}`,
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
      nameTextStyle: { color: axisSubColor, fontSize: 11 },
      axisLabel: {
        color: axisSubColor,
        fontSize: 11,
        formatter: (v: number) => `$${(v / 1000).toFixed(0)}k`,
      },
      splitLine: { lineStyle: { color: splitLineColor } },
    },
    yAxis: {
      type: 'category',
      data: orderedCompanies.map((c) => `${c.label} (${c.key})`),
      axisLabel: { color: axisLabelColor, fontSize: 12 },
    },
    series: [
      {
        name: isZh ? '淨銷售額 (USD)' : 'Net Sales (USD)',
        type: 'bar',
        data: orderedCompanies.map((c) => c.netSalesUSD),
        itemStyle: { color: salesColor, borderRadius: [0, 3, 3, 0] },
        barMaxWidth: 18,
      },
      {
        name: isZh ? '毛利額 (USD)' : 'Gross Profit (USD)',
        type: 'bar',
        data: orderedCompanies.map((c) => c.grossProfitUSD),
        itemStyle: { color: gpColor, borderRadius: [0, 3, 3, 0] },
        barMaxWidth: 18,
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
    <div className="sales-dashboard">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {isZh ? 'D02 銷售動能 (Sales Momentum)' : 'D02 Sales Momentum'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isZh
              ? '檢視月度淨銷售額連續趨勢、同完整發票月份去年同期 (YoY) 對齊比較與各營運公司動能結構'
              : 'Monthly Net Sales trend, aligned same complete-month prior-year (YoY) comparison, and company momentum'}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() =>
              exportSalesRowsCsv(`D02_Monthly_${slicer.company}.csv`, monthly, 'MonthKey')
            }
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 cursor-pointer"
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
            {/* 4 Primary KPI Cards (Placed before charts and long text summary) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <KpiCard
                title={isZh ? '當期淨銷售額 (Current)' : 'Current Net Sales'}
                value={fmtUSD(kpis.netSalesUSD)}
                subValue={`${fmtCount(kpis.orderCount)} ${isZh ? '筆訂單' : 'Orders'}`}
                trend="neutral"
                footnote={summaryLabels.monthLabel}
              />
              <KpiCard
                title={isZh ? '去年同完整月淨銷售額 (Prior Year)' : 'Prior-Year Same Month'}
                value={fmtUSD(analysis?.priorYearNetSalesUSD)}
                subValue={analysis?.historyStatus || '—'}
                trend="neutral"
                footnote={
                  isZh
                    ? '同完整發票月份去年實績 (無前期則顯示 —)'
                    : 'Same complete invoice month prior year'
                }
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
              />
            </div>

            {/* Aligned Split Panels for Monthly Trend & YoY Comparison + Company Ranking */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7 flex flex-col gap-4">
                {/* Panel 1A: Monthly Net Sales vs Same Complete-Month Prior Year (USD) */}
                <div className="chart-panel">
                  <div className="chart-panel-header">
                    <div>
                      <h3 className="chart-panel-title">
                        {isZh
                          ? '月度淨銷售額與去年同完整月份對比走勢 (USD · 未平滑)'
                          : 'Monthly Net Sales vs. Same Complete-Month Prior Year (USD · Unsmoothed)'}
                      </h3>
                      <p className="chart-panel-subtitle">
                        {isZh
                          ? '與去年同完整發票月份 (YYYY-1 + MM) 對齊比較 · 2024 年無 2023 前期歷史區間保留空白斷點 (Gaps)'
                          : 'Same complete-month prior-year comparison · 2024 months without 2023 history shown as gaps'}
                      </p>
                    </div>
                  </div>
                  <EChartsContainer
                    option={monthlyTrendOption}
                    height="220px"
                    onEvents={{
                      click: handleMonthClick,
                    }}
                  />
                </div>

                {/* Panel 1B: Aligned Same Complete-Month YoY Growth % (Signed Bars, Zero Baseline) */}
                <div className="chart-panel">
                  <div className="chart-panel-header">
                    <div>
                      <h3 className="chart-panel-title">
                        {isZh
                          ? '月度同完整月份 YoY 成長率 (% · 零基線正負長條 · 缺失前期保留斷點)'
                          : 'Aligned Same Complete-Month YoY Growth % (Zero Baseline · Unavailable History as Gaps)'}
                      </h3>
                      <p className="chart-panel-subtitle">
                        {isZh
                          ? '正成長（正號）／衰退（負號） · 202401–202412 無去年同月歷史基準，保留為空白斷點不補零'
                          : 'Positive growth / Negative decline · 202401–202412 have no prior-year history and remain empty gaps'}
                      </p>
                    </div>
                  </div>
                  <EChartsContainer
                    option={monthlyYoyOption}
                    height="180px"
                    onEvents={{
                      click: handleMonthClick,
                    }}
                  />
                </div>
              </div>

              {/* Panel 2: Company Net Sales & Gross Profit Comparison */}
              <div className="lg:col-span-5 chart-panel flex flex-col justify-between">
                <div>
                  <div className="chart-panel-header">
                    <div>
                      <h3 className="chart-panel-title">
                        {isZh
                          ? `各營運公司淨銷售額與毛利額排行 (全母體 ${companies.length} 家, USD)`
                          : `Company Net Sales & Gross Profit (All ${companies.length} Companies, USD)`}
                      </h3>
                      <p className="chart-panel-subtitle">
                        {isZh
                          ? '單一 USD 座標軸 · 點擊公司長條下鑽產品銷售明細 (Tooltip 含 ASP 與銷量)'
                          : 'Single USD scale · Click company bar for product drill-down (ASP & Qty in tooltip)'}
                      </p>
                    </div>
                  </div>
                  <EChartsContainer
                    option={companyMomentumOption}
                    height="390px"
                    onEvents={{
                      click: (params: any) => {
                        const c = orderedCompanies[params.dataIndex];
                        if (c) {
                          openDrillDown({
                            title: isZh
                              ? `${c.key} (${c.label}) 銷售動能下鑽`
                              : `${c.key} (${c.label}) Momentum Drill-Down`,
                            dimensionName: isZh ? '公司' : 'Company',
                            dimensionValue: c.key,
                            sourceDashboard: 'D02',
                            groupBy: 'product',
                            filterOverrides: { company: c.key },
                            summaryMetrics: [
                              {
                                label: isZh ? '淨銷售額' : 'Net Sales',
                                value: fmtUSD(c.netSalesUSD),
                              },
                              {
                                label: isZh ? '毛利率' : 'GM %',
                                value: fmtPercent(c.grossMarginPercent),
                              },
                              {
                                label: isZh ? '平均單價' : 'ASP',
                                value: fmtPriceUSD(c.averageSellingPriceUSD),
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

            {/* Company Table */}
            <div className="chart-panel">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="chart-panel-title">
                    {isZh
                      ? '各公司當期銷售動能與數量指標表 (點擊公司下鑽產品)'
                      : 'Company Sales Momentum & Volume Table (Click row to drill down)'}
                  </h3>
                  <p className="chart-panel-subtitle">
                    {isZh
                      ? `全母體 ${companies.length} 家公司 · 完整保留淨銷售額、毛利額、GM%、淨銷量、ASP 與退貨率`
                      : `All ${companies.length} companies · Full Net Sales, GP, GM%, Net Qty, ASP, and Return Rate`}
                  </p>
                </div>
              </div>
              <div className="sales-table-wrap">
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
                        <td className="px-3 py-2 text-right text-[#0f766e] dark:text-[#2dd4bf]">
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
            </div>

            {/* Compact Summary & Evidence Receipt below KPIs, Charts & Table */}
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
