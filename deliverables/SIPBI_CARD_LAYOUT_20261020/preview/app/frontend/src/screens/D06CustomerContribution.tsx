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

  // Scatter population: both axes must be present. Null-GM rows stay out of
  // the plot and are disclosed in the caption; they remain in table + CSV.
  const scatterRows = customers.filter((row) => row.netSalesUSD != null && row.grossMarginPercent != null);
  const absentCount = customers.length - scatterRows.length;

  // Compact absolute-GP view only (Top 10 dots, not a second full ranking).
  const topGpRows = [...customers]
    .sort((a, b) => {
      if (a.grossProfitUSD === null && b.grossProfitUSD === null) return a.key.localeCompare(b.key);
      if (a.grossProfitUSD === null) return 1;
      if (b.grossProfitUSD === null) return -1;
      return b.grossProfitUSD - a.grossProfitUSD || a.key.localeCompare(b.key);
    })
    .slice(0, 10);

  const yoy = analysis?.yoyGrowth ?? null;
  const yoyTrend = yoy === null ? 'neutral' : yoy > 0 ? 'up' : yoy < 0 ? 'down' : 'neutral';

  const salesBlue = isDark ? '#60a5fa' : '#2563eb';
  const zeroColor = '#64748b';
  const labelColor = isDark ? '#cbd5e1' : '#334155';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';
  const splitColor = isDark ? '#1e293b' : '#e2e8f0';
  const salesName = isZh ? '淨銷售額 (USD)' : 'Net sales (USD)';
  const gpName = isZh ? '毛利額 (USD)' : 'Gross profit (USD)';

  const openCustomerDrill = (row: (typeof customers)[number]) => {
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
  };

  const scatterOption = {
    tooltip: {
      trigger: 'item' as const,
      confine: true,
      textStyle: { fontSize: 12 },
      extraCssText: 'max-width:380px;white-space:normal;',
      formatter: (params: { dataIndex?: unknown }) => {
        const row = typeof params?.dataIndex === 'number' ? scatterRows[params.dataIndex] : undefined;
        if (!row) return '';
        return `<div style="font-size:12px;line-height:1.45">
          <div><b>${escapeHtml(row.label || DASH)}</b></div>
          <div style="font-family:ui-monospace,monospace">${escapeHtml(row.key)}</div>
          <div>${escapeHtml(salesName)}: ${exactUSD(row.netSalesUSD)}</div>
          <div>${escapeHtml(gpName)}: ${exactUSD(row.grossProfitUSD)}</div>
          <div>${isZh ? '毛利率' : 'GM %'}: ${exactPct(row.grossMarginPercent)}</div>
          <div>${isZh ? '退貨量' : 'Return qty'}: ${exactKG(row.returnQtyKG)}</div>
          <div>${isZh ? '退貨率' : 'Return rate'}: ${exactPct(row.returnRatePercent)}</div>
          <div>${isZh ? '點擊下鑽該客戶的產品組合' : 'Click to drill into this customer'}</div>
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
      axisLine: { show: true, onZero: true, lineStyle: { color: zeroColor, width: 1.25 } },
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
        name: isZh ? '客戶（等尺寸圓點，不代表第三變數）' : 'Customers (fixed-size points)',
        type: 'scatter' as const,
        cursor: 'pointer',
        symbolSize: 9,
        data: scatterRows.map((row) => [
          row.netSalesUSD,
          (row.grossMarginPercent as number) * 100,
        ]),
        itemStyle: { color: salesBlue, opacity: 0.85 },
        markLine: {
          silent: true,
          symbol: 'none',
          label: { show: false },
          lineStyle: { color: zeroColor, width: 1, type: 'dashed' as const },
          data: [{ yAxis: 0 }, { xAxis: 0 }],
        },
      },
    ],
  };

  // Compact absolute-GP dots: Top 10 only, full ranking stays in table + CSV.
  const gpDotOption = {
    tooltip: {
      trigger: 'item' as const,
      confine: true,
      textStyle: { fontSize: 12 },
      extraCssText: 'max-width:380px;white-space:normal;',
      formatter: (params: { dataIndex?: unknown }) => {
        const row = typeof params?.dataIndex === 'number' ? topGpRows[params.dataIndex] : undefined;
        if (!row) return '';
        return `<div style="font-size:12px;line-height:1.45">
          <div><b>${escapeHtml(row.label || DASH)}</b></div>
          <div style="font-family:ui-monospace,monospace">${escapeHtml(row.key)}</div>
          <div>${escapeHtml(gpName)}: ${exactUSD(row.grossProfitUSD)}</div>
          <div>${escapeHtml(salesName)}: ${exactUSD(row.netSalesUSD)}</div>
          <div>${isZh ? '毛利率' : 'GM %'}: ${exactPct(row.grossMarginPercent)}</div>
        </div>`;
      },
    },
    grid: { left: 8, right: 20, top: 8, bottom: 8, containLabel: true },
    xAxis: {
      type: 'value' as const,
      min: (bound: { min: number }) => Math.min(0, Number.isFinite(bound.min) ? bound.min : 0),
      max: (bound: { max: number }) => Math.max(0, Number.isFinite(bound.max) ? bound.max : 0),
      axisLabel: { color: mutedColor, fontSize: 12, formatter: (value: number) => axisUSD(value) },
      axisLine: { show: true, onZero: true, lineStyle: { color: zeroColor, width: 1.25 } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: splitColor } },
    },
    yAxis: {
      type: 'category' as const,
      inverse: true,
      data: topGpRows.map((row) => (row.label.trim() ? row.label : row.key)),
      axisLabel: { color: labelColor, fontSize: 12, width: 200, overflow: 'truncate' as const, margin: 8 },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series: [
      {
        name: gpName,
        type: 'scatter' as const,
        cursor: 'pointer',
        symbolSize: 10,
        data: topGpRows.map((row, index) => [row.grossProfitUSD, index]),
        itemStyle: { color: salesBlue, opacity: 0.9 },
        markLine: {
          silent: true,
          symbol: 'none',
          label: { show: false },
          lineStyle: { color: zeroColor, width: 1.25, type: 'solid' as const },
          data: [{ xAxis: 0 }],
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
              ? '哪些客戶兼具規模與毛利品質。散佈看位置，點圖看絕對毛利集中，明細看全部。'
              : 'Which customers combine scale with margin quality. Scatter for position, dots for GP concentration, table for all.'}
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
                subValue={
                  yoy === null
                    ? `${customers.length} ${isZh ? '家活躍客戶' : 'Active Customers'}`
                    : `YoY ${fmtSignedPercent(yoy)}`
                }
                trend={yoyTrend}
                footnote={
                  yoy === null
                    ? summaryLabels.monthLabel
                    : `${customers.length} ${isZh ? '家' : 'customers'} · ${summaryLabels.monthLabel}`
                }
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

            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {isZh
                  ? `客戶規模 × 毛利品質散佈（x 淨銷售額 USD，y 毛利率 %，共 ${scatterRows.length} 家）`
                  : `Customer scale × margin scatter (x net sales USD, y GM %, ${scatterRows.length} customers)`}
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {isZh
                  ? `每點一家客戶；越右營收越高，越上毛利率越高。毛利率軸依資料範圍顯示。缺值未繪 ${absentCount} 家；點擊下鑽產品，完整資料見明細與 CSV。`
                  : `One point per customer. Revenue increases rightward; margin increases upward on a data-range axis. ${absentCount} null-valued customers excluded. Click to drill into products; full data in table and CSV.`}
              </p>
              {scatterRows.length === 0 ? (
                <p className="py-10 text-xs text-slate-500 dark:text-slate-400">
                  {isZh ? '此切片沒有可繪製的客戶列。' : 'No plottable customer rows in this slice.'}
                </p>
              ) : (
                <EChartsContainer
                  option={scatterOption}
                  height="400px"
                  onEvents={{
                    click: (params: { dataIndex?: unknown }) => {
                      const row =
                        typeof params?.dataIndex === 'number' ? scatterRows[params.dataIndex] : undefined;
                      if (!row) return;
                      openCustomerDrill(row);
                    },
                  }}
                />
              )}
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {isZh ? '毛利額 Top 10 緊湊點圖（絕對毛利集中度）' : 'Top 10 gross profit dots (absolute GP concentration)'}
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {isZh
                  ? '依毛利額排序，呈現前 10 家客戶；零為基準，負值在左。完整客戶資料見明細與 CSV。'
                  : 'Top 10 by gross profit only (dots, not ranking bars); the full order stays in the table and CSV. Zero is the baseline; negatives sit left.'}
              </p>
              <EChartsContainer
                option={gpDotOption}
                height={`${Math.max(240, 72 + topGpRows.length * 30)}px`}
                onEvents={{
                  click: (params: { dataIndex?: unknown }) => {
                    const row =
                      typeof params?.dataIndex === 'number' ? topGpRows[params.dataIndex] : undefined;
                    if (!row) return;
                    openCustomerDrill(row);
                  },
                }}
              />
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
              <details open>
                <summary className="text-sm font-bold text-slate-900 dark:text-white cursor-pointer">
                  {isZh
                    ? `客戶貢獻明細（全體 ${customers.length} 家，點列下鑽產品）`
                    : `Customer contribution table (all ${customers.length} customers)`}
                </summary>
                <div className="overflow-x-auto mt-3">
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
                          onClick={() => openCustomerDrill(row)}
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
              </details>
            </div>

            <AiInsightCard
              title={isZh ? 'D06 客戶營收與毛利貢獻摘要' : 'D06 Customer Contribution Summary'}
              data={{
                observed: isZh
                  ? `散佈共 ${scatterRows.length} 家（毛利率缺值 ${absentCount} 家未繪）。總淨銷售額 ${fmtUSD(
                      kpis.netSalesUSD
                    )}，總毛利額 ${fmtUSD(kpis.grossProfitUSD)}（加權毛利率 ${fmtPercent(
                      kpis.grossMarginPercent
                    )}）${
                      topCustomer
                        ? `。最大貢獻客戶為 ${topCustomer.key} (${topCustomer.label})，淨銷售額 ${fmtUSD(
                            topCustomer.netSalesUSD
                          )}，毛利額 ${fmtUSD(topCustomer.grossProfitUSD)}。`
                        : '。'
                    }`
                  : `Scatter covers ${scatterRows.length} customers (${absentCount} with null GM not plotted). Total Net Sales ${fmtUSD(
                      kpis.netSalesUSD
                    )}, Gross Profit ${fmtUSD(kpis.grossProfitUSD)} (weighted GM% ${fmtPercent(
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
                    }。散佈只描述位置，不做迴歸或因果推論；點擊任一點可下鑽該客戶的產品組合。`
                  : `Top-5 customer share (CR5) is ${
                      analysis?.concentrationStatus === 'available' ? fmtPercent(analysis?.cr5) : DASH
                    }. The scatter describes positions only, with no regression or causal claim; click any point to drill into its products.`,
                claimType: 'OBSERVATION',
                coverage: `${summaryLabels.monthLabel} · ${summaryLabels.companyLabel}`,
                confidence: 'SSAS Direct',
                evidenceId: data?.evidence?.requestId || 'D06',
                evidence: data?.evidence,
                source: data?.source,
                limitations: [
                  isZh
                    ? '散佈僅含淨銷售額與毛利率皆有值者；缺值客戶仍在明細與 CSV。圓點大小一致，不代表第三變數。'
                    : 'The scatter includes only customers with both net sales and GM% present; absent rows remain in the table and CSV. Point size encodes nothing.',
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
