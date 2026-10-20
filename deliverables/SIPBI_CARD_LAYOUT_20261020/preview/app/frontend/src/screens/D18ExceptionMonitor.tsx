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
  downloadCsv,
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
        data: heatData.map(([x, y, v]) => ({ value: [x, y, v ?? '-'] })),
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
                    if (p) {
                      openDrillDown({
                        title: isZh ? `${escapeHtml(p.key)} (${escapeHtml(p.label)}) 銷售觀察下鑽` : `${escapeHtml(p.key)} (${escapeHtml(p.label)}) Observation Drill-Down`,
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
                        ],
                        rows: [],
                      });
                    }
                  },
                }}
              />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {isZh
                  ? '註：負毛利、全退、部退、折讓四類觀察旗標可能重疊於同一交易行，單元格計數為各類獨立實測行數，不可跨類加總為「唯一事件總數」。'
                  : 'Note: negative-margin, full-return, partial-return, and allowance flags may overlap on the same sales line; each cell is an independent actual count and must not be summed across categories into a "unique event total".'}
              </p>
            </div>

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
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
                {isZh ? '各客戶退貨、折讓與負毛利明細行數統計表' : 'Customer Return, Allowance & Negative Margin Line Counts'}
              </h3>
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
                    {customers.map((c) => (
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
                        <td className="px-3 py-2 text-right text-rose-600 dark:text-rose-400 font-semibold">
                          {fmtCount(c.negativeMarginLineCount)}
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
