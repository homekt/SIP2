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
  DASH,
  exportSalesRowsCsv,
  fmtCount,
  fmtKG,
  fmtPercent,
  fmtPriceUSD,
  fmtSignedUSD,
  fmtUSD,
} from '../utils/salesFormat';

interface Props {
  slicer: Filters;
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

  // Ranking basis: gross profit USD descending, nulls last. Stable tie-break on key.
  const rankedProducts = [...products].sort((a, b) => {
    if (a.grossProfitUSD === null && b.grossProfitUSD === null) return a.key.localeCompare(b.key);
    if (a.grossProfitUSD === null) return 1;
    if (b.grossProfitUSD === null) return -1;
    return b.grossProfitUSD - a.grossProfitUSD || a.key.localeCompare(b.key);
  });
  const topProducts = rankedProducts.slice(0, 12);

  // Cost-center GM% ranking: weighted margin fraction descending, nulls last.
  const rankedCostCenters = [...costCenters].sort((a, b) => {
    if (a.grossMarginPercent === null && b.grossMarginPercent === null)
      return a.key.localeCompare(b.key);
    if (a.grossMarginPercent === null) return 1;
    if (b.grossMarginPercent === null) return -1;
    return b.grossMarginPercent - a.grossMarginPercent || a.key.localeCompare(b.key);
  });

  const gpPosColor = isDark ? '#2dd4bf' : '#0f766e';
  const negColor = isDark ? '#fb7185' : '#be123c';

