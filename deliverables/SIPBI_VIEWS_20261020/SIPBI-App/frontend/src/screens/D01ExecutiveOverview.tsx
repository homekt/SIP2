import React from 'react';
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
  fmtUSD,
} from '../utils/salesFormat';

interface Props {
  slicer: Filters;
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

  const salesColor = '#4f46e5';
  const gpColor = isDark ? '#2dd4bf' : '#0f766e';
  const declineColor = isDark ? '#fb7185' : '#be123c';
  const axisLabelColor = isDark ? '#cbd5e1' : '#334155';
  const axisSubColor = isDark ? '#94a3b8' : '#64748b';
  const splitLineColor = isDark ? '#1e293b' : '#f1f5f9';

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

  // Panel 1A: Monthly Net Sales & Gross Profit Monetary Trend (Single USD Scale)
  const monthlyMonetaryOption = {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any[]) => {
        const idx = params?.[0]?.dataIndex;
        const m = typeof idx === 'number' ? monthly[idx] : undefined;
        if (!m) return '';
        return [
          `<strong>${m.label || m.key} (${m.key})</strong>`,
          `${isZh ? '淨銷售額 (Net Sales)' : 'Net Sales'}: <strong>${fmtUSD(m.netSalesUSD)}</strong>`,
          `${isZh ? '銷售成本 (Net Cost)' : 'Net Cost'}: ${fmtUSD(m.netCostUSD)}`,
          `${isZh ? '毛利額 (Gross Profit)' : 'Gross Profit'}: <strong>${fmtUSD(m.grossProfitUSD)}</strong>`,
          `${isZh ? '毛利率 (GM%)' : 'GM %'}: ${fmtPercent(m.grossMarginPercent)}`,
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
    grid: { left: 12, right: 16, bottom: 10, top: 34, containLabel: true },
    xAxis: {
      type: 'category',
      data: monthly.map((m) => m.key),
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

  // Panel 1B: Separated Monthly Weighted Gross Margin % Trend (Single % Scale)
  const monthlyGmPercentOption = {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any[]) => {
        const idx = params?.[0]?.dataIndex;
        const m = typeof idx === 'number' ? monthly[idx] : undefined;
        if (!m) return '';
        return [
          `<strong>${m.label || m.key} (${m.key})</strong>`,
          `${isZh ? '加權毛利率 (GM%)' : 'Weighted GM %'}: <strong>${fmtPercent(
            m.grossMarginPercent
          )}</strong>`,
          `${isZh ? '毛利額 / 淨銷售額' : 'GP / Net Sales'}: ${fmtUSD(
            m.grossProfitUSD
          )} / ${fmtUSD(m.netSalesUSD)}`,
        ].join('<br/>');
      },
    },
    legend: {
      top: 0,
      right: 0,
      textStyle: { color: axisLabelColor, fontSize: 12 },
      data: [isZh ? '毛利率 (GM %)' : 'Gross Margin (%)'],
      show: false,
    },
    grid: { left: 12, right: 16, bottom: 10, top: 30, containLabel: true },
    xAxis: {
      type: 'category',
      data: monthly.map((m) => m.key),
      axisLabel: {
        color: axisLabelColor,
        fontSize: 11,
        hideOverlap: true,
      },
      axisTick: { alignWithLabel: true },
    },
    yAxis: {
      type: 'value',
      name: 'GM %',
      nameTextStyle: { color: axisSubColor, fontSize: 11 },
      axisLabel: {
        color: axisSubColor,
        fontSize: 11,
        formatter: (v: number) => `${v.toFixed(1)}%`,
      },
      splitLine: { lineStyle: { color: splitLineColor } },
    },
    series: [
      {
        name: isZh ? '毛利率 (GM %)' : 'Gross Margin (%)',
        type: 'line',
        smooth: false,
        connectNulls: false,
        symbol: 'rect',
        symbolSize: 6,
        data: monthly.map((m) =>
          m.grossMarginPercent !== null ? Number((m.grossMarginPercent * 100).toFixed(2)) : null
        ),
        itemStyle: {
          color: (params: any) =>
            typeof params.value === 'number' && params.value < 0 ? declineColor : gpColor,
        },
        lineStyle: { width: 2.2, type: 'solid', color: gpColor },
      },
    ],
  };

  // Panel 2: Plant Net Sales Ranking (Title strictly matches the single Net Sales USD series)
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
          `<strong>${p.label} (${p.key})</strong>`,
          `${isZh ? '淨銷售額 (Net Sales)' : 'Net Sales'}: <strong>${fmtUSD(p.netSalesUSD)}</strong>`,
          `${isZh ? '毛利額 (Gross Profit)' : 'Gross Profit'}: ${fmtUSD(p.grossProfitUSD)}`,
          `${isZh ? '毛利率 (GM%)' : 'GM %'}: ${fmtPercent(p.grossMarginPercent)}`,
          `${isZh ? '淨銷量 (Net Qty)' : 'Net Qty'}: ${fmtKG(p.netQtyKG)}`,
          `${isZh ? '不重複訂單 (Orders)' : 'Distinct Orders'}: ${fmtCount(p.orderCount)}`,
        ].join('<br/>');
      },
    },
    grid: { left: 12, right: 24, bottom: 12, top: 16, containLabel: true },
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
      data: orderedPlants.map((p) => `${p.label} (${p.key})`),
      axisLabel: { color: axisLabelColor, fontSize: 12 },
    },
    series: [
      {
        name: isZh ? '淨銷售額 (USD)' : 'Net Sales (USD)',
        type: 'bar',
        data: orderedPlants.map((p) => p.netSalesUSD),
        itemStyle: { color: salesColor, borderRadius: [0, 4, 4, 0] },
        barMaxWidth: 24,
        label: {
          show: true,
          position: 'right',
          color: axisLabelColor,
          fontSize: 11,
          formatter: (params: any) =>
            typeof params.value === 'number' ? `$${(params.value / 1000).toFixed(0)}k` : '',
        },
      },
    ],
  };

  return (
    <div className="sales-dashboard">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {isZh ? 'D01 銷售總覽 (Executive Sales)' : 'D01 Executive Sales'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isZh
              ? '涵蓋淨銷售額、銷售成本、毛利額、毛利率、淨銷量、平均單價、訂單數與各公司/廠區實績分解'
              : 'Comprehensive view of Net Sales, Cost, Gross Profit, GM%, Net Qty, ASP, Orders, and Company/Plant breakdown'}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() =>
              exportSalesRowsCsv(`D01_Companies_${slicer.month}.csv`, companies, 'CompanyKey')
            }
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 cursor-pointer"
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
            {/* 4 Primary KPI Cards (Placed before charts and summary) */}
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
              />
            </div>

            {/* Charts Grid: Left = Separated Monetary Trend & GM% Panels, Right = Plant Net Sales Ranking */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7 flex flex-col gap-4">
                {/* Panel 1A: Monetary Trend (USD) */}
                <div className="chart-panel">
                  <div className="chart-panel-header">
                    <div>
                      <h3 className="chart-panel-title">
                        {isZh
                          ? '月度淨銷售額與毛利額走勢 (Invoice Date · 單一 USD 尺度)'
                          : 'Monthly Net Sales & Gross Profit Trend (Single USD Scale)'}
                      </h3>
                      <p className="chart-panel-subtitle">
                        {isZh
                          ? '未平滑連續時間序列 · 點擊任一月份可下鑽查看該月產品結構'
                          : 'Unsmoothed continuous series · Click any month to drill down into products'}
                      </p>
                    </div>
                  </div>
                  <EChartsContainer
                    option={monthlyMonetaryOption}
                    height="220px"
                    onEvents={{
                      click: (params: any) => handleMonthDrillDown(params.dataIndex),
                    }}
                  />
                </div>

                {/* Panel 1B: Separated GM% Panel (%) */}
                <div className="chart-panel">
                  <div className="chart-panel-header">
                    <div>
                      <h3 className="chart-panel-title">
                        {isZh
                          ? '月度加權毛利率走勢 (GM% = 毛利額 ÷ 淨銷售額 · 獨立 % 尺度)'
                          : 'Monthly Weighted Gross Margin % Trend (Independent % Scale)'}
                      </h3>
                      <p className="chart-panel-subtitle">
                        {isZh
                          ? '與上方金額面板對齊相同發票月份軸，避免金額與比率雙軸失真'
                          : 'Aligned to the same Invoice Month axis without dual-axis distortion'}
                      </p>
                    </div>
                  </div>
                  <EChartsContainer
                    option={monthlyGmPercentOption}
                    height="170px"
                    onEvents={{
                      click: (params: any) => handleMonthDrillDown(params.dataIndex),
                    }}
                  />
                </div>
              </div>

              {/* Panel 2: Plant Net Sales Ranking */}
              <div className="lg:col-span-5 chart-panel flex flex-col justify-between">
                <div>
                  <div className="chart-panel-header">
                    <div>
                      <h3 className="chart-panel-title">
                        {isZh
                          ? `各廠區 (Plant) 淨銷售額排行 (全母體 ${plants.length} 廠區, USD)`
                          : `Plant Net Sales Ranking (All ${plants.length} Plants, USD)`}
                      </h3>
                      <p className="chart-panel-subtitle">
                        {isZh
                          ? '依淨銷售額 降冪排序 · 點擊廠區長條可下鑽產品明細'
                          : 'Ranked by Net Sales (USD) descending · Click a plant bar to drill down into products'}
                      </p>
                    </div>
                  </div>
                  <EChartsContainer
                    option={plantBarOption}
                    height="380px"
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

            {/* Companies Performance Table */}
            <div className="chart-panel">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="chart-panel-title">
                    {isZh
                      ? '營運公司銷售與獲利明細表 (點擊公司進入 D02 動能分析)'
                      : 'Company Sales & Profitability Breakdown (Click row for D02 Momentum)'}
                  </h3>
                  <p className="chart-panel-subtitle">
                    {isZh
                      ? `全母體 ${companies.length} 家營運公司 · 依淨銷售額排序`
                      : `All ${companies.length} operating companies · Sorted by Net Sales (USD)`}
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  {companies.length} {isZh ? '家公司' : 'Companies'}
                </span>
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
                        <td className="px-3 py-2 text-right text-[#0f766e] dark:text-[#2dd4bf] font-semibold">
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
            </div>

            {/* Compact Summary & Evidence Receipt below KPIs, Charts & Table */}
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
