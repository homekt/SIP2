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

function chartHeight(rowCount: number): string {
  return `${Math.max(360, Math.min(500, 96 + rowCount * 26))}px`;
}

function rankLabel(row: SalesRow, rank: number): string {
  const name = row.label.trim() ? row.label : row.key;
  return `#${rank} ${name}`;
}

function pointIndex(
  params:
    | { dataIndex?: unknown; componentType?: string }
    | Array<{ dataIndex?: unknown; componentType?: string }>
    | null
): number | null {
  const list = Array.isArray(params) ? params : params ? [params] : [];
  for (const entry of list) {
    if (!entry || entry.componentType === 'markLine') continue;
    if (typeof entry.dataIndex === 'number') return entry.dataIndex;
  }
  return null;
}

function signedPoint(value: number | null, declineColor: string): { value: number | null; itemStyle?: { color: string } } {
  if (typeof value === 'number' && value < 0) {
    return { value, itemStyle: { color: declineColor } };
  }
  return { value };
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
  const salespeople = data?.datasets?.salespeople || [];
  const topRep = salespeople[0];
  const repCount = salespeople.length;

  const salesColor = '#4f46e5';
  const gpColor = isDark ? '#2dd4bf' : '#0f766e';
  const declineColor = isDark ? '#fb7185' : '#be123c';
  const secondaryColor = '#64748b';
  const labelColor = isDark ? '#cbd5e1' : '#334155';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';
  const splitColor = isDark ? '#1e293b' : '#e2e8f0';
  const salesName = isZh ? '淨銷售額 (USD)' : 'Net sales (USD)';
  const gpName = isZh ? '毛利額 (USD)' : 'Gross profit (USD)';

  const repOption = {
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow' as const },
      confine: true,
      textStyle: { fontSize: 12 },
      extraCssText: 'max-width:380px;white-space:normal;',
      formatter: (params: { dataIndex?: unknown } | Array<{ dataIndex?: unknown }>) => {
        const index = pointIndex(params);
        const row = index == null ? undefined : salespeople[index];
        if (!row || index == null) return '';
        return `<div style="font-size:12px;line-height:1.45">
          <div><b>${escapeHtml(row.label || DASH)}</b></div>
          <div style="font-family:ui-monospace,monospace">${escapeHtml(row.key)}</div>
          <div>${escapeHtml(salesName)}: ${exactUSD(row.netSalesUSD)}</div>
          <div>${escapeHtml(gpName)}: ${exactUSD(row.grossProfitUSD)}</div>
          <div>${isZh ? '兩條並列，不加總。沒有目標或達成率。' : 'Shown side by side. Not added together. No target or attainment.'}</div>
          <div>${isZh ? '毛利率（未畫入圖，見明細）' : 'GM % (not plotted; see the table)'}: ${exactPct(row.grossMarginPercent)}</div>
          <div>${isZh ? '訂單數' : 'Orders'}: ${fmtCount(row.orderCount)}</div>
          <div>${isZh ? `名次 ${index + 1}／全體 ${repCount}` : `Rank ${index + 1} of ${repCount}`}</div>
        </div>`;
      },
    },
    legend: {
      type: 'scroll' as const,
      bottom: 0,
      textStyle: { color: labelColor, fontSize: 12 },
      data: [
        { name: salesName, icon: 'roundRect' },
        { name: gpName, icon: 'rect' },
      ],
    },
    grid: { left: 4, right: 20, top: 8, bottom: 40, containLabel: true },
    xAxis: {
      type: 'value' as const,
      scale: false,
      min: (bound: { min: number }) => Math.min(0, Number.isFinite(bound.min) ? bound.min : 0),
      max: (bound: { max: number }) => Math.max(0, Number.isFinite(bound.max) ? bound.max : 0),
      axisLabel: {
        color: mutedColor,
        fontSize: 12,
        formatter: (value: number) => axisUSD(value),
      },
      axisLine: { show: true, onZero: true, lineStyle: { color: secondaryColor, width: 1.25 } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: splitColor } },
    },
    // inverse keeps rank 1 at the top; dataIndex stays aligned with salespeople.
    yAxis: {
      type: 'category' as const,
      inverse: true,
      data: salespeople.map((row, index) => rankLabel(row, index + 1)),
      axisLabel: { color: labelColor, fontSize: 12, width: 220, overflow: 'truncate' as const, margin: 8 },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series: [
      {
        name: salesName,
        type: 'bar' as const,
        cursor: 'pointer',
        barGap: '30%',
        data: salespeople.map((row) => signedPoint(row.netSalesUSD, declineColor)),
        itemStyle: { color: salesColor },
        label: {
          show: true,
          position: 'left' as const,
          distance: 4,
          fontSize: 12,
          color: declineColor,
          formatter: (item: { value?: unknown }) =>
            typeof item.value === 'number' && item.value < 0 ? '−' : '',
        },
        markLine: {
          silent: true,
          symbol: 'none',
          label: { show: false },
          lineStyle: { color: secondaryColor, width: 1.25, type: 'solid' as const },
          data: [{ xAxis: 0 }],
        },
      },
      {
        name: gpName,
        type: 'bar' as const,
        cursor: 'pointer',
        data: salespeople.map((row) => signedPoint(row.grossProfitUSD, declineColor)),
        itemStyle: {
          color: gpColor,
          borderColor: secondaryColor,
          borderWidth: 1,
          borderType: 'dashed' as const,
        },
        label: {
          show: true,
          position: 'left' as const,
          distance: 4,
          fontSize: 12,
          color: declineColor,
          formatter: (item: { value?: unknown }) =>
            typeof item.value === 'number' && item.value < 0 ? '−' : '',
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
              ? '全體業務員的實際淨銷售額與毛利額。沒有目標或達成率。毛利率在明細。'
              : 'Actual net sales and gross profit for every salesperson. No target or attainment. Margin stays in the table.'}
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
                subValue={`${repCount} ${isZh ? '位業務員' : 'Salespeople'}`}
                trend="neutral"
                footnote={summaryLabels.monthLabel}
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

            <div className="chart-panel bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {isZh ? `全體 ${repCount} 位業務員的實際淨銷售與毛利` : `Actual net sales and gross profit, all ${repCount} salespeople`}
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {isZh
                  ? `圖含本切片全部 ${repCount} 位，依淨銷售額由高到低（同額依代碼）。實心條為淨銷售，虛線框條為毛利，並列、不加總。沒有目標、沒有達成率。毛利率只在明細。零軸為基準；負值在左側並標負號。`
                  : `All ${repCount} salespeople in this slice, ranked by net sales descending (ties: member code). Solid bars are net sales. Dashed-outline bars are gross profit, side by side and not added. No target and no attainment. Margin stays in the table. Zero is the baseline; negative values sit to the left and carry a minus sign.`}
              </p>
              {salespeople.length === 0 ? (
                <p className="py-10 text-xs text-slate-500 dark:text-slate-400">
                  {isZh ? '此切片沒有業務員列。' : 'No salesperson rows in this slice.'}
                </p>
              ) : (
                <EChartsContainer
                  option={repOption}
                  height={chartHeight(salespeople.length)}
                  onEvents={{
                    click: (params: { componentType?: string; dataIndex?: unknown }) => {
                      if (params?.componentType === 'markLine') return;
                      const index = pointIndex(params);
                      const row = index == null ? undefined : salespeople[index];
                      if (!row) return;
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
                    },
                  }}
                />
              )}
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
                {isZh
                  ? `業務員實績明細（全體 ${repCount} 位，點列下鑽客戶）`
                  : `Salesperson actuals (all ${repCount}; click a row to drill)`}
              </h3>
              <div className="overflow-x-auto">
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
                        onClick={() =>
                          openDrillDown({
                            title: isZh ? `${row.key} (${row.label}) 客戶實績下鑽` : `${row.key} (${row.label}) Customer Drill-Down`,
                            dimensionName: isZh ? '業務員' : 'Salesperson',
                            dimensionValue: row.key,
                            sourceDashboard: 'D13',
                            groupBy: 'customer',
                            filterOverrides: { salesperson: row.key },
                            rows: [],
                          })
                        }
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-2 text-slate-400">{index + 1}</td>
                        <td className="px-3 py-2 font-sans">
                          <div className="font-bold text-indigo-600 dark:text-indigo-400">{row.label}</div>
                          <div className="text-[11px] font-mono text-slate-400">{row.key}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-bold">{fmtUSD(row.netSalesUSD)}</td>
                        <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">
                          {fmtUSD(row.grossProfitUSD)}
                        </td>
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
            </div>

            <AiInsightCard
              title={isZh ? 'D13 業務員銷售實績摘要' : 'D13 Salesperson Actuals Summary'}
              data={{
                observed: isZh
                  ? `當前範圍共有 ${salespeople.length} 位業務員產生銷售實績，總淨銷售額 ${fmtUSD(
                      kpis.netSalesUSD
                    )}，總毛利額 ${fmtUSD(kpis.grossProfitUSD)}（毛利率 ${fmtPercent(
                      kpis.grossMarginPercent
                    )}）${
                      topRep
                        ? `。首位業務員為 ${topRep.key} (${topRep.label})，實績淨銷售額 ${fmtUSD(
                            topRep.netSalesUSD
                          )}，毛利率 ${fmtPercent(topRep.grossMarginPercent)}。`
                        : '。'
                    }`
                  : `Active scope includes ${salespeople.length} salespeople with Total Net Sales ${fmtUSD(
                      kpis.netSalesUSD
                    )} and Gross Profit ${fmtUSD(kpis.grossProfitUSD)} (GM% ${fmtPercent(
                      kpis.grossMarginPercent
                    )})${
                      topRep
                        ? `. Top salesperson is ${topRep.key} (${topRep.label}) with ${fmtUSD(
                            topRep.netSalesUSD
                          )} in Net Sales.`
                        : '.'
                    }`,
                interpretation: isZh
                  ? '本看板完全基於 SSAS JDE Sales Cube 實際發票交易彙總，點擊任一業務員可下鑽查看其服務客戶與銷售產品組合。'
                  : 'All metrics reflect certified invoice actuals from SSAS JDE Sales Cube. Click any salesperson to drill down into their customer and product mix.',
                claimType: 'OBSERVATION',
                coverage: `${summaryLabels.monthLabel} · ${summaryLabels.companyLabel}`,
                confidence: 'SSAS Direct',
                evidenceId: data?.evidence?.requestId || 'D13',
                evidence: data?.evidence,
                source: data?.source,
                limitations: [
                  isZh
                    ? '只呈現實際銷售與毛利。圖不含毛利率軸，也不含配額、預算或達成率。明細與 CSV 保留全部業務員。'
                    : 'Displays actual sales and gross profit only. The chart has no margin axis and no quota, budget, or attainment. The table and CSV keep every salesperson.',
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