  const productGpOption = {
    title: {
      text: isZh ? '產品毛利額橫向排名 Top 12（按毛利額排序）' : 'Product Gross Profit Ranking — Top 12 by GP (USD)',
      subtext: isZh
        ? `按毛利額排序之前 12 項（共 ${products.length} 項產品）；符號 ± 區分正負，負毛利行數見提示與明細表`
        : `Top 12 of ${products.length} products ranked by Gross Profit; signs mark direction, negative-margin lines in tooltip & table`,
      subtextStyle: { fontSize: 11, color: isDark ? '#94a3b8' : '#64748b' },
      textStyle: { fontSize: 14, fontWeight: 'bold', color: isDark ? '#f1f5f9' : '#0f172a' },
    },
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const p = topProducts[params.dataIndex];
        if (!p) return '';
        return `<strong>${p.key} (${p.label})</strong><br/>${isZh ? '毛利額' : 'Gross Profit'}: ${fmtSignedUSD(
          p.grossProfitUSD
        )}<br/>${isZh ? '毛利率' : 'GM %'}: ${fmtPercent(p.grossMarginPercent)}<br/>${
          isZh ? '淨銷售額' : 'Net Sales'
        }: ${fmtUSD(p.netSalesUSD)}<br/>${isZh ? '負毛利行數' : 'Neg Margin Lines'}: ${fmtCount(
          p.negativeMarginLineCount
        )}`;
      },
    },
    grid: { left: '4%', right: '14%', bottom: '8%', top: '22%', containLabel: true },
    xAxis: {
      type: 'value',
      name: 'USD',
      min: (v: { min: number }) => Math.min(0, v.min),
      max: (v: { max: number }) => Math.max(0, v.max),
      axisLabel: {
        fontSize: 12,
        color: isDark ? '#94a3b8' : '#64748b',
        formatter: (v: number) => `$${(v / 1000).toFixed(0)}k`,
      },
      splitLine: { lineStyle: { color: isDark ? '#1e293b' : '#f1f5f9' } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: topProducts.map((p) => p.label),
      axisLabel: { color: isDark ? '#cbd5e1' : '#334155', fontSize: 12, interval: 0 },
    },
    series: [
      {
        name: isZh ? '毛利額 (USD)' : 'Gross Profit (USD)',
        type: 'bar',
        data: topProducts.map((p) => ({
          value: p.grossProfitUSD,
          itemStyle: {
            color: p.grossProfitUSD !== null && p.grossProfitUSD < 0 ? negColor : gpPosColor,
            borderRadius: [0, 4, 4, 0],
          },
        })),
        label: {
          show: true,
          position: 'right',
          fontSize: 11,
          color: isDark ? '#cbd5e1' : '#334155',
          formatter: (params: any) => fmtSignedUSD(topProducts[params.dataIndex]?.grossProfitUSD),
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { type: 'dashed', color: '#64748b', width: 1 },
          data: [{ xAxis: 0 }],
        },
      },
    ],
  };

  const costCenterMarginOption = {
    title: {
      text: isZh ? '成本中心毛利率排名（按 GM% 排序）' : 'Cost Center GM% Ranking (by GM%)',
      subtext: isZh
        ? `全部 ${rankedCostCenters.length} 個成本中心按毛利率排序；缺值以 ${DASH} 表示，不繪棒`
        : `All ${rankedCostCenters.length} cost centers ranked by GM%; missing shown as ${DASH}, no bar drawn`,
      subtextStyle: { fontSize: 11, color: isDark ? '#94a3b8' : '#64748b' },
      textStyle: { fontSize: 14, fontWeight: 'bold', color: isDark ? '#f1f5f9' : '#0f172a' },
    },
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const cc = rankedCostCenters[params.dataIndex];
        if (!cc) return '';
        return `<strong>${cc.key} (${cc.label})</strong><br/>${isZh ? '毛利率' : 'GM %'}: ${fmtPercent(
          cc.grossMarginPercent
        )}<br/>${isZh ? '毛利額' : 'Gross Profit'}: ${fmtUSD(cc.grossProfitUSD)}<br/>${
          isZh ? '淨銷售額' : 'Net Sales'
        }: ${fmtUSD(cc.netSalesUSD)}`;
      },
    },
    grid: { left: '4%', right: '14%', bottom: '8%', top: '22%', containLabel: true },
    xAxis: {
      type: 'value',
      name: 'GM%',
      min: (v: { min: number }) => Math.min(0, v.min),
      max: (v: { max: number }) => Math.max(0, v.max),
      axisLabel: {
        fontSize: 12,
        color: isDark ? '#94a3b8' : '#64748b',
        formatter: (v: number) => `${v.toFixed(0)}%`,
      },
      splitLine: { lineStyle: { color: isDark ? '#1e293b' : '#f1f5f9' } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: rankedCostCenters.map((cc) => cc.label),
      axisLabel: { color: isDark ? '#cbd5e1' : '#334155', fontSize: 12, interval: 0 },
    },
    series: [
      {
        name: isZh ? '毛利率' : 'GM %',
        type: 'bar',
        data: rankedCostCenters.map((cc) => ({
          value:
            cc.grossMarginPercent !== null ? Number((cc.grossMarginPercent * 100).toFixed(2)) : null,
          itemStyle: {
            color: cc.grossMarginPercent !== null && cc.grossMarginPercent < 0 ? negColor : gpPosColor,
            borderRadius: [0, 4, 4, 0],
          },
        })),
        label: {
          show: true,
          position: 'right',
          fontSize: 11,
          color: isDark ? '#cbd5e1' : '#334155',
          formatter: (params: any) => fmtPercent(rankedCostCenters[params.dataIndex]?.grossMarginPercent),
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { type: 'dashed', color: '#64748b', width: 1 },
          data: [{ xAxis: 0 }],
        },
      },
    ],
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {isZh ? 'D08 獲利品質 (Profitability)' : 'D08 Profitability Quality'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isZh
              ? '檢視毛利額、加權毛利率、銷售成本、負毛利明細行數、折讓行數與退貨率對獲利的影響'
              : 'Inspect Gross Profit, Weighted GM%, Net Cost, Negative Margin Lines, Allowances, and Return Rate'}
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

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <EChartsContainer
                  option={productGpOption}
                  height="380px"
                  onEvents={{
                    click: (params: any) => {
                      const p = topProducts[params.dataIndex];
                      if (p) {
                        openDrillDown({
                          title: isZh ? `${p.key} (${p.label}) 獲利下鑽` : `${p.key} (${p.label}) Profitability Drill-Down`,
                          dimensionName: isZh ? '產品' : 'Product',
                          dimensionValue: p.key,
                          sourceDashboard: 'D08',
                          groupBy: 'costCenter',
                          filterOverrides: { product: p.key },
                          summaryMetrics: [
                            { label: isZh ? '毛利額' : 'Gross Profit', value: fmtUSD(p.grossProfitUSD) },
                            { label: isZh ? '毛利率' : 'GM %', value: fmtPercent(p.grossMarginPercent) },
                            { label: isZh ? '負毛利行數' : 'Neg Margin Lines', value: fmtCount(p.negativeMarginLineCount) },
                            { label: isZh ? '折讓行數' : 'Allowance Lines', value: fmtCount(p.allowanceLineCount) },
                          ],
                          rows: [],
                        });
                      }
                    },
                  }}
                />
              </div>

              <div className="lg:col-span-5 min-w-0 max-h-[540px] overflow-y-auto bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <EChartsContainer
                  option={costCenterMarginOption}
                  height={`${Math.max(380, rankedCostCenters.length * 24 + 70)}px`}
                  onEvents={{
                    click: (params: any) => {
                      const cc = rankedCostCenters[params.dataIndex];
                      if (cc) {
                        openDrillDown({
                          title: isZh ? `${cc.key} (${cc.label}) 成本中心下鑽` : `${cc.key} (${cc.label}) Cost Center Drill-Down`,
                          dimensionName: isZh ? '成本中心' : 'Cost Center',
                          dimensionValue: cc.key,
                          sourceDashboard: 'D08',
                          groupBy: 'product',
                          filterOverrides: { costCenter: cc.key },
                          rows: [],
                        });
                      }
                    },
                  }}
                />
              </div>
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
                  ? `產品圖按毛利額排序（Top 12／共 ${products.length} 項），成本中心圖按毛利率排序（全部 ${rankedCostCenters.length} 個）；兩圖量綱各自獨立，不存在跨軸比較。`
                  : `Products ranked by Gross Profit (Top 12 of ${products.length}); cost centers ranked by GM% (all ${rankedCostCenters.length}); each panel uses its own unit with no cross-axis comparison.`,
                claimType: 'OBSERVATION',
                coverage: `${summaryLabels.monthLabel} · ${summaryLabels.companyLabel}`,
                confidence: 'SSAS Direct',
                evidenceId: data?.evidence?.requestId || 'D08',
                evidence: data?.evidence,
                source: data?.source,
                limitations: [
                  isZh
                    ? '本看板僅呈列認證之銷售毛利、成本、退貨與折讓行數，不包含任何製造報廢或機台稼動推論'
                    : 'Displays certified sales margin, cost, return, and allowance metrics only',
                ],
                nextSteps: [
                  isZh ? '進入 D14 檢視產品營收與毛利矩陣分佈' : 'Go to D14 Product Portfolio',
                  isZh ? '進入 D18 檢視負毛利、退貨與折讓觀察指標' : 'Go to D18 Sales Observations',
                ],
              }}
            />

            {/* Product Profitability Quality Table */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
                {isZh ? '產品獲利品質與退貨/折讓/負毛利明細表' : 'Product Profitability, Returns, Allowances & Negative Margin Lines'}
              </h3>
              <div className="overflow-x-auto">
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
                        <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                          {fmtUSD(p.grossProfitUSD)}
                        </td>
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
            </div>
          </>
        )}
      </StateGuard>
    </div>
  );
};

export default D08ProfitabilityQuality;
