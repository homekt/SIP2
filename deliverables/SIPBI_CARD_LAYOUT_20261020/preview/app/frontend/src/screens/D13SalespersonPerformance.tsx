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
  fmtSignedPercent,
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

function exactKG(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return DASH;
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 6 })} KG`;
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
  const analysis = data?.analysis;
  const salespeople = data?.datasets?.salespeople || [];
  const topRep = salespeople[0];
  const repCount = salespeople.length;

  // Matrix population: both axes must be present. Null rows stay in table + CSV only.
  const matrixRows = salespeople.filter(
    (row) => row.netSalesUSD != null && row.grossMarginPercent != null
  );
  const absentCount = repCount - matrixRows.length;

  // Overall weighted GM% as the statistical reference line (not a target).
  const meanGm = kpis?.grossMarginPercent ?? null;
  const meanGmPct = meanGm === null ? null : meanGm * 100;

  const yoy = analysis?.yoyGrowth ?? null;
  const yoyTrend = yoy === null ? 'neutral' : yoy > 0 ? 'up' : yoy < 0 ? 'down' : 'neutral';

  const salesBlue = isDark ? '#60a5fa' : '#2563eb';
  const refSlate = '#64748b';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';
  const splitColor = isDark ? '#1e293b' : '#e2e8f0';
  const salesName = isZh ? '淨銷售額 (USD)' : 'Net sales (USD)';
  const gpName = isZh ? '毛利額 (USD)' : 'Gross profit (USD)';

  const openRepDrill = (row: (typeof salespeople)[number]) => {
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
  };

  const matrixOption = {
    tooltip: {
      trigger: 'item' as const,
      confine: true,
      textStyle: { fontSize: 12 },
      extraCssText: 'max-width:380px;white-space:normal;',
      formatter: (params: { dataIndex?: unknown }) => {
        const row = typeof params?.dataIndex === 'number' ? matrixRows[params.dataIndex] : undefined;
        if (!row) return '';
        return `<div style="font-size:12px;line-height:1.45">
          <div><b>${escapeHtml(row.label || DASH)}</b></div>
          <div style="font-family:ui-monospace,monospace">${escapeHtml(row.key)}</div>
          <div>${escapeHtml(salesName)}: ${exactUSD(row.netSalesUSD)}</div>
          <div>${escapeHtml(gpName)}: ${exactUSD(row.grossProfitUSD)}</div>
          <div>${isZh ? '毛利率' : 'GM %'}: ${exactPct(row.grossMarginPercent)}</div>
          <div>${isZh ? '訂單數' : 'Orders'}: ${fmtCount(row.orderCount)}</div>
          <div>${isZh ? '淨銷量' : 'Net qty'}: ${exactKG(row.netQtyKG)}</div>
          <div>${isZh ? '平均單價' : 'ASP'}: ${fmtPriceUSD(row.averageSellingPriceUSD)}</div>
          <div>${isZh ? '點擊下鑽該業務員的客戶組合' : 'Click to drill into this rep'}</div>
        </div>`;
      },
    },
    grid: { left: 8, right: 16, top: 24, bottom: 40, containLabel: true },
    xAxis: {
      type: 'value' as const,
      name: 'USD',
      nameLocation: 'middle' as const,
      nameGap: 28,
      nameTextStyle: { color: mutedColor, fontSize: 12 },
      min: (bound: { min: number }) => Math.min(0, Number.isFinite(bound.min) ? bound.min : 0),
      max: (bound: { max: number }) => Math.max(0, Number.isFinite(bound.max) ? bound.max : 0),
      axisLabel: { color: mutedColor, fontSize: 12, formatter: (value: number) => axisUSD(value) },
      axisLine: { show: true, onZero: true, lineStyle: { color: refSlate, width: 1.25 } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: splitColor } },
    },
    yAxis: {
      type: 'value' as const,
      name: 'GM%',
      nameTextStyle: { color: mutedColor, fontSize: 12 },
      min: (bound: { min: number }) => Number.isFinite(bound.min) ? Math.floor(bound.min - 1) : 0,
      max: (bound: { max: number }) => Number.isFinite(bound.max) ? Math.ceil(bound.max + 1) : 1,
      axisLabel: { color: mutedColor, fontSize: 12, formatter: (value: number) => `${value.toFixed(1)}%` },
      splitLine: { lineStyle: { color: splitColor } },
    },
    series: [
      {
        name: isZh ? '業務員（等尺寸圓點不代表第三變數）' : 'Salespeople (fixed-size points)',
        type: 'scatter' as const,
        cursor: 'pointer',
        symbolSize: 11,
        data: matrixRows.map((row) => [
          row.netSalesUSD,
          (row.grossMarginPercent as number) * 100,
        ]),
        itemStyle: { color: salesBlue, opacity: 0.85 },
        markLine:
          meanGmPct === null
            ? undefined
            : {
                silent: true,
                symbol: 'none',
                label: {
                  show: true,
                  position: 'insideEndTop' as const,
                  fontSize: 12,
                  color: refSlate,
                  formatter: isZh
                    ? `加權毛利率 ${fmtPercent(meanGm)}`
                    : `Weighted GM ${fmtPercent(meanGm)}`,
                },
                lineStyle: { color: refSlate, width: 1.25, type: 'dashed' as const },
                data: [{ yAxis: meanGmPct }],
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
              ? `${repCount} 位業務員的規模與獲利品質分佈。虛線為整體加權毛利率，非目標。`
              : 'Scale and margin quality of the selected reps. Dashed line: overall weighted GM%, not a target.'}
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
                subValue={
                  yoy === null
                    ? `${repCount} ${isZh ? '位業務員' : 'Salespeople'}`
                    : `YoY ${fmtSignedPercent(yoy)}`
                }
                trend={yoyTrend}
                footnote={
                  yoy === null
                    ? summaryLabels.monthLabel
                    : `${repCount} ${isZh ? '位' : 'reps'} · ${summaryLabels.monthLabel}`
                }
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

            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {isZh
                  ? `業務員績效矩陣（x 營收 USD，y 毛利率 %，共 ${matrixRows.length} 位）`
                  : `Rep performance matrix (x revenue USD, y GM %, ${matrixRows.length} reps)`}
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {isZh
                  ? `每點一位業務員；越右營收越高，越上毛利率越高，毛利率軸依資料範圍顯示。點擊下鑽客戶。缺值未繪 ${absentCount} 位，完整資料見明細與 CSV。`
                  : `One point per rep. Revenue increases to the right; margin increases upward on a data-range axis. Click to drill into customers. ${absentCount} null-valued reps excluded; full data in table and CSV.`}
              </p>
              {matrixRows.length === 0 ? (
                <p className="py-10 text-xs text-slate-500 dark:text-slate-400">
                  {isZh ? '此切片沒有業務員列。' : 'No salesperson rows in this slice.'}
                </p>
              ) : (
                <EChartsContainer
                  option={matrixOption}
                  height="400px"
                  onEvents={{
                    click: (params: { dataIndex?: unknown }) => {
                      const row =
                        typeof params?.dataIndex === 'number' ? matrixRows[params.dataIndex] : undefined;
                      if (!row) return;
                      openRepDrill(row);
                    },
                  }}
                />
              )}
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
              <details open>
                <summary className="text-sm font-bold text-slate-900 dark:text-white cursor-pointer">
                  {isZh
                    ? `業務員實績明細（全體 ${repCount} 位，點列下鑽客戶）`
                    : `Salesperson actuals (all ${repCount}; click a row to drill)`}
                </summary>
                <div className="overflow-x-auto mt-3">
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
                          onClick={() => openRepDrill(row)}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                        >
                          <td className="px-3 py-2 text-slate-400">{index + 1}</td>
                          <td className="px-3 py-2 font-sans">
                            <div className="font-bold text-indigo-600 dark:text-indigo-400">{row.label}</div>
                            <div className="text-[11px] font-mono text-slate-400">{row.key}</div>
                          </td>
                          <td className="px-3 py-2 text-right font-bold">{fmtUSD(row.netSalesUSD)}</td>
                          <td className="px-3 py-2 text-right font-semibold">{fmtUSD(row.grossProfitUSD)}</td>
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
              </details>
            </div>

            <AiInsightCard
              title={isZh ? 'D13 業務員銷售實績摘要' : 'D13 Salesperson Actuals Summary'}
              data={{
                observed: isZh
                  ? `矩陣共 ${matrixRows.length} 位（缺值 ${absentCount} 位未繪）。總淨銷售額 ${fmtUSD(
                      kpis.netSalesUSD
                    )}，總毛利額 ${fmtUSD(kpis.grossProfitUSD)}（整體加權毛利率 ${fmtPercent(
                      kpis.grossMarginPercent
                    )}）${
                      topRep
                        ? `。首位業務員為 ${topRep.key} (${topRep.label})，實績淨銷售額 ${fmtUSD(
                            topRep.netSalesUSD
                          )}，毛利率 ${fmtPercent(topRep.grossMarginPercent)}。`
                        : '。'
                    }`
                  : `Matrix covers ${matrixRows.length} reps (${absentCount} with null values not plotted). Total Net Sales ${fmtUSD(
                      kpis.netSalesUSD
                    )}, Gross Profit ${fmtUSD(kpis.grossProfitUSD)} (overall weighted GM% ${fmtPercent(
                      kpis.grossMarginPercent
                    )})${
                      topRep
                        ? `. Top salesperson is ${topRep.key} (${topRep.label}) with ${fmtUSD(
                            topRep.netSalesUSD
                          )} in Net Sales.`
                        : '.'
                    }`,
                interpretation: isZh
                  ? '矩陣只描述規模與品質位置不做迴歸或排名推論；虛線為整體加權毛利率統計參照非目標。點擊任一業務員可下鑽其客戶與產品組合。'
                  : 'The matrix describes scale and quality positions only, with no regression or ranking claim; the dashed line is a statistical reference, not a target. Click any salesperson to drill into their customer and product mix.',
                claimType: 'OBSERVATION',
                coverage: `${summaryLabels.monthLabel} · ${summaryLabels.companyLabel}`,
                confidence: 'SSAS Direct',
                evidenceId: data?.evidence?.requestId || 'D13',
                evidence: data?.evidence,
                source: data?.source,
                limitations: [
                  isZh
                    ? '只呈現實際銷售與毛利，無配額預算或達成率；矩陣僅含雙軸皆有值者其餘在明細與 CSV'
                    : 'Displays actual sales and gross profit only, with no quota, budget, or attainment; the matrix includes only rows with both axes present, the rest remain in the table and CSV.',
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
