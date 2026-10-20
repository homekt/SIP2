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

// Consistent, executive palette for 7 product categories
const CATEGORY_COLORS = [
  '#4f46e5', // Indigo
  '#0284c7', // Sky
  '#0d9488', // Teal
  '#16a34a', // Green
  '#d97706', // Amber
  '#7c3aed', // Purple
  '#db2777', // Pink
];
// Stable member-key colors: ranking changes must not change a category's identity.
const CATEGORY_KEYS = ['PE袋', '压花膜', 'PE代工', '缠绕膜', '未分類', 'PEVA', '重包裝'];
function categoryColor(key: string): string {
  const index = CATEGORY_KEYS.indexOf(key);
  return index < 0 ? '#64748b' : CATEGORY_COLORS[index];
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
  const rankedProducts = [...products].sort((a, b) =>
    (b.netSalesUSD ?? -Infinity) - (a.netSalesUSD ?? -Infinity) || a.key.localeCompare(b.key));
  const topProduct = rankedProducts[0];
  const productChartRows = rankedProducts.slice(0, 12);
  const productShown = productChartRows.length;

  const salesColor = '#4f46e5';
  const gpColor = isDark ? '#2dd4bf' : '#0f766e';
  const declineColor = isDark ? '#fb7185' : '#be123c';
  const secondaryColor = '#64748b';
  const labelColor = isDark ? '#cbd5e1' : '#334155';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';
  const splitColor = isDark ? '#1e293b' : '#e2e8f0';
  const salesName = isZh ? '淨銷售額 (USD)' : 'Net sales (USD)';
  const gmName = isZh ? '毛利率 (GM%, 上軸)' : 'Gross margin (GM%, top axis)';

  // Category composition validity check
  const hasCategories = categories.length > 0;
  const allFiniteNonNegative =
    hasCategories &&
    categories.every(
      (c) => typeof c.netSalesUSD === 'number' && Number.isFinite(c.netSalesUSD) && c.netSalesUSD >= 0
    );
  const categorySum = hasCategories
    ? categories.reduce((sum, c) => sum + (c.netSalesUSD || 0), 0)
    : 0;
  const canRenderDonut = allFiniteNonNegative && categorySum > 0;

  // Primary Chart: Category Donut (when population is positive and finite)
  const categoryDonutOption = {
    tooltip: {
      trigger: 'item' as const,
      confine: true,
      textStyle: { fontSize: 12 },
      extraCssText: 'max-width:340px;white-space:normal;',
      formatter: (params: any) => {
        const idx = params?.dataIndex;
        const row = typeof idx === 'number' ? categories[idx] : undefined;
        if (!row) return '';
        const share =
          categorySum > 0 && typeof row.netSalesUSD === 'number'
            ? row.netSalesUSD / categorySum
            : null;
        return `<div style="font-size:12px;line-height:1.45">
          <div><b>${escapeHtml(row.label || row.key || DASH)}</b></div>
          <div style="font-family:ui-monospace,monospace">${escapeHtml(row.key)}</div>
          <div>${escapeHtml(salesName)}: ${exactUSD(row.netSalesUSD)}</div>
          <div>${isZh ? '營收占比' : 'Revenue share'}: ${exactPct(share)}</div>
          <div>${isZh ? '毛利額' : 'Gross profit'}: ${exactUSD(row.grossProfitUSD)}</div>
          <div>${isZh ? '毛利率' : 'GM %'}: ${exactPct(row.grossMarginPercent)}</div>
        </div>`;
      },
    },
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '43%',
        style: {
          text: isZh ? '產品總銷售額' : 'Total Net Sales',
          textAlign: 'center',
          fill: mutedColor,
          fontSize: 12,
          fontWeight: 500,
        },
      },
      {
        type: 'text',
        left: 'center',
        top: '52%',
        style: {
          text: fmtUSD(categorySum),
          textAlign: 'center',
          fill: isDark ? '#f8fafc' : '#0f172a',
          fontSize: 15,
          fontWeight: 700,
        },
      },
    ],
    series: [
      {
        name: isZh ? '產品類別' : 'Product Category',
        type: 'pie' as const,
        radius: ['52%', '76%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 4,
          borderColor: isDark ? '#0f172a' : '#ffffff',
          borderWidth: 2,
        },
        label: { show: false },
        emphasis: {
          scale: true,
          scaleSize: 6,
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.3)',
          },
        },
        data: categories.map((cat) => ({
          name: cat.label || cat.key,
          value: cat.netSalesUSD,
          itemStyle: { color: categoryColor(cat.key) },
        })),
      },
    ],
  };

  // Fallback Chart: Signed Category Bar Chart (when negatives/nulls present)
  const categoryFallbackOption = {
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
          <div>${isZh ? '毛利額' : 'Gross profit'}: ${exactUSD(row.grossProfitUSD)}</div>
          <div>${isZh ? `名次 ${index + 1}／${categories.length}，依淨銷售額` : `Rank ${index + 1} of ${categories.length} by net sales`}</div>
        </div>`;
      },
    },
    legend: {
      bottom: 0,
      textStyle: { color: labelColor, fontSize: 12 },
      data: [salesName],
    },
    grid: { left: 4, right: 20, top: 10, bottom: 32, containLabel: true },
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
    yAxis: {
      type: 'category' as const,
      inverse: true,
      data: categories.map((row, index) => rankLabel(row, index + 1)),
      axisLabel: { color: labelColor, fontSize: 12, width: 140, overflow: 'truncate' as const, margin: 8 },
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

  // Secondary Chart: Top 12 Products Driver Comparison on Explicit Separate Scales
  // Bottom x-axis: Net Sales USD
  // Top x-axis: Gross Margin % (GM %)
  const productDriverOption = {
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow' as const },
      confine: true,
      textStyle: { fontSize: 12 },
      extraCssText: 'max-width:380px;white-space:normal;',
      formatter: (params: { dataIndex?: unknown } | Array<{ dataIndex?: unknown }>) => {
        const index = pointIndex(params);
        const row = index == null ? undefined : productChartRows[index];
        if (!row || index == null) return '';
        return `<div style="font-size:12px;line-height:1.45">
          <div><b>${escapeHtml(row.label || DASH)}</b></div>
          <div style="font-family:ui-monospace,monospace">${escapeHtml(row.key)}</div>
          <div>${escapeHtml(salesName)}: ${exactUSD(row.netSalesUSD)}</div>
          <div>${isZh ? '毛利率 (GM%)' : 'Gross Margin %'}: ${exactPct(row.grossMarginPercent)}</div>
          <div>${isZh ? '毛利額（未疊加於銷售）' : 'Gross Profit (not added to sales)'}: ${exactUSD(row.grossProfitUSD)}</div>
          <div>${isZh ? '淨銷量' : 'Net Qty'}: ${fmtKG(row.netQtyKG)}</div>
          <div>${isZh ? '平均單價 (ASP)' : 'ASP'}: ${fmtPriceUSD(row.averageSellingPriceUSD)}</div>
          <div style="margin-top:4px;color:${mutedColor}">
            ${isZh ? `名次 ${index + 1}／全體 ${products.length} 項產品（點擊下鑽客戶）` : `Rank ${index + 1} of ${products.length} products (click to drill)`}
          </div>
        </div>`;
      },
    },
    legend: {
      bottom: 0,
      textStyle: { color: labelColor, fontSize: 12 },
      data: [
        { name: salesName, icon: 'roundRect' },
        { name: gmName, icon: 'diamond' },
      ],
    },
    grid: { left: 4, right: 28, top: 26, bottom: 32, containLabel: true },
    xAxis: [
      {
        type: 'value' as const,
        position: 'bottom' as const,
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
      {
        type: 'value' as const,
        position: 'top' as const,
        scale: false,
        min: (bound: { min: number }) => Math.min(0, Number.isFinite(bound.min) ? Math.floor(bound.min * 10) / 10 : 0),
        max: (bound: { max: number }) => Math.max(0.5, Number.isFinite(bound.max) ? Math.ceil(bound.max * 10) / 10 : 0.5),
        axisLabel: {
          color: gpColor,
          fontSize: 12,
          formatter: (value: number) => `${Math.round(value * 100)}%`,
        },
        axisLine: { show: true, lineStyle: { color: gpColor, width: 1.25 } },
        axisTick: { show: false },
        splitLine: { show: false },
      },
    ],
    yAxis: {
      type: 'category' as const,
      inverse: true,
      data: productChartRows.map((row, index) => `#${index + 1} ${row.key}`),
      axisLabel: { color: labelColor, fontSize: 12, width: 120, overflow: 'truncate' as const, margin: 8 },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series: [
      {
        name: salesName,
        type: 'bar' as const,
        xAxisIndex: 0,
        barMaxWidth: 14,
        cursor: 'pointer',
        data: productChartRows.map((row) =>
          typeof row.netSalesUSD === 'number' && row.netSalesUSD < 0
            ? { value: row.netSalesUSD, itemStyle: { color: declineColor } }
            : { value: row.netSalesUSD }
        ),
        itemStyle: { color: salesColor, borderRadius: [0, 2, 2, 0] },
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
        name: gmName,
        type: 'scatter' as const,
        xAxisIndex: 1,
        cursor: 'pointer',
        symbol: 'diamond',
        symbolSize: 10,
        itemStyle: { color: gpColor, opacity: 1, borderColor: isDark ? '#f8fafc' : '#ffffff', borderWidth: 1.5 },
        z: 3,
        data: productChartRows.map((row, index) =>
          row.grossMarginPercent != null ? [row.grossMarginPercent, index] : null
        ),
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
              ? '類別營收組成，以及前 12 大產品的營收與毛利率。'
              : 'Category revenue composition and the sales and gross margin of the top 12 products.'}
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

            {/* Side-by-side Analytical Visualizations: Category Composition (Primary) + Product Drivers (Secondary) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Card 1: Primary Category Revenue Composition */}
              <div className="chart-panel bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col">
                <div className="mb-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {isZh ? '產品類別營收組成' : 'Category Revenue Composition'}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {canRenderDonut
                      ? isZh
                        ? `全體 ${categories.length} 個類別占比環形圖；中心顯示選定範圍總淨銷售額。`
                        : `Proportional donut of all ${categories.length} categories with total slice net sales in ring center.`
                      : isZh
                      ? '類別含負值、空值，或總額不大於零，改用金額比較。'
                      : 'Negative or missing category values, or a nonpositive total: showing signed amounts.'}
                  </p>
                </div>

                {categories.length === 0 ? (
                  <p className="py-20 text-center text-xs text-slate-500 dark:text-slate-400">
                    {isZh ? '此切片沒有產品類別列。' : 'No category rows in this slice.'}
                  </p>
                ) : canRenderDonut ? (
                  <div className="flex flex-col sm:flex-row items-center gap-2 flex-1 min-h-[320px]">
                    {/* Ring Chart */}
                    <div className="w-full sm:w-7/12 h-[320px] relative">
                      <EChartsContainer option={categoryDonutOption} height="320px" />
                    </div>

                    {/* Compact Adjacent Exact-Value / Share Legend */}
                    <div className="w-full sm:w-5/12 flex flex-col justify-center space-y-1 py-2 pr-1 border-t sm:border-t-0 sm:border-l border-slate-100 dark:border-slate-800/80">
                      <div className="text-xs font-medium text-slate-400 dark:text-slate-500 flex justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                        <span>{isZh ? '類別 / 營收' : 'Category / Sales'}</span>
                        <span>{isZh ? '營收占比' : 'Revenue share'}</span>
                      </div>
                      {categories.map((cat) => {
                        const share =
                          categorySum > 0 && typeof cat.netSalesUSD === 'number'
                            ? cat.netSalesUSD / categorySum
                            : null;
                        const color = categoryColor(cat.key);
                        return (
                          <div
                            key={cat.key}
                            className="flex items-center justify-between text-xs py-1 px-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                          >
                            <div className="flex items-center space-x-1.5 min-w-0 pr-1">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: color }}
                              />
                              <span
                                className="font-medium text-slate-700 dark:text-slate-200 truncate"
                                title={`${cat.label} (${cat.key})`}
                              >
                                {cat.label || cat.key}
                              </span>
                            </div>
                            <div className="text-right shrink-0 font-mono text-xs space-x-1">
                              <span className="font-semibold text-slate-900 dark:text-slate-100">
                                {fmtUSD(cat.netSalesUSD)}
                              </span>
                              <span className="text-slate-400 dark:text-slate-500">
                                ({fmtPercent(share)})
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-[320px]">
                    <EChartsContainer option={categoryFallbackOption} height="320px" />
                  </div>
                )}
              </div>

              {/* Card 2: Secondary Top 12 Product Driver Comparison */}
              <div className="chart-panel bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {isZh ? `產品淨銷售額與毛利率前 ${productShown} 名` : `Top ${productShown} Products: Sales & GM%`}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {isZh
                      ? `前 ${productShown} 名／全體 ${products.length} 項。長條：營收（下軸 USD）；菱形：毛利率（上軸）。點擊產品下鑽。`
                      : `Top ${productShown} of ${products.length}. Bars: sales (bottom USD); diamonds: margin (top %). Select a product to drill.`}
                  </p>
                </div>

                {productChartRows.length === 0 ? (
                  <p className="py-20 text-center text-xs text-slate-500 dark:text-slate-400">
                    {isZh ? '此切片沒有產品列。' : 'No product rows in this slice.'}
                  </p>
                ) : (
                  <div className="w-full h-[340px] mt-2">
                    <EChartsContainer
                      option={productDriverOption}
                      height="340px"
                      onEvents={{
                        click: (params: { componentType?: string; dataIndex?: unknown }) => {
                          if (params?.componentType === 'markLine') return;
                          const index = pointIndex(params);
                          const row = index == null ? undefined : productChartRows[index];
                          if (!row) return;
                          openDrillDown({
                            title: isZh
                              ? `${row.key} (${row.label}) 客戶採購下鑽`
                              : `${row.key} (${row.label}) Customer Drill-Down`,
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
                  </div>
                )}
              </div>
            </div>

            {/* Detailed Table (All Products) */}
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
                            title: isZh
                              ? `${row.key} (${row.label}) 客戶下鑽`
                              : `${row.key} (${row.label}) Customer Drill-Down`,
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
                          <div className="text-xs font-mono text-slate-400">{row.key}</div>
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
                    )}。點擊任一產品長條或明細列可下鑽查看該產品的採購客戶與廠區分佈。`
                  : `Overall ASP is ${fmtPriceUSD(
                      kpis.averageSellingPriceUSD
                    )} with weighted GM% of ${fmtPercent(
                      kpis.grossMarginPercent
                    )}. Click any product bar or table row to drill down into purchasing customers and plants.`,
                claimType: 'OBSERVATION',
                coverage: `${summaryLabels.monthLabel} · ${summaryLabels.companyLabel}`,
                confidence: 'SSAS Direct',
                evidenceId: data?.evidence?.requestId || 'D04',
                evidence: data?.evidence,
                source: data?.source,
                limitations: [
                  isZh
                    ? '產品排行依淨銷售額由高至低排序，同值時依成員代碼排序。圖僅列前 12 名；全體項目保留於明細表與 CSV 匯出。'
                    : 'Products are sorted by netSalesUSD descending, with ties broken by key. The chart displays the top 12 drivers; all rows remain in the table and CSV export.',
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
