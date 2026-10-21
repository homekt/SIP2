import React from 'react';
import { Filters } from '../types/sales';
import { useSalesDashboard } from '../services/salesApi';
import { StateGuard } from '../components/common/StateGuard';
import { KpiCard } from '../components/charts/KpiCard';
import { EChartsContainer } from '../components/charts/EChartsContainer';
import { AiInsightCard } from '../components/ai/AiInsightCard';
import { useApp } from '../context/AppContext';
import { getFilterSummaryLabels } from '../utils/slicerData';
import { computeGmAxisBounds } from '../utils/salesMath';
import {
  exportSalesRowsCsv,
  fmtCount,
  fmtKG,
  fmtPercent,
  fmtPriceUSD,
  fmtUSD,
} from '../utils/salesFormat';

interface Props {
  slicer: Filters;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function axisCompactUSD(value: number): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  const sign = amount < 0 ? '−' : '';
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  return `${sign}$${Math.round(abs / 1000)}k`;
}

function shortMonth(key: string): string {
  return key.length === 6 ? `${key.slice(2, 4)}/${key.slice(4, 6)}` : key;
}

export const D08ProfitabilityQuality: React.FC<Props> = ({ slicer }) => {
  const { theme, lang, openDrillDown, metadata, setLastDashboardContext } = useApp();
  const isDark = theme === 'dark';
  const isZh = lang === 'zh-TW';

  const { phase, data, error, reload } = useSalesDashboard('D08', slicer, setLastDashboardContext);
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
  const products = data?.datasets?.products || [];
  const costCenters = data?.datasets?.costCenters || [];
  const monthly = [...(data?.datasets?.monthly || [])].sort((a, b) =>
    a.key.localeCompare(b.key)
  );

  const salesBlue = isDark ? '#60a5fa' : '#2563eb';
  const costSlate = isDark ? '#94a3b8' : '#64748b';
  const marginAmber = isDark ? '#fbbf24' : '#d97706';
  const zeroColor = '#64748b';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';
  const splitColor = isDark ? '#1e293b' : '#f1f5f9';

  const salesName = isZh ? '淨銷售額 (USD)' : 'Net sales (USD)';
  const gmName = isZh ? '加權毛利率 (%)' : 'Weighted GM%';
  const costName = isZh ? '銷售成本 (USD)' : 'Net cost (USD)';
  const gpName = isZh ? '毛利額 (USD)' : 'Gross profit (USD)';

  const monthLabels = monthly.map((m) =>
    m.label && m.label.trim() ? m.label : shortMonth(m.key)
  );

  const axisTooltip = (index: number): string => {
    const m = monthly[index];
    if (!m) return '';
    return `<div style="font-size:12px;line-height:1.45">
      <div><b>${escapeHtml(m.label || m.key)}</b></div>
      <div style="font-family:ui-monospace,monospace">${escapeHtml(m.key)}</div>
      <div>${escapeHtml(salesName)}: ${fmtUSD(m.netSalesUSD)}</div>
      <div>${escapeHtml(costName)}: ${fmtUSD(m.netCostUSD)}</div>
      <div>${escapeHtml(gpName)}: ${fmtUSD(m.grossProfitUSD)}</div>
      <div>${escapeHtml(gmName)}: ${fmtPercent(m.grossMarginPercent)}</div>
      <div>${isZh ? '負毛利行數' : 'Neg margin lines'}: ${fmtCount(m.negativeMarginLineCount)}</div>
      <div>${isZh ? '退貨率' : 'Return rate'}: ${fmtPercent(m.returnRatePercent)}</div>
    </div>`;
  };

  // Primary view: monthly revenue (blue bars, left USD) vs weighted GM% (amber line, right %).
  const comboOption = {
    tooltip: {
      trigger: 'axis' as const,
      confine: true,
      textStyle: { fontSize: 12 },
      extraCssText: 'max-width:380px;white-space:normal;',
      formatter: (params: Array<{ dataIndex?: unknown }>) => {
        const idx = Array.isArray(params) ? params[0]?.dataIndex : undefined;
        return typeof idx === 'number' ? axisTooltip(idx) : '';
      },
    },
    legend: {
      type: 'scroll' as const,
      bottom: 0,
      textStyle: { color: mutedColor, fontSize: 12 },
      data: [
        { name: salesName, icon: 'roundRect' },
        { name: gmName, icon: 'rect' },
      ],
    },
    grid: { left: 8, right: 8, top: 24, bottom: 44, containLabel: true },
    xAxis: {
      type: 'category' as const,
      data: monthLabels,
      axisLabel: { color: mutedColor, fontSize: 12, hideOverlap: true },
      axisTick: { alignWithLabel: true },
    },
    yAxis: [
      {
        type: 'value' as const,
        name: 'USD',
        nameTextStyle: { color: salesBlue, fontSize: 12 },
        min: (bound: { min: number }) => Math.min(0, Number.isFinite(bound.min) ? bound.min : 0),
        max: (bound: { max: number }) => Math.max(0, Number.isFinite(bound.max) ? bound.max : 0),
        axisLabel: { color: salesBlue, fontSize: 12, formatter: (v: number) => axisCompactUSD(v) },
        axisLine: { show: true, lineStyle: { color: salesBlue, width: 1.25 } },
        splitLine: { lineStyle: { color: splitColor } },
      },
      {
        type: 'value' as const,
        name: 'GM%',
        scale: true,
        min: (bound: { min: number; max: number }) => computeGmAxisBounds(bound).min,
        max: (bound: { min: number; max: number }) => computeGmAxisBounds(bound).max,
        nameTextStyle: { color: marginAmber, fontSize: 12 },
        axisLabel: { color: marginAmber, fontSize: 12, formatter: (v: number) => (Number.isInteger(v) ? `${v.toFixed(0)}%` : `${v.toFixed(1)}%`) },
        axisLine: { show: true, lineStyle: { color: marginAmber, width: 1.25 } },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: salesName,
        type: 'bar' as const,
        yAxisIndex: 0,
        data: monthly.map((m) => m.netSalesUSD),
        itemStyle: { color: salesBlue, borderRadius: [3, 3, 0, 0] },
        markLine: {
          silent: true,
          symbol: 'none',
          label: { show: false },
          lineStyle: { color: zeroColor, width: 1.25, type: 'solid' as const },
          data: [{ yAxis: 0 }],
        },
      },
      {
        name: gmName,
        type: 'line' as const,
        yAxisIndex: 1,
        smooth: false,
        connectNulls: false,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 5,
        data: monthly.map((m) =>
          m.grossMarginPercent === null ? null : m.grossMarginPercent * 100
        ),
        itemStyle: { color: marginAmber },
        lineStyle: { color: marginAmber, width: 2.5 },
      },
    ],
  };

  // Supporting view: net sales = net cost (slate) + gross profit (amber).
  // The two segments are disjoint parts of net sales; revenue + GP is never stacked.
  const decompOption = {
    tooltip: {
      trigger: 'axis' as const,
      confine: true,
      textStyle: { fontSize: 12 },
      extraCssText: 'max-width:380px;white-space:normal;',
      formatter: (params: Array<{ dataIndex?: unknown }>) => {
        const idx = Array.isArray(params) ? params[0]?.dataIndex : undefined;
        if (typeof idx !== 'number') return '';
        const m = monthly[idx];
        if (!m) return '';
        const recon =
          m.netSalesUSD === null || m.netCostUSD === null || m.grossProfitUSD === null
            ? null
            : m.netSalesUSD - m.netCostUSD - m.grossProfitUSD;
        return `<div style="font-size:12px;line-height:1.45">
          <div><b>${escapeHtml(m.label || m.key)}</b></div>
          <div style="font-family:ui-monospace,monospace">${escapeHtml(m.key)}</div>
          <div>${escapeHtml(costName)}: ${fmtUSD(m.netCostUSD)}</div>
          <div>${escapeHtml(gpName)}: ${fmtUSD(m.grossProfitUSD)}</div>
          <div>${escapeHtml(salesName)}: ${fmtUSD(m.netSalesUSD)}</div>
          <div>${isZh ? '核對差（銷售 − 成本 − 毛利）' : 'Check (sales − cost − GP)'}: ${fmtUSD(recon)}</div>
        </div>`;
      },
    },
    legend: {
      type: 'scroll' as const,
      bottom: 0,
      textStyle: { color: mutedColor, fontSize: 12 },
      data: [
        { name: costName, icon: 'roundRect' },
        { name: gpName, icon: 'roundRect' },
      ],
    },
    grid: { left: 8, right: 8, top: 24, bottom: 44, containLabel: true },
    xAxis: {
      type: 'category' as const,
      data: monthLabels,
      axisLabel: { color: mutedColor, fontSize: 12, hideOverlap: true },
      axisTick: { alignWithLabel: true },
    },
    yAxis: {
      type: 'value' as const,
      name: 'USD',
      nameTextStyle: { color: mutedColor, fontSize: 12 },
      min: (bound: { min: number }) => Math.min(0, Number.isFinite(bound.min) ? bound.min : 0),
      max: (bound: { max: number }) => Math.max(0, Number.isFinite(bound.max) ? bound.max : 0),
      axisLabel: { color: mutedColor, fontSize: 12, formatter: (v: number) => axisCompactUSD(v) },
      splitLine: { lineStyle: { color: splitColor } },
    },
    series: [
      {
        name: costName,
        type: 'bar' as const,
        stack: 'net',
        stackStrategy: 'all' as const,
        data: monthly.map((m) => m.netCostUSD !== null && m.grossProfitUSD !== null ? m.netCostUSD : null),
        itemStyle: { color: costSlate, borderRadius: [0, 0, 0, 0] },
      },
      {
        name: gpName,
        type: 'bar' as const,
        stack: 'net',
        stackStrategy: 'all' as const,
        data: monthly.map((m) => m.netCostUSD !== null && m.grossProfitUSD !== null ? m.grossProfitUSD : null),
        itemStyle: { color: marginAmber, borderRadius: [3, 3, 0, 0] },
        markLine: {
          silent: true,
          symbol: 'none',
          label: { show: false },
          lineStyle: { color: zeroColor, width: 1.25, type: 'solid' as const },
          data: [{ yAxis: 0 }],
        },
      },
    ],
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {isZh ? 'D08 獲利品質 (Profitability)' : 'D08 Profitability Quality'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isZh
              ? '銷售如何轉成毛利與毛利率：先看每月營收與毛利率走勢，再看成本毛利組成。'
              : 'How sales turn into GP and margin: monthly revenue vs margin first, then the cost/GP split.'}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() =>
              exportSalesRowsCsv(
                `D08_Profitability_Products_${slicer.month}.csv`,
                products,
                'ProductKey'
              )
            }
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 cursor-pointer"
          >
            {isZh ? '📥 匯出獲利品質 CSV' : '📥 Export Profitability CSV'}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                title={isZh ? '加權毛利率 (GM%)' : 'Gross Margin %'}
                value={fmtPercent(kpis.grossMarginPercent)}
                subValue={fmtUSD(kpis.grossProfitUSD)}
                trend="neutral"
                tone="default"
                footnote={isZh ? `淨銷售額: ${fmtUSD(kpis.netSalesUSD)}` : `Net Sales: ${fmtUSD(kpis.netSalesUSD)}`}
              />
              <KpiCard
                title={isZh ? '淨銷售成本 (Net Cost)' : 'Net Cost (USD)'}
                value={fmtUSD(kpis.netCostUSD)}
                subValue={fmtPriceUSD(kpis.averageSellingPriceUSD)}
                trend="neutral"
                footnote={isZh ? '平均銷售單價 (ASP)' : 'Average Selling Price'}
              />
              <KpiCard
                title={isZh ? '負毛利明細行數' : 'Negative Margin Lines'}
                value={fmtCount(kpis.negativeMarginLineCount)}
                subValue={`${isZh ? '折讓行數' : 'Allowances'}: ${fmtCount(kpis.allowanceLineCount)}`}
                trend="neutral"
                tone={
                  kpis.negativeMarginLineCount && kpis.negativeMarginLineCount > 0
                    ? 'warning'
                    : 'default'
                }
                footnote={isZh ? '點擊穿透 D18 銷售觀察' : 'Click for D18 Observations'}
                drillThroughTarget="D18"
              />
              <KpiCard
                title={isZh ? '退貨率 (Return Rate)' : 'Return Rate %'}
                value={fmtPercent(kpis.returnRatePercent)}
                subValue={fmtKG(kpis.returnQtyKG)}
                trend="neutral"
                footnote={
                  isZh
                    ? `全退 ${fmtCount(kpis.fullReturnLineCount)} / 部退 ${fmtCount(kpis.partialReturnLineCount)}`
                    : `Full ${fmtCount(kpis.fullReturnLineCount)} / Partial ${fmtCount(kpis.partialReturnLineCount)}`
                }
                drillThroughTarget="D18"
              />
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {isZh ? '每月營收與加權毛利率（藍柱 USD 左軸＋amber 線 GM% 右軸）' : 'Monthly revenue vs weighted GM% (blue bars USD left, amber line GM% right)'}
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {isZh
                  ? '柱為淨銷售額（零基線），線為加權毛利率；缺值月份留白不斷線。負毛利行數不在 % 軸上，只在提示與明細。'
                  : 'Bars are net sales (zero baseline); the line is weighted GM%. Missing months stay gaps. Negative-margin counts never sit on the % axis; see tooltips and tables.'}
              </p>
              <div className="overflow-x-auto">
                <div className="min-w-[680px]">
                  <EChartsContainer option={comboOption} height="340px" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {isZh ? '淨銷售額組成：成本＋毛利（互斥組成可相加核對）' : 'Net sales split: cost + GP (disjoint parts that reconcile)'}
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {isZh
                  ? 'slate 為銷售成本、amber 為毛利，兩者相加等於淨銷售額；絕不堆疊「營收＋毛利」。無費用資料故不推論營業利益。提示附核對差。'
                  : 'Slate is net cost, amber is GP; they add to net sales. Revenue + GP is never stacked. No expense data, so no operating-profit claim. Tooltips carry the check.'}
              </p>
              <div className="overflow-x-auto">
                <div className="min-w-[680px]">
                  <EChartsContainer option={decompOption} height="300px" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
              <details open>
                <summary className="text-sm font-bold text-slate-900 dark:text-white cursor-pointer">
                  {isZh
                    ? `成本中心貢獻明細（全部 ${costCenters.length} 個，點列下鑽產品）`
                    : `Cost center contribution (all ${costCenters.length}; click a row to drill)`}
                </summary>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {isZh
                    ? '依淨銷售額排序；毛利率為既有加權值。負毛利行數為計數不得與 % 比較。'
                    : 'Ordered by net sales; GM% values are the source weighted rates. Negative-margin counts are counts, never comparable with %.'}
                </p>
                <div className="overflow-x-auto mt-3">
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/70">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '成本中心' : 'Cost Center'}
                        </th>
                        <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '淨銷售額 (USD)' : 'Net Sales'}
                        </th>
                        <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '銷售成本 (USD)' : 'Net Cost'}
                        </th>
                        <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '毛利額 (USD)' : 'Gross Profit'}
                        </th>
                        <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '毛利率' : 'GM %'}
                        </th>
                        <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '負毛利行數' : 'Neg GM Lines'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                      {[...costCenters]
                        .sort((a, b) => (b.netSalesUSD ?? -Infinity) - (a.netSalesUSD ?? -Infinity))
                        .map((cc) => (
                          <tr
                            key={cc.key}
                            onClick={() =>
                              openDrillDown({
                                title: isZh
                                  ? `${cc.key} (${cc.label}) 成本中心下鑽`
                                  : `${cc.key} (${cc.label}) Cost Center Drill-Down`,
                                dimensionName: isZh ? '成本中心' : 'Cost Center',
                                dimensionValue: cc.key,
                                sourceDashboard: 'D08',
                                groupBy: 'product',
                                filterOverrides: { costCenter: cc.key },
                                rows: [],
                              })
                            }
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                          >
                            <td className="px-3 py-2 font-sans">
                              <div className="font-bold text-indigo-600 dark:text-indigo-400">{cc.label}</div>
                              <div className="text-2xs font-mono text-slate-400">{cc.key}</div>
                            </td>
                            <td className="px-3 py-2 text-right font-bold">{fmtUSD(cc.netSalesUSD)}</td>
                            <td className="px-3 py-2 text-right">{fmtUSD(cc.netCostUSD)}</td>
                            <td className="px-3 py-2 text-right font-semibold">{fmtUSD(cc.grossProfitUSD)}</td>
                            <td className="px-3 py-2 text-right font-bold">{fmtPercent(cc.grossMarginPercent)}</td>
                            <td className="px-3 py-2 text-right text-rose-600 dark:text-rose-400 font-semibold">
                              {fmtCount(cc.negativeMarginLineCount)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>

            <AiInsightCard
              title={isZh ? 'D08 獲利品質與毛利侵蝕觀察' : 'D08 Profitability & Margin Erosion Summary'}
              data={{
                observed: isZh
                  ? `當前範圍總毛利額 ${fmtUSD(kpis.grossProfitUSD)}，加權毛利率 ${fmtPercent(
                      kpis.grossMarginPercent
                    )}，銷售成本 ${fmtUSD(kpis.netCostUSD)}；負毛利明細行數為 ${fmtCount(
                      kpis.negativeMarginLineCount
                    )} 行，折讓明細行數為 ${fmtCount(
                      kpis.allowanceLineCount
                    )} 行，退貨率為 ${fmtPercent(kpis.returnRatePercent)}。`
                  : `Total Gross Profit is ${fmtUSD(kpis.grossProfitUSD)}, Weighted GM% ${fmtPercent(
                      kpis.grossMarginPercent
                    )}, Net Cost ${fmtUSD(kpis.netCostUSD)}; Negative Margin Lines: ${fmtCount(
                      kpis.negativeMarginLineCount
                    )}, Allowance Lines: ${fmtCount(
                      kpis.allowanceLineCount
                    )}, Return Rate: ${fmtPercent(kpis.returnRatePercent)}.`,
                interpretation: isZh
                  ? '主圖同時呈現營收水準與毛利率走勢以辨識背離；組成圖驗證每月「成本＋毛利＝淨銷售額」。兩者皆為同一月序列的不同切面。'
                  : 'The main view shows revenue levels against the margin path to spot divergence; the split view verifies monthly cost + GP = net sales. Both are facets of the same monthly series.',
                claimType: 'OBSERVATION',
                coverage: `${summaryLabels.monthLabel} · ${summaryLabels.companyLabel}`,
                confidence: 'SSAS Direct',
                evidenceId: data?.evidence?.requestId || 'D08',
                evidence: data?.evidence,
                source: data?.source,
                limitations: [
                  isZh
                    ? '本看板僅呈列認證之銷售毛利、成本、退貨與折讓行數，不做營業利益推論；負毛利行數為計數不與毛利率並軸'
                    : 'Displays certified sales margin, cost, return, and allowance metrics only, with no operating-profit claim; negative-margin counts never share the % axis',
                ],
                nextSteps: [
                  isZh ? '進入 D14 檢視產品營收與毛利矩陣分佈' : 'Go to D14 Product Portfolio',
                  isZh ? '進入 D18 檢視負毛利、退貨與折讓觀察指標' : 'Go to D18 Sales Observations',
                ],
              }}
            />

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
              <details open>
                <summary className="text-sm font-bold text-slate-900 dark:text-white cursor-pointer">
                  {isZh ? '產品獲利品質與退貨/折讓/負毛利明細表' : 'Product Profitability, Returns, Allowances & Negative Margin Lines'}
                </summary>
                <div className="overflow-x-auto mt-3">
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/70">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '產品' : 'Product'}
                        </th>
                        <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '淨銷售額 (USD)' : 'Net Sales'}
                        </th>
                        <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '銷售成本 (USD)' : 'Net Cost'}
                        </th>
                        <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '毛利額 (USD)' : 'Gross Profit'}
                        </th>
                        <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '毛利率' : 'GM %'}
                        </th>
                        <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '平均單價' : 'ASP'}
                        </th>
                        <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '退貨率' : 'Return %'}
                        </th>
                        <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '負毛利行數' : 'Neg GM Lines'}
                        </th>
                        <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {isZh ? '折讓行數' : 'Allowance Lines'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                      {products.map((p) => (
                        <tr
                          key={p.key}
                          onClick={() =>
                            openDrillDown({
                              title: isZh ? `${p.key} (${p.label}) 獲利下鑽` : `${p.key} (${p.label}) Drill-Down`,
                              dimensionName: isZh ? '產品' : 'Product',
                              dimensionValue: p.key,
                              sourceDashboard: 'D08',
                              groupBy: 'customer',
                              filterOverrides: { product: p.key },
                              rows: [],
                            })
                          }
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                        >
                          <td className="px-3 py-2 font-sans">
                            <div className="font-bold text-indigo-600 dark:text-indigo-400">{p.label}</div>
                            <div className="text-2xs font-mono text-slate-400">{p.key}</div>
                          </td>
                          <td className="px-3 py-2 text-right font-bold">{fmtUSD(p.netSalesUSD)}</td>
                          <td className="px-3 py-2 text-right">{fmtUSD(p.netCostUSD)}</td>
                          <td className="px-3 py-2 text-right font-semibold">{fmtUSD(p.grossProfitUSD)}</td>
                          <td className="px-3 py-2 text-right font-bold">{fmtPercent(p.grossMarginPercent)}</td>
                          <td className="px-3 py-2 text-right">{fmtPriceUSD(p.averageSellingPriceUSD)}</td>
                          <td className="px-3 py-2 text-right">{fmtPercent(p.returnRatePercent)}</td>
                          <td className="px-3 py-2 text-right text-rose-600 dark:text-rose-400 font-semibold">
                            {fmtCount(p.negativeMarginLineCount)}
                          </td>
                          <td className="px-3 py-2 text-right">{fmtCount(p.allowanceLineCount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          </>
        )}
      </StateGuard>
    </div>
  );
};

export default D08ProfitabilityQuality;
