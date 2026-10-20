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

export const D04ProductMix: React.FC<Props> = ({ slicer }) => {
  const { theme, lang, openDrillDown, metadata, setLastDashboardContext } = useApp();
  const isDark = theme === 'dark';
  const isZh = lang === 'zh-TW';

  const { phase, data, error, reload } = useSalesDashboard('D04', slicer, setLastDashboardContext);
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
  const categories = data?.datasets?.categories || [];
  const topProduct = products[0];
  const productChartRows = products.slice(0, 12);
  const productShown = productChartRows.length;

  const salesColor = '#4f46e5';
  const declineColor = isDark ? '#fb7185' : '#be123c';
  const secondaryColor = '#64748b';
  const labelColor = isDark ? '#cbd5e1' : '#334155';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';
  const splitColor = isDark ? '#1e293b' : '#e2e8f0';
  const salesName = isZh ? '淨銷售額 (USD)' : 'Net sales (USD)';

  const makeValueAxis = () => ({
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
  });

  const categoryOption = {
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow' as const },
      confine: true,
      textStyle: { fontSize: 12 },
      extraCssText: 'max-width:360px;white-space:normal;',
      formatter: (params: { dataIndex?: unknown } | Array<{ dataIndex?: unknown }>) => {
        const index = pointIndex(params);
        const row = index == null ? undefined : categories[index];
        if (!row || index == null) return '';
        return `<div style="font-size:12px;line-height:1.45">
          <div><b>${escapeHtml(row.label || DASH)}</b></div>
          <div style="font-family:ui-monospace,monospace">${escapeHtml(row.key)}</div>
          <div>${escapeHtml(salesName)}: ${exactUSD(row.netSalesUSD)}</div>
          <div>${isZh ? '毛利額（未畫入圖，不與銷售加總）' : 'Gross profit (not plotted, not added to sales)'}: ${exactUSD(row.grossProfitUSD)}</div>
          <div>${isZh ? `名次 ${index + 1}／${categories.length}，依淨銷售額` : `Rank ${index + 1} of ${categories.length} by net sales`}</div>
        </div>`;
      },
    },
    legend: {
      type: 'scroll' as const,
      bottom: 0,
      textStyle: { color: labelColor, fontSize: 12 },
      data: [salesName],
    },
    grid: { left: 4, right: 20, top: 8, bottom: 36, containLabel: true },
    xAxis: makeValueAxis(),
    // inverse keeps rank 1 at the top; dataIndex stays aligned with categories.
    yAxis: {
      type: 'category' as const,
      inverse: true,
      data: categories.map((row, index) => rankLabel(row, index + 1)),
      axisLabel: { color: labelColor, fontSize: 12, width: 220, overflow: 'truncate' as const, margin: 8 },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series: [
      {
        name: salesName,
        type: 'bar' as const,
        cursor: 'default',
        data: categories.map((row) =>
          typeof row.netSalesUSD === 'number' && row.netSalesUSD < 0
            ? { value: row.netSalesUSD, itemStyle: { color: declineColor } }
            : { value: row.netSalesUSD }
        ),
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
    ],
  };

  const productOption = {
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow' as const },
      confine: true,
      textStyle: { fontSize: 12 },
      extraCssText: 'max-width:360px;white-space:normal;',
      formatter: (params: { dataIndex?: unknown } | Array<{ dataIndex?: unknown }>) => {
        const index = pointIndex(params);
        const row = index == null ? undefined : productChartRows[index];
        if (!row || index == null) return '';
        return `<div style="font-size:12px;line-height:1.45">
          <div><b>${escapeHtml(row.label || DASH)}</b></div>
          <div style="font-family:ui-monospace,monospace">${escapeHtml(row.key)}</div>
          <div>${escapeHtml(salesName)}: ${exactUSD(row.netSalesUSD)}</div>
          <div>${isZh ? '毛利額（未畫入圖，不與銷售加總）' : 'Gross profit (not plotted, not added to sales)'}: ${exactUSD(row.grossProfitUSD)}</div>
          <div>${isZh ? '毛利率（未畫入圖）' : 'GM % (not plotted)'}: ${exactPct(row.grossMarginPercent)}</div>
          <div>${isZh ? `名次 ${index + 1}／全體 ${products.length}。圖僅前 ${productShown} 名。` : `Rank ${index + 1} of ${products.length}. Chart shows the top ${productShown} only.`}</div>
        </div>`;
      },
    },
    legend: {
      type: 'scroll' as const,
      bottom: 0,
      textStyle: { color: labelColor, fontSize: 12 },
      data: [salesName],
    },
    grid: { left: 4, right: 20, top: 8, bottom: 36, containLabel: true },
    xAxis: makeValueAxis(),
    // inverse keeps rank 1 at the top; dataIndex stays aligned with productChartRows.
    yAxis: {
      type: 'category' as const,
      inverse: true,
      data: productChartRows.map((row, index) => rankLabel(row, index + 1)),
      axisLabel: { color: labelColor, fontSize: 12, width: 220, overflow: 'truncate' as const, margin: 8 },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series: [
      {
        name: salesName,
        type: 'bar' as const,
        cursor: 'pointer',
        data: productChartRows.map((row) =>
          typeof row.netSalesUSD === 'number' && row.netSalesUSD < 0
            ? { value: row.netSalesUSD, itemStyle: { color: declineColor } }
            : { value: row.netSalesUSD }
        ),
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
    ],
  };

  return (
    <div className="sales-dashboard space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {isZh ? 'D04 產品組合 (Product Mix)' : 'D04 Product Mix'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isZh
              ? '比較產品類別與個別產品的淨銷售額。毛利與毛利率在明細，不與銷售疊加。'
              : 'Compare category and product net sales. Gross profit and margin stay in the table and are not added to sales.'}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() =>
              exportSalesRowsCsv(`D04_Products_${slicer.month}.csv`, products, 'ProductKey')
            }
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 cursor-pointer"
          >
            {isZh ? '📥 匯出產品組合 CSV' : '📥 Export Products CSV'}
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
                title={isZh ? '產品總淨銷售額' : 'Total Product Sales'}
                value={fmtUSD(kpis.netSalesUSD)}
                subValue={`${products.length} ${isZh ? '項產品' : 'Products'}`}
                trend="neutral"
                footnote={`${categories.length} ${isZh ? '個產品類別' : 'Categories'}`}
              />
              <KpiCard
                title={isZh ? '加權毛利率 (GM%)' : 'Weighted GM %'}
                value={fmtPercent(kpis.grossMarginPercent)}
                subValue={fmtUSD(kpis.grossProfitUSD)}
                trend="neutral"
                footnote={isZh ? '毛利額 / 淨銷售額' : 'Gross Profit / Net Sales'}
                drillThroughTarget="D08"
              />
              <KpiCard
                title={isZh ? '總淨銷售量 (KG)' : 'Total Net Qty (KG)'}
                value={fmtKG(kpis.netQtyKG)}
                subValue={fmtPriceUSD(kpis.averageSellingPriceUSD)}
                trend="neutral"
                footnote={isZh ? '平均單價 (ASP)' : 'Average Selling Price'}
              />
              <KpiCard
                title={isZh ? '首位主力產品 (Top Product)' : 'Top Selling Product'}
                value={topProduct ? topProduct.key : DASH}
                subValue={topProduct ? fmtUSD(topProduct.netSalesUSD) : DASH}
                trend="neutral"
                footnote={topProduct ? topProduct.label : DASH}
                drillThroughTarget="D14"
              />
            </div>

            <div className="chart-panel bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {isZh ? '產品類別淨銷售額' : 'Category net sales'}
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {isZh
                  ? `全體 ${categories.length} 個類別，依淨銷售額由高到低（同額依代碼）。橫條只表示淨銷售額，零軸為基準；負值在左側並標負號。空值留白，不畫成 0。`
                  : `All ${categories.length} categories, ordered by net sales descending (ties: member code). Bars are net sales on a zero baseline. Negative values sit to the left and carry a minus sign. Nulls stay blank, not zero.`}
              </p>
              {categories.length === 0 ? (
                <p className="py-10 text-xs text-slate-500 dark:text-slate-400">
                  {isZh ? '此切片沒有產品類別列。' : 'No category rows in this slice.'}
                </p>
              ) : (
                <EChartsContainer option={categoryOption} height={chartHeight(categories.length)} />
              )}
            </div>

            <div className="chart-panel bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {isZh ? `產品淨銷售額前 ${productShown} 名` : `Top ${productShown} products by net sales`}
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {isZh
                  ? `前 ${productShown} 名／全體 ${products.length} 項產品。排序：淨銷售額由高到低，同額依代碼。未進圖的產品仍在明細與 CSV，不設 Other。橫條不是毛利，也不與毛利堆疊。`
                  : `Top ${productShown} of ${products.length} products by net sales (descending, ties: member code). Products outside this chart remain in the table and CSV. No Other bucket. Bars are not gross profit and are not stacked with it.`}
              </p>
              {productChartRows.length === 0 ? (
                <p className="py-10 text-xs text-slate-500 dark:text-slate-400">
                  {isZh ? '此切片沒有產品列。' : 'No product rows in this slice.'}
                </p>
              ) : (
                <EChartsContainer
                  option={productOption}
                  height={chartHeight(productChartRows.length)}
                  onEvents={{
                    click: (params: { componentType?: string; dataIndex?: unknown }) => {
                      if (params?.componentType === 'markLine') return;
                      const index = pointIndex(params);
                      const row = index == null ? undefined : productChartRows[index];
                      if (!row) return;
                      openDrillDown({
                        title: isZh ? `${row.key} (${row.label}) 客戶採購下鑽` : `${row.key} (${row.label}) Customer Drill-Down`,
                        dimensionName: isZh ? '產品' : 'Product',
                        dimensionValue: row.key,
                        sourceDashboard: 'D04',
                        groupBy: 'customer',
                        filterOverrides: { product: row.key },
                        summaryMetrics: [
                          { label: isZh ? '淨銷售額' : 'Net Sales', value: fmtUSD(row.netSalesUSD) },
                          { label: isZh ? '毛利率' : 'GM %', value: fmtPercent(row.grossMarginPercent) },
                          { label: isZh ? '淨銷量' : 'Net Qty', value: fmtKG(row.netQtyKG) },
                          { label: isZh ? '平均單價' : 'ASP', value: fmtPriceUSD(row.averageSellingPriceUSD) },
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
                {isZh ? `產品組合明細（全體 ${products.length} 項，點列下鑽客戶）` : `Product mix table (all ${products.length} products; click a row to drill)`}
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs tabular-nums">
                  <thead className="bg-slate-50 dark:bg-slate-800/70">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '產品 (Key / Label)' : 'Product'}
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
                        {isZh ? '平均單價 (ASP)' : 'ASP'}
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
                    {products.map((row) => (
                      <tr
                        key={row.key}
                        onClick={() =>
                          openDrillDown({
                            title: isZh ? `${row.key} (${row.label}) 客戶下鑽` : `${row.key} (${row.label}) Customer Drill-Down`,
                            dimensionName: isZh ? '產品' : 'Product',
                            dimensionValue: row.key,
                            sourceDashboard: 'D04',
                            groupBy: 'customer',
                            filterOverrides: { product: row.key },
                            rows: [],
                          })
                        }
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      >
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
              title={isZh ? 'D04 產品組合結構分析' : 'D04 Product Mix Insights'}
              data={{
                observed: isZh
                  ? `當前範圍共有 ${products.length} 項活躍產品與 ${categories.length} 個產品類別；總淨銷售額 ${fmtUSD(
                      kpis.netSalesUSD
                    )}，總淨銷量 ${fmtKG(kpis.netQtyKG)}${
                      topProduct
                        ? `。第一大產品為 ${topProduct.key} (${topProduct.label})，淨銷售額 ${fmtUSD(
                            topProduct.netSalesUSD
                          )}（毛利率 ${fmtPercent(topProduct.grossMarginPercent)}）。`
                        : '。'
                    }`
                  : `Active scope covers ${products.length} products across ${categories.length} categories; Total Net Sales ${fmtUSD(
                      kpis.netSalesUSD
                    )}, Net Volume ${fmtKG(kpis.netQtyKG)}${
                      topProduct
                        ? `. Top product is ${topProduct.key} (${topProduct.label}) at ${fmtUSD(
                            topProduct.netSalesUSD
                          )} (GM% ${fmtPercent(topProduct.grossMarginPercent)}).`
                        : '.'
                    }`,
                interpretation: isZh
                  ? `平均銷售單價為 ${fmtPriceUSD(
                      kpis.averageSellingPriceUSD
                    )}，整體加權毛利率為 ${fmtPercent(
                      kpis.grossMarginPercent
                    )}。點擊任一產品列可下鑽查看該產品的採購客戶與廠區分佈。`
                  : `Overall ASP is ${fmtPriceUSD(
                      kpis.averageSellingPriceUSD
                    )} with weighted GM% of ${fmtPercent(
                      kpis.grossMarginPercent
                    )}. Click any product row to drill down into purchasing customers and plants.`,
                claimType: 'OBSERVATION',
                coverage: `${summaryLabels.monthLabel} · ${summaryLabels.companyLabel}`,
                confidence: 'SSAS Direct',
                evidenceId: data?.evidence?.requestId || 'D04',
                evidence: data?.evidence,
                source: data?.source,
                limitations: [
                  isZh
                    ? '產品排行依淨銷售額 由高至低排序，同值時依成員代碼 排序。圖僅列前 12 名或全部（取其少者）；其餘列在表與 CSV。'
                    : 'Products are sorted by netSalesUSD descending, with ties broken by key. The chart lists the top 12 or the full list, whichever is smaller; remaining rows stay in the table and CSV.',
                ],
                nextSteps: [
                  isZh ? '進入 D14 檢視產品營收中位數與加權毛利矩陣' : 'Go to D14 Product Portfolio Matrix',
                  isZh ? '進入 D08 檢視產品獲利品質與負毛利明細行數' : 'Go to D08 Profitability Quality',
                  isZh ? '進入 D16 檢視產品同期成長與衰退貢獻瀑布' : 'Go to D16 Growth Contribution',
                ],
              }}
            />
          </div>
        )}
      </StateGuard>
    </div>
  );
};

export default D04ProductMix;
