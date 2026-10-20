import React from 'react';
import { Filters, SalesRow } from '../types/sales';
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
  fmtKG,
  fmtPercent,
  fmtPriceUSD,
  fmtUSD,
} from '../utils/salesFormat';

const escapeHtml = (v: string) => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string));

interface Props {
  slicer: Filters;
}

export const D14ProductPortfolio: React.FC<Props> = ({ slicer }) => {
  const { theme, lang, openDrillDown, metadata, setLastDashboardContext } = useApp();
  const isDark = theme === 'dark';
  const isZh = lang === 'zh-TW';

  const { phase, data, error, reload } = useSalesDashboard('D14', slicer, setLastDashboardContext);
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
  const revenueMedian = data?.analysis?.portfolio?.revenueMedian ?? null;
  const weightedMargin = data?.analysis?.portfolio?.weightedMargin ?? null;
  const thresholdsValid = revenueMedian !== null && weightedMargin !== null;
  const weightedMarginPct = weightedMargin !== null ? weightedMargin * 100 : null;

  const quadrantOf = (p: SalesRow): number => {
    if (
      revenueMedian === null ||
      weightedMargin === null ||
      p.netSalesUSD === null ||
      p.grossMarginPercent === null
    ) {
      return -1;
    }
    const highRev = p.netSalesUSD >= revenueMedian;
    const highMargin = p.grossMarginPercent >= weightedMargin;
    if (highRev && highMargin) return 0;
    if (highRev && !highMargin) return 1;
    if (!highRev && highMargin) return 2;
    return 3;
  };

  const quadrants = [
    { label: isZh ? '高營收 · 高毛利' : 'High Revenue · High Margin', color: isDark ? '#60a5fa' : '#2563eb' },
    { label: isZh ? '高營收 · 低於加權毛利' : 'High Revenue · Below-Avg Margin', color: isDark ? '#c4b5fd' : '#7c3aed' },
    { label: isZh ? '低於中位營收 · 高毛利' : 'Below-Median Rev · High Margin', color: isDark ? '#fbbf24' : '#d97706' },
    { label: isZh ? '低於中位營收 · 低於加權毛利' : 'Below-Median Rev · Below-Avg Margin', color: isDark ? '#94a3b8' : '#64748b' },
  ];

  const plotted = products.filter((p) => p.netSalesUSD !== null && p.grossMarginPercent !== null);
  const excluded = products.length - plotted.length;
  const unclassifiedLabel = isZh ? '未分類（基準缺值）' : 'Unclassified (null thresholds)';

  const markLineStyle = { type: 'dashed', color: '#64748b', width: 1.5 };

  const scatterOption = {
    title: {
      text: isZh ? '產品營收與毛利率分佈矩陣 (USD vs GM%)' : 'Product Revenue vs. Gross Margin % Matrix',
      subtext: isZh
        ? `分界：營收中位數 ${fmtUSD(revenueMedian)} · 加權毛利率 ${fmtPercent(weightedMargin)}；散點 ${plotted.length} 項${
            excluded > 0 ? `（缺值未繪 ${excluded} 項，見明細表）` : ''
          }；毛利率軸依資料範圍顯示，內部統計比較`
        : `Thresholds: Revenue Median ${fmtUSD(revenueMedian)} · Weighted GM% ${fmtPercent(weightedMargin)}; plotted ${plotted.length}${
            excluded > 0 ? ` (${excluded} null-valued excluded, see table)` : ''
          }; internal statistical comparison, not market BCG`,
      subtextStyle: { fontSize: 11, color: isDark ? '#94a3b8' : '#64748b' },
      textStyle: { fontSize: 14, fontWeight: 'bold', color: isDark ? '#f1f5f9' : '#0f172a' },
    },
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const d = params.data;
        if (!d) return '';
        const p = products.find((x) => x.key === d.key);
        const qi = p ? quadrantOf(p) : -1;
        return `<strong>${escapeHtml(d.key)} (${escapeHtml(d.label)})</strong><br/>${isZh ? '淨銷售額' : 'Net Sales'}: ${fmtUSD(
          d.value[0]
        )}<br/>${isZh ? '毛利額' : 'Gross Profit'}: ${fmtUSD(d.gp)}<br/>${isZh ? '毛利率' : 'GM %'}: ${
          d.value[1] !== null && d.value[1] !== undefined ? `${Number(d.value[1]).toFixed(1)}%` : DASH
        }<br/>${isZh ? '淨銷量' : 'Net Qty'}: ${fmtKG(d.qty)}<br/>${
          isZh ? '象限' : 'Quadrant'
        }: ${qi >= 0 ? quadrants[qi].label : DASH}`;
      },
    },
    legend: {
      type: 'scroll',
      bottom: 0,
      textStyle: { color: isDark ? '#cbd5e1' : '#475569', fontSize: 12 },
      data: thresholdsValid ? quadrants.map((q) => q.label) : [unclassifiedLabel],
    },
    grid: { left: '6%', right: '8%', bottom: '16%', top: '22%', containLabel: true },
    xAxis: {
      type: 'value',
      name: isZh ? '淨銷售額 (USD)' : 'Net Sales (USD)',
      nameLocation: 'middle',
      nameGap: 30,
      min: (v: { min: number }) => Math.min(0, v.min),
      axisLabel: {
        fontSize: 12,
        color: isDark ? '#94a3b8' : '#64748b',
        formatter: (v: number) => `$${(v / 1000).toFixed(0)}k`,
      },
      splitLine: { lineStyle: { color: isDark ? '#1e293b' : '#f1f5f9' } },
    },
    yAxis: {
      type: 'value',
      name: isZh ? '毛利率 (%)' : 'Gross Margin (%)',
      max: (v: { max: number }) => Number.isFinite(v.max) ? Math.ceil(v.max + 1) : 1,
      min: (v: { min: number }) => Number.isFinite(v.min) ? Math.floor(v.min - 1) : 0,
      axisLabel: {
        fontSize: 12,
        color: isDark ? '#94a3b8' : '#64748b',
        formatter: (v: number) => `${v.toFixed(1)}%`,
      },
      splitLine: { lineStyle: { color: isDark ? '#1e293b' : '#f1f5f9' } },
    },
    series: [...quadrants.map((q, qi) => ({
      name: q.label,
      type: 'scatter',
      symbol: ['circle', 'diamond', 'rect', 'triangle'][qi],
      symbolSize: 8,
      itemStyle: { color: q.color },
      data: plotted
        .filter((p) => quadrantOf(p) === qi)
        .map((p) => ({
          key: p.key,
          label: p.label,
          qty: p.netQtyKG,
          gp: p.grossProfitUSD,
          value: [p.netSalesUSD, (p.grossMarginPercent as number) * 100],
          itemStyle: { color: q.color, borderColor: isDark ? '#0f172a' : '#ffffff', borderWidth: 1 },
        })),
      markLine: thresholdsValid && qi === 0
        ? {
            silent: true,
            symbol: 'none',
            lineStyle: markLineStyle,
            label: { position: 'insideEndTop', fontSize: 12, color: isDark ? '#94a3b8' : '#64748b', formatter: (params: any) => params.name === 'Revenue Median' ? (isZh ? '營收中位數' : 'Revenue median') : (isZh ? '加權毛利率' : 'Weighted GM') },
            data: [
              { xAxis: revenueMedian as number, name: 'Revenue Median' },
              { yAxis: weightedMarginPct as number, name: 'Weighted GM%' },
            ],
          }
        : undefined,
    })),
    {
      name: unclassifiedLabel,
      type: 'scatter',
      symbolSize: 8,
      itemStyle: { color: '#64748b' },
      data: plotted
        .filter((p) => quadrantOf(p) === -1)
        .map((p) => ({
          key: p.key,
          label: p.label,
          qty: p.netQtyKG,
          gp: p.grossProfitUSD,
          value: [p.netSalesUSD, (p.grossMarginPercent as number) * 100],
          itemStyle: { color: '#64748b', borderColor: isDark ? '#0f172a' : '#ffffff', borderWidth: 1 },
        })),
    },
    ],
  };

  return (
    <div className="sales-dashboard">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {isZh ? 'D14 產品營收與毛利矩陣 (Product Portfolio)' : 'D14 Product Portfolio Matrix'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isZh
              ? '以所選範圍之產品營收中位數 (Revenue Median) 與加權毛利率 (Weighted Margin) 進行雙軸矩陣定位'
              : 'Dual-axis product matrix using certified Revenue Median and Weighted Gross Margin thresholds'}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() =>
              exportSalesRowsCsv(`D14_Portfolio_${slicer.month}.csv`, products, 'ProductKey')
            }
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 cursor-pointer"
          >
            {isZh ? '📥 匯出產品矩陣 CSV' : '📥 Export Portfolio CSV'}
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
                title={isZh ? '產品營收中位數 (Median)' : 'Product Revenue Median'}
                value={fmtUSD(revenueMedian)}
                subValue={`${products.length} ${isZh ? '項產品' : 'Products'}`}
                trend="neutral"
                footnote={isZh ? 'X 軸矩陣垂直分界線' : 'X-Axis Vertical Threshold'}
              />
              <KpiCard
                title={isZh ? '整體加權毛利率 (Weighted GM%)' : 'Weighted Gross Margin'}
                value={fmtPercent(weightedMargin)}
                subValue={fmtUSD(kpis.grossProfitUSD)}
                trend="neutral"
                tone="default"
                footnote={isZh ? 'Y 軸矩陣水平分界線' : 'Y-Axis Horizontal Threshold'}
              />
              <KpiCard
                title={isZh ? '高營收且高毛利產品數' : 'High Rev & High Margin Count'}
                value={String(
                  products.filter(
                    (p) =>
                      revenueMedian !== null &&
                      weightedMargin !== null &&
                      p.netSalesUSD !== null &&
                      p.grossMarginPercent !== null &&
                      p.netSalesUSD >= revenueMedian &&
                      p.grossMarginPercent >= weightedMargin
                  ).length
                )}
                subValue={isZh ? '高於雙基準門檻' : 'Above both thresholds'}
                trend="neutral"
                tone="default"
                footnote={isZh ? '營收 >= 中位數 且 毛利率 >= 加權毛利率' : 'Rev >= Median & GM% >= Weighted'}
              />
              <KpiCard
                title={isZh ? '總淨銷售額 (Net Sales)' : 'Total Net Sales'}
                value={fmtUSD(kpis.netSalesUSD)}
                subValue={fmtKG(kpis.netQtyKG)}
                trend="neutral"
                footnote={fmtPriceUSD(kpis.averageSellingPriceUSD)}
              />
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <EChartsContainer
                option={scatterOption}
                height="400px"
                onEvents={{
                  click: (params: any) => {
                    const key = params.data?.key;
                    const p = products.find((x) => x.key === key);
                    if (p) {
                      openDrillDown({
                        title: isZh ? `${p.key} (${p.label}) 矩陣下鑽` : `${p.key} (${p.label}) Matrix Drill-Down`,
                        dimensionName: isZh ? '產品' : 'Product',
                        dimensionValue: p.key,
                        sourceDashboard: 'D14',
                        groupBy: 'customer',
                        filterOverrides: { product: p.key },
                        summaryMetrics: [
                          { label: isZh ? '淨銷售額' : 'Net Sales', value: fmtUSD(p.netSalesUSD) },
                          { label: isZh ? '毛利率' : 'GM %', value: fmtPercent(p.grossMarginPercent) },
                          { label: isZh ? '平均單價' : 'ASP', value: fmtPriceUSD(p.averageSellingPriceUSD) },
                        ],
                        rows: [],
                      });
                    }
                  },
                }}
              />
            </div>

            <AiInsightCard
              title={isZh ? 'D14 產品營收與毛利矩陣基準說明' : 'D14 Product Portfolio Thresholds'}
              data={{
                observed: isZh
                  ? `當前切片共 ${products.length} 項產品，產品營收中位數 (revenueMedian) 為 ${fmtUSD(
                      revenueMedian
                    )}，整體加權毛利率 (weightedMargin) 為 ${fmtPercent(weightedMargin)}；散點繪製 ${plotted.length} 項${
                      excluded > 0 ? `，${excluded} 項因營收或毛利率缺值未繪（見明細表）` : ''
                    }。`
                  : `Active slice covers ${products.length} products with Revenue Median of ${fmtUSD(
                      revenueMedian
                    )} and Weighted Gross Margin of ${fmtPercent(weightedMargin)}; ${plotted.length} plotted${
                      excluded > 0 ? `, ${excluded} null-valued excluded (see table)` : ''
                    }.`,
                interpretation: isZh
                  ? '水平分界線代表所選範圍之整體加權毛利率（總毛利 / 總淨銷售額），垂直分界線代表各產品淨銷售額之中位數，完全由實測數據內生決定；點徑固定，不代表營收規模。'
                  : 'Horizontal threshold is the aggregate weighted gross margin (Total GP / Total Net Sales), and vertical threshold is the median product Net Sales. Dot size is fixed and encodes nothing.',
                claimType: 'ARITHMETIC_CONTRIBUTION',
                coverage: `${summaryLabels.monthLabel} · ${summaryLabels.companyLabel}`,
                confidence: 'SSAS Direct',
                evidenceId: data?.evidence?.requestId || 'D14',
                evidence: data?.evidence,
                source: data?.source,
                limitations: [
                  isZh
                    ? '本矩陣僅使用實測營收中位數與加權毛利率分界，不宣稱外部市佔率或成長率象限'
                    : 'Matrix uses internal revenue median and weighted margin only without external market-share claims',
                ],
                nextSteps: [
                  isZh ? '進入 D04 檢視產品類別組合' : 'Go to D04 Product Mix',
                  isZh ? '進入 D08 檢視各產品獲利品質與退貨折讓' : 'Go to D08 Profitability Quality',
                ],
              }}
            />

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
                {isZh ? '產品營收與毛利矩陣定位明細表' : 'Product Portfolio Matrix Classification Table'}
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/70">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '產品' : 'Product'}
                      </th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '矩陣象限分類' : 'Matrix Classification'}
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                    {products.map((p) => {
                      const qi = quadrantOf(p);
                      const q = qi >= 0 ? quadrants[qi] : { label: DASH, color: '#64748b' };
                      return (
                        <tr
                          key={p.key}
                          onClick={() =>
                            openDrillDown({
                              title: isZh ? `${p.key} (${p.label}) 客戶下鑽` : `${p.key} (${p.label}) Customer Drill-Down`,
                              dimensionName: isZh ? '產品' : 'Product',
                              dimensionValue: p.key,
                              sourceDashboard: 'D14',
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
                          <td className="px-3 py-2 font-sans">
                            <span
                              className="inline-block px-2 py-0.5 rounded-full text-2xs font-bold text-white"
                              style={{ backgroundColor: q.color }}
                            >
                              {q.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-bold">{fmtUSD(p.netSalesUSD)}</td>
                          <td className="px-3 py-2 text-right text-amber-700 dark:text-amber-400">
                            {fmtUSD(p.grossProfitUSD)}
                          </td>
                          <td className="px-3 py-2 text-right font-bold">{fmtPercent(p.grossMarginPercent)}</td>
                          <td className="px-3 py-2 text-right">{fmtKG(p.netQtyKG)}</td>
                          <td className="px-3 py-2 text-right">{fmtPriceUSD(p.averageSellingPriceUSD)}</td>
                        </tr>
                      );
                    })}
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

export default D14ProductPortfolio;
