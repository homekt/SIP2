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

function exactKG(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return DASH;
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 6 })} KG`;
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

export const D06CustomerContribution: React.FC<Props> = ({ slicer }) => {
  const { theme, lang, openDrillDown, metadata, setLastDashboardContext } = useApp();
  const isDark = theme === 'dark';
  const isZh = lang === 'zh-TW';

  const { phase, data, error, reload } = useSalesDashboard('D06', slicer, setLastDashboardContext);
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
  const customers = data?.datasets?.customers || [];
  const topCustomer = customers[0];
  const customerChartRows = customers.slice(0, 15);
  const shown = customerChartRows.length;

  const salesColor = '#4f46e5';
  const gpColor = isDark ? '#2dd4bf' : '#0f766e';
  const declineColor = isDark ? '#fb7185' : '#be123c';
  const secondaryColor = '#64748b';
  const labelColor = isDark ? '#cbd5e1' : '#334155';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';
  const splitColor = isDark ? '#1e293b' : '#e2e8f0';
  const salesName = isZh ? '淨銷售額 (USD)' : 'Net sales (USD)';
  const gpName = isZh ? '毛利額 (USD)' : 'Gross profit (USD)';

  const customerOption = {
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow' as const },
      confine: true,
      textStyle: { fontSize: 12 },
      extraCssText: 'max-width:380px;white-space:normal;',
      formatter: (params: { dataIndex?: unknown } | Array<{ dataIndex?: unknown }>) => {
        const index = pointIndex(params);
        const row = index == null ? undefined : customerChartRows[index];
        if (!row || index == null) return '';
        return `<div style="font-size:12px;line-height:1.45">
          <div><b>${escapeHtml(row.label || DASH)}</b></div>
          <div style="font-family:ui-monospace,monospace">${escapeHtml(row.key)}</div>
          <div>${escapeHtml(salesName)}: ${exactUSD(row.netSalesUSD)}</div>
          <div>${escapeHtml(gpName)}: ${exactUSD(row.grossProfitUSD)}</div>
          <div>${isZh ? '兩條並列，不加總。' : 'Shown side by side. Not added together.'}</div>
          <div>${isZh ? '毛利率' : 'GM %'}: ${exactPct(row.grossMarginPercent)}</div>
          <div>${isZh ? '退貨量' : 'Return qty'}: ${exactKG(row.returnQtyKG)}</div>
          <div>${isZh ? '退貨率' : 'Return rate'}: ${exactPct(row.returnRatePercent)}</div>
          <div>${isZh ? `名次 ${index + 1}／全體 ${customers.length}。圖僅前 ${shown} 名。` : `Rank ${index + 1} of ${customers.length}. Chart shows the top ${shown} only.`}</div>
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
    // inverse keeps rank 1 at the top; dataIndex stays aligned with customerChartRows.
    yAxis: {
      type: 'category' as const,
      inverse: true,
      data: customerChartRows.map((row, index) => rankLabel(row, index + 1)),
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
        data: customerChartRows.map((row) => signedPoint(row.netSalesUSD, declineColor)),
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
        data: customerChartRows.map((row) => signedPoint(row.grossProfitUSD, declineColor)),
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
            {isZh ? 'D06 客戶貢獻 (Customer Contribution)' : 'D06 Customer Contribution'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isZh
              ? '比較客戶淨銷售額與毛利額。退貨量與毛利率保留在提示、明細與 CSV。'
              : 'Compare customer net sales and gross profit. Return quantity and margin stay in the tooltip, table, and CSV.'}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() =>
              exportSalesRowsCsv(`D06_Customers_${slicer.month}.csv`, customers, 'CustomerKey')
            }
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 cursor-pointer"
          >
            {isZh ? '📥 匯出客戶貢獻 CSV' : '📥 Export Customers CSV'}
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
                title={isZh ? '客戶總淨銷售額' : 'Customer Net Sales'}
                value={fmtUSD(kpis.netSalesUSD)}
                subValue={`${customers.length} ${isZh ? '家活躍客戶' : 'Active Customers'}`}
                trend="neutral"
                footnote={summaryLabels.monthLabel}
              />
              <KpiCard
                title={isZh ? '客戶總毛利額' : 'Customer Gross Profit'}
                value={fmtUSD(kpis.grossProfitUSD)}
                subValue={`GM%: ${fmtPercent(kpis.grossMarginPercent)}`}
                trend="neutral"
                footnote={isZh ? '加權毛利率' : 'Weighted GM%'}
              />
              <KpiCard
                title={isZh ? '首位客戶 (Top Customer)' : 'Top Customer'}
                value={topCustomer ? topCustomer.key : DASH}
                subValue={topCustomer ? fmtUSD(topCustomer.netSalesUSD) : DASH}
                trend="neutral"
                footnote={topCustomer ? topCustomer.label : DASH}
              />
              <KpiCard
                title={isZh ? '前五大客戶集中度 (CR5)' : 'CR5 Concentration'}
                value={analysis?.concentrationStatus === 'available' ? fmtPercent(analysis?.cr5) : DASH}
                subValue={analysis?.concentrationStatus || DASH}
                trend="neutral"
                footnote={isZh ? '點擊穿透 D11' : 'Click for D11'}
                drillThroughTarget="D11"
              />
            </div>

            <div className="chart-panel bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {isZh ? `客戶淨銷售額與毛利額前 ${shown} 名` : `Top ${shown} customers: net sales and gross profit`}
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {isZh
                  ? `前 ${shown} 名／全體 ${customers.length} 家客戶。排序：淨銷售額由高到低，同額依代碼。實心條為淨銷售，虛線框條為毛利，並列、不加總。零軸為基準；負值在左側並標負號。其餘客戶在明細與 CSV。`
                  : `Top ${shown} of ${customers.length} customers by net sales (descending, ties: member code). Solid bars are net sales. Dashed-outline bars are gross profit. They sit side by side and are not added. Zero is the baseline; negative values sit to the left and carry a minus sign. Everyone else stays in the table and CSV.`}
              </p>
              {customerChartRows.length === 0 ? (
                <p className="py-10 text-xs text-slate-500 dark:text-slate-400">
                  {isZh ? '此切片沒有客戶列。' : 'No customer rows in this slice.'}
                </p>
              ) : (
                <EChartsContainer
                  option={customerOption}
                  height={chartHeight(customerChartRows.length)}
                  onEvents={{
                    click: (params: { componentType?: string; dataIndex?: unknown }) => {
                      if (params?.componentType === 'markLine') return;
                      const index = pointIndex(params);
                      const row = index == null ? undefined : customerChartRows[index];
                      if (!row) return;
                      openDrillDown({
                        title: isZh ? `${row.key} (${row.label}) 購買產品下鑽` : `${row.key} (${row.label}) Product Drill-Down`,
                        dimensionName: isZh ? '客戶' : 'Customer',
                        dimensionValue: row.key,
                        sourceDashboard: 'D06',
                        groupBy: 'product',
                        filterOverrides: { customer: row.key },
                        summaryMetrics: [
                          { label: isZh ? '淨銷售額' : 'Net Sales', value: fmtUSD(row.netSalesUSD) },
                          { label: isZh ? '毛利額' : 'Gross Profit', value: fmtUSD(row.grossProfitUSD) },
                          { label: isZh ? '毛利率' : 'GM %', value: fmtPercent(row.grossMarginPercent) },
                          { label: isZh ? '退貨量' : 'Return Qty', value: fmtKG(row.returnQtyKG, 2) },
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
                  ? `客戶貢獻明細（全體 ${customers.length} 家，點列下鑽產品）`
                  : `Customer contribution table (all ${customers.length} customers)`}
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs tabular-nums">
                  <thead className="bg-slate-50 dark:bg-slate-800/70">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">#</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '客戶 (Key / Label)' : 'Customer'}
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
                        {isZh ? '退貨量 (KG)' : 'Return Qty (KG)'}
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
                    {customers.map((row, index) => (
                      <tr
                        key={row.key}
                        onClick={() =>
                          openDrillDown({
                            title: isZh ? `${row.key} (${row.label}) 購買產品下鑽` : `${row.key} (${row.label}) Product Drill-Down`,
                            dimensionName: isZh ? '客戶' : 'Customer',
                            dimensionValue: row.key,
                            sourceDashboard: 'D06',
                            groupBy: 'product',
                            filterOverrides: { customer: row.key },
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
                        <td className="px-3 py-2 text-right">{fmtKG(row.returnQtyKG, 2)}</td>
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
              title={isZh ? 'D06 客戶營收與毛利貢獻摘要' : 'D06 Customer Contribution Summary'}
              data={{
                observed: isZh
                  ? `當前切片共有 ${customers.length} 家交易客戶，總淨銷售額 ${fmtUSD(
                      kpis.netSalesUSD
                    )}，總毛利額 ${fmtUSD(kpis.grossProfitUSD)}（毛利率 ${fmtPercent(
                      kpis.grossMarginPercent
                    )}）${
                      topCustomer
                        ? `。最大貢獻客戶為 ${topCustomer.key} (${topCustomer.label})，淨銷售額 ${fmtUSD(
                            topCustomer.netSalesUSD
                          )}，毛利額 ${fmtUSD(topCustomer.grossProfitUSD)}。`
                        : '。'
                    }`
                  : `Active slice includes ${customers.length} customers with Total Net Sales ${fmtUSD(
                      kpis.netSalesUSD
                    )} and Gross Profit ${fmtUSD(kpis.grossProfitUSD)} (GM% ${fmtPercent(
                      kpis.grossMarginPercent
                    )})${
                      topCustomer
                        ? `. Top customer is ${topCustomer.key} (${topCustomer.label}) at ${fmtUSD(
                            topCustomer.netSalesUSD
                          )}.`
                        : '.'
                    }`,
                interpretation: isZh
                  ? `前五大客戶集中度 CR5 為 ${
                      analysis?.concentrationStatus === 'available' ? fmtPercent(analysis?.cr5) : DASH
                    }。點擊任一客戶可透過 /api/drilldown 檢視該客戶購買的產品與負責業務員。`
                  : `Top-5 customer share (CR5) is ${
                      analysis?.concentrationStatus === 'available' ? fmtPercent(analysis?.cr5) : DASH
                    }. Click any customer to inspect purchased products and assigned salespeople.`,
                claimType: 'OBSERVATION',
                coverage: `${summaryLabels.monthLabel} · ${summaryLabels.companyLabel}`,
                confidence: 'SSAS Direct',
                evidenceId: data?.evidence?.requestId || 'D06',
                evidence: data?.evidence,
                source: data?.source,
                limitations: [
                  isZh
                    ? '圖只含淨銷售額前 15 名（或全部，取其少者）。毛利與淨銷售並列，不是合計。全體客戶與退貨量仍在明細與 CSV。'
                    : 'The chart shows the top 15 customers by net sales, or all of them if fewer. Gross profit is beside net sales, not summed with it. The full customer list and return quantities remain in the table and CSV.',
                ],
                nextSteps: [
                  isZh ? '進入 D11 檢視客戶集中度 CR5 與 HHI 指數' : 'Go to D11 Customer Concentration',
                  isZh ? '進入 D13 檢視業務員銷售實績排行' : 'Go to D13 Salesperson Actuals',
                  isZh ? '進入 D08 檢視客戶與產品獲利品質' : 'Go to D08 Profitability',
                ],
              }}
            />
          </div>
        )}
      </StateGuard>
    </div>
  );
};

export default D06CustomerContribution;
