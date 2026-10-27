import {CategoryShareComparison} from '../composition/productViews';
import React, { useState, useMemo } from 'react';
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


function escapeHtml(value: string | null | undefined): string {
  if (!value) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function exactUSD(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return DASH;
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}$${abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

function getMonthlyTrendSeries(
  monthly: SalesRow[],
  selectedMonth: string,
  metricExtractor: (m: SalesRow) => number | null
): { values: Array<number | null>; labels: string[]; caption: string } | undefined {
  if (!monthly || monthly.length === 0) return undefined;

  let targetIndex = monthly.length - 1;
  if (selectedMonth && selectedMonth !== 'All') {
    const idx = monthly.findIndex((m) => m.key === selectedMonth);
    if (idx === -1) return undefined;
    targetIndex = idx;
  }

  const startIndex = Math.max(0, targetIndex - 11);
  const slice = monthly.slice(startIndex, targetIndex + 1);
  if (slice.length === 0) return undefined;

  return {
    values: slice.map(metricExtractor),
    labels: slice.map((m) => m.key),
    caption: `${slice[0].key}..${slice[slice.length - 1].key}`,
  };
}

// Consistent palette for categories
const CATEGORY_COLORS = ['#1d4ed8', '#0369a1', '#1e40af', '#334155', '#475569', '#1e3a8a', '#64748b'];
const CATEGORY_KEYS = ['PE袋', '压花膜', 'PE代工', '缠绕膜', '未分類', 'PEVA', '重包裝'];
function categoryColor(key: string): string {
  const index = CATEGORY_KEYS.indexOf(key);
  return index < 0 ? '#64748b' : CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

export const D04ProductMix: React.FC<Props> = ({ slicer }) => {
  const { theme, lang, openDrillDown, metadata, setLastDashboardContext } = useApp();
  const isDark = theme === 'dark';
  const isZh = lang === 'zh-TW';

  const [categoryView, setCategoryView] = useState<'treemap' | 'donut'>('treemap');

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
  const monthly = data?.datasets?.monthly || [];

  const rankedProducts = useMemo(() => {
    return [...products].sort(
      (a, b) =>
        (b.netSalesUSD ?? -Infinity) - (a.netSalesUSD ?? -Infinity) || a.key.localeCompare(b.key)
    );
  }, [products]);

  const topProduct = rankedProducts[0];
  const productChartRows = rankedProducts.slice(0, 12);
  const productShown = productChartRows.length;

  // Colors
  const salesColor = isDark ? '#60a5fa' : '#2563eb';
  const gmDiamondColor = isDark ? '#fbbf24' : '#d97706';
  const declineColor = isDark ? '#f43f5e' : '#e11d48';
  const secondaryColor = '#64748b';
  const labelColor = isDark ? '#cbd5e1' : '#334155';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';
  const splitColor = isDark ? '#1e293b' : '#e2e8f0';
  const salesName = isZh ? '淨銷售額 (USD, 下軸)' : 'Net sales (USD, bottom axis)';
  const gmName = isZh ? '毛利率 (GM%, 上軸)' : 'Gross margin (GM%, top axis)';

  // KPI Sparklines
  const salesTrend = useMemo(
    () => getMonthlyTrendSeries(monthly, slicer.month, (m) => m.netSalesUSD),
    [monthly, slicer.month]
  );
  const gpTrend = useMemo(
    () => getMonthlyTrendSeries(monthly, slicer.month, (m) => m.grossProfitUSD),
    [monthly, slicer.month]
  );
  const qtyTrend = useMemo(
    () => getMonthlyTrendSeries(monthly, slicer.month, (m) => m.netQtyKG),
    [monthly, slicer.month]
  );

  // Category composition data validation
  const hasCategories = categories.length > 0;
  const allFiniteNonNegative =
    hasCategories &&
    categories.every(
      (c) => typeof c.netSalesUSD === 'number' && Number.isFinite(c.netSalesUSD) && c.netSalesUSD >= 0
    );
  const categorySum = hasCategories
    ? categories.reduce((sum, c) => sum + (c.netSalesUSD || 0), 0)
    : 0;
  const canRenderArea = allFiniteNonNegative && categorySum > 0;

  // 1. Primary Default: FLAT Category Treemap (all 7 categories, area = nonnegative category revenue)
  const categoryTreemapOption = useMemo(() => {
    const treemapData = categories
      .filter((c) => typeof c.netSalesUSD === 'number' && c.netSalesUSD > 0)
      .map((cat) => {
        const share = categorySum > 0 ? cat.netSalesUSD! / categorySum : 0;
        return {
          name: `${cat.label || cat.key}\n${(share * 100).toFixed(1)}%`,
          rawName: cat.label || cat.key,
          key: cat.key,
          value: cat.netSalesUSD,
          itemStyle: { color: categoryColor(cat.key) },
        };
      });

    return {
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter: (params: any) => {
          const cat = categories.find(
            (c) => c.key === params.data?.key || c.label === params.data?.rawName
          );
          if (!cat) return '';
          const share =
            categorySum > 0 && typeof cat.netSalesUSD === 'number'
              ? cat.netSalesUSD / categorySum
              : null;
          return [
            `<strong>${escapeHtml(cat.label || cat.key)} (${escapeHtml(cat.key)})</strong>`,
            `${isZh ? '淨銷售額' : 'Net Sales'}: <strong>${fmtUSD(cat.netSalesUSD)}</strong>`,
            `${isZh ? '營收佔比' : 'Revenue Share'}: <strong>${fmtPercent(share)}</strong>`,
            `${isZh ? '毛利額' : 'Gross Profit'}: ${fmtUSD(cat.grossProfitUSD)}`,
            `${isZh ? '加權毛利率' : 'GM %'}: ${fmtPercent(cat.grossMarginPercent)}`,
          ].join('<br/>');
        },
      },
      series: [
        {
          name: isZh ? '產品類別營收' : 'Category Revenue',
          type: 'treemap',
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          label: {
            show: true,
            fontSize: 12,
            color: '#ffffff',
            fontWeight: 'bold',
          },
          itemStyle: {
            borderColor: isDark ? '#0f172a' : '#ffffff',
            borderWidth: 2,
            gapWidth: 2,
          },
          data: treemapData,
        },
      ],
    };
  }, [categories, categorySum, isDark, isZh]);

  // 2. Optional Toggle: Donut Chart Top 4 + Other (<= 5 slices, exact Other sum, gray Other last)
  const categoryDonutOption = useMemo(() => {
    const sorted = [...categories].sort((a, b) => (b.netSalesUSD ?? 0) - (a.netSalesUSD ?? 0));
    const top4 = sorted.slice(0, 4);
    const otherCats = sorted.slice(4);
    const otherSum = otherCats.reduce((sum, c) => sum + (c.netSalesUSD || 0), 0);

    const donutData = [
      ...top4.map((cat) => ({
        name: cat.label || cat.key,
        key: cat.key,
        value: cat.netSalesUSD,
        itemStyle: { color: categoryColor(cat.key) },
      })),
      ...(otherCats.length > 0
        ? [
            {
              name: isZh ? `其他 (${otherCats.length} 類別)` : `Other (${otherCats.length} Categories)`,
              key: '__other',
              value: otherSum,
              itemStyle: { color: '#94a3b8' },
            },
          ]
        : []),
    ];

    return {
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter: (params: any) => {
          if (params.data?.key === '__other') {
            const otherShare = categorySum > 0 ? otherSum / categorySum : 0;
            const catList = otherCats.map((c) => escapeHtml(c.label || c.key)).join(', ');
            return [
              `<strong>${isZh ? '其他類別彙總' : 'Other Categories Sum'}</strong>`,
              `${isZh ? '淨銷售額' : 'Net Sales'}: <strong>${fmtUSD(otherSum)}</strong>`,
              `${isZh ? '營收佔比' : 'Revenue Share'}: <strong>${fmtPercent(otherShare)}</strong>`,
              `${isZh ? '包含項目' : 'Included'}: ${catList}`,
            ].join('<br/>');
          }
          const cat = categories.find((c) => c.key === params.data?.key);
          if (!cat) return '';
          const share =
            categorySum > 0 && typeof cat.netSalesUSD === 'number'
              ? cat.netSalesUSD / categorySum
              : null;
          return [
            `<strong>${escapeHtml(cat.label || cat.key)} (${escapeHtml(cat.key)})</strong>`,
            `${isZh ? '淨銷售額' : 'Net Sales'}: <strong>${fmtUSD(cat.netSalesUSD)}</strong>`,
            `${isZh ? '營收佔比' : 'Revenue Share'}: <strong>${fmtPercent(share)}</strong>`,
            `${isZh ? '毛利額' : 'Gross Profit'}: ${fmtUSD(cat.grossProfitUSD)}`,
            `${isZh ? '加權毛利率' : 'GM %'}: ${fmtPercent(cat.grossMarginPercent)}`,
          ].join('<br/>');
        },
      },
      graphic: [
        {
          type: 'text',
          left: 'center',
          top: '43%',
          style: {
            text: isZh ? '選定範圍總額' : 'Total Net Sales',
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
          type: 'pie',
          radius: ['52%', '76%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 4,
            borderColor: isDark ? '#0f172a' : '#ffffff',
            borderWidth: 2,
          },
          label: { show: false },
          data: donutData,
        },
      ],
    };
  }, [categories, categorySum, isDark, isZh, mutedColor]);

  const categoryLegendRows = categoryView === 'donut'
    ? categoryDonutOption.series[0].data.map(item => ({key: item.key, label: item.name, netSalesUSD: item.value}))
    : categories;
  const otherCategoryNames = categories.filter(cat => !categoryLegendRows.some(item => item.key === cat.key)).map(cat => cat.label || cat.key).join('、');

  // Fallback Chart: Signed Category Bar Chart (when negatives/nulls present)
  const categoryFallbackOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      confine: true,
      formatter: (params: any) => {
        const index = pointIndex(params);
        const row = index == null ? undefined : categories[index];
        if (!row || index == null) return '';
        return [
          `<strong>${escapeHtml(row.label || DASH)} (${escapeHtml(row.key)})</strong>`,
          `${salesName}: <strong>${exactUSD(row.netSalesUSD)}</strong>`,
          `${isZh ? '毛利額' : 'Gross profit'}: ${exactUSD(row.grossProfitUSD)}`,
          `${isZh ? '加權毛利率' : 'GM %'}: ${fmtPercent(row.grossMarginPercent)}`,
        ].join('<br/>');
      },
    },
    grid: { left: 4, right: 20, top: 10, bottom: 32, containLabel: true },
    xAxis: {
      type: 'value',
      scale: false,
      min: (bound: { min: number }) => Math.min(0, Number.isFinite(bound.min) ? bound.min : 0),
      max: (bound: { max: number }) => Math.max(0, Number.isFinite(bound.max) ? bound.max : 0),
      axisLabel: {
        color: mutedColor,
        fontSize: 12,
        formatter: (value: number) => axisUSD(value),
      },
      axisLine: { show: true, onZero: true, lineStyle: { color: secondaryColor, width: 1.25 } },
      splitLine: { lineStyle: { color: splitColor } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: categories.map((row, index) => rankLabel(row, index + 1)),
      axisLabel: { color: labelColor, fontSize: 12, width: 140, overflow: 'truncate', margin: 8 },
    },
    series: [
      {
        name: salesName,
        type: 'bar',
        data: categories.map((row) =>
          typeof row.netSalesUSD === 'number' && row.netSalesUSD < 0
            ? { value: row.netSalesUSD, itemStyle: { color: declineColor } }
            : { value: row.netSalesUSD }
        ),
        itemStyle: { color: salesColor },
      },
    ],
  };

  // Secondary Chart: Top 12 Products Driver Comparison on Explicit Separate Scales
  // Bottom x-axis: Net Sales USD (blue bars #2563eb / #60a5fa)
  // Top x-axis: Gross Margin % (amber diamonds #d97706 / #fbbf24)
  const productDriverOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      confine: true,
      formatter: (params: any) => {
        const index = pointIndex(params);
        const row = index == null ? undefined : productChartRows[index];
        if (!row || index == null) return '';
        return [
          `<strong>${escapeHtml(row.label || DASH)} (${escapeHtml(row.key)})</strong>`,
          `<span style="color:${salesColor}">●</span> ${salesName}: <strong>${exactUSD(
            row.netSalesUSD
          )}</strong>`,
          `<span style="color:${gmDiamondColor}">◆</span> ${gmName}: <strong>${fmtPercent(
            row.grossMarginPercent
          )}</strong>`,
          `${isZh ? '毛利額' : 'Gross Profit'}: ${exactUSD(row.grossProfitUSD)}`,
          `${isZh ? '淨銷量' : 'Net Qty'}: ${fmtKG(row.netQtyKG)}`,
          `${isZh ? '平均單價 (ASP)' : 'ASP'}: ${fmtPriceUSD(row.averageSellingPriceUSD)}`,
          `<div style="margin-top:4px;color:${mutedColor}">${
            isZh
              ? `名次 ${index + 1}／全體 ${products.length} 項產品（點擊下鑽客戶）`
              : `Rank ${index + 1} of ${products.length} products (click to drill)`
          }</div>`,
        ].join('<br/>');
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
    grid: { left: 4, right: 28, top: 28, bottom: 36, containLabel: true },
    xAxis: [
      {
        type: 'value',
        position: 'bottom',
        scale: false,
        min: (bound: { min: number }) => Math.min(0, Number.isFinite(bound.min) ? bound.min : 0),
        axisLabel: {
          color: salesColor,
          fontSize: 12,
          formatter: (value: number) => axisUSD(value),
        },
        axisLine: { show: true, lineStyle: { color: salesColor, width: 1.25 } },
        splitLine: { lineStyle: { color: splitColor } },
      },
      {
        type: 'value',
        position: 'top',
        scale: false,
        min: (bound: { min: number }) => Math.min(0, Number.isFinite(bound.min) ? bound.min : 0),
        axisLabel: {
          color: gmDiamondColor,
          fontSize: 12,
          formatter: (value: number) => `${Math.round(value * 100)}%`,
        },
        axisLine: { show: true, lineStyle: { color: gmDiamondColor, width: 1.25 } },
        splitLine: { show: false },
      },
    ],
    yAxis: {
      type: 'category',
      inverse: true,
      data: productChartRows.map((row, index) => `#${index + 1} ${row.key}`),
      axisLabel: { color: labelColor, fontSize: 12, width: 120, overflow: 'truncate', margin: 8 },
    },
    series: [
      {
        name: salesName,
        type: 'bar',
        xAxisIndex: 0,
        barMaxWidth: 14,
        cursor: 'pointer',
        data: productChartRows.map((row) =>
          typeof row.netSalesUSD === 'number' && row.netSalesUSD < 0
            ? { value: row.netSalesUSD, itemStyle: { color: declineColor } }
            : { value: row.netSalesUSD }
        ),
        itemStyle: { color: salesColor, borderRadius: [0, 3, 3, 0] },
      },
      {
        name: gmName,
        type: 'scatter',
        xAxisIndex: 1,
        cursor: 'pointer',
        symbol: 'diamond',
        symbolSize: 10,
        itemStyle: {
          color: gmDiamondColor,
          opacity: 1,
          borderColor: isDark ? '#0f172a' : '#ffffff',
          borderWidth: 1.5,
        },
        z: 3,
        data: productChartRows.map((row, index) =>
          row.grossMarginPercent != null ? [row.grossMarginPercent, index] : null
        ),
      },
    ],
  };

  return (
    <div className="sales-dashboard space-y-4">
      {/* Header bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-3 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              {isZh ? 'D04 產品組合 (Product Mix)' : 'D04 Product Mix'}
            </h2>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              {summaryLabels.monthLabel} · {summaryLabels.companyLabel}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isZh
              ? '類別營收組成（扁平樹狀圖與 Top4+Other 結構）與前 12 大主力產品營收／毛利率對比'
              : 'Category composition (Flat Treemap & Top4+Other) and Top 12 Product drivers'}
          </p>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={() =>
              exportSalesRowsCsv(`D04_Products_${slicer.month}.csv`, products, 'ProductKey')
            }
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
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
          <>
            {/* 4 Primary Tier-1 KPI Cards with actual monthly sparklines */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <KpiCard
                title={isZh ? '產品總淨銷售額' : 'Total Product Sales'}
                value={fmtUSD(kpis.netSalesUSD)}
                subValue={`${products.length} ${isZh ? '項產品' : 'Products'}`}
                trend="neutral"
                footnote={`${categories.length} ${isZh ? '個產品類別' : 'Categories'}`}
                trendSeries={salesTrend}
              />
              <KpiCard
                title={isZh ? '加權毛利率 (GM%)' : 'Weighted GM %'}
                value={fmtPercent(kpis.grossMarginPercent)}
                subValue={fmtUSD(kpis.grossProfitUSD)}
                trend="neutral"
                footnote={isZh ? '毛利額 / 淨銷售額' : 'Gross Profit / Net Sales'}
                drillThroughTarget="D08"
                trendSeries={gpTrend}
              />
              <KpiCard
                title={isZh ? '總淨銷售量 (KG)' : 'Total Net Qty (KG)'}
                value={fmtKG(kpis.netQtyKG)}
                subValue={`ASP: ${fmtPriceUSD(kpis.averageSellingPriceUSD)}`}
                trend="neutral"
                footnote={isZh ? '平均銷售單價 (ASP)' : 'Average Selling Price'}
                trendSeries={qtyTrend}
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

            {/* Side-by-side Analytical Visualizations: Category Composition + Product Drivers */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Card 1: Category Revenue Composition (Default Flat Treemap with Donut Top4+Other toggle) */}
              <div className="lg:col-span-6 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {isZh ? '產品類別營收組成' : 'Category Revenue Composition'}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {canRenderArea
                          ? isZh
                            ? categoryView === 'treemap'
                              ? `全體 ${categories.length} 個類別扁平樹狀圖（面積嚴格對應營收規模）`
                              : `Top 4 主力類別 + 其他（嚴格加總 100%，其他置後灰底）`
                            : categoryView === 'treemap'
                            ? `Flat treemap of all ${categories.length} categories (area = revenue)`
                            : `Top 4 categories + Other (exact 100% sum, Other gray last)`
                          : isZh
                          ? '類別含負值或異常，改以水平長條圖呈現'
                          : 'Negative or zero values present; showing signed bars'}
                      </p>
                    </div>

                    {canRenderArea && (
                      <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-semibold shrink-0">
                        <button
                          type="button"
                          onClick={() => setCategoryView('treemap')}
                          className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                            categoryView === 'treemap'
                              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          {isZh ? '樹狀圖' : 'Treemap'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setCategoryView('donut')}
                          className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                            categoryView === 'donut'
                              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          {isZh ? 'Top4+其他' : 'Donut'}
                        </button>
                      </div>
                    )}
                  </div>

                  {categories.length === 0 ? (
                    <p className="py-20 text-center text-xs text-slate-500 dark:text-slate-400">
                      {isZh ? '此切片沒有產品類別列。' : 'No category rows in this slice.'}
                    </p>
                  ) : canRenderArea ? (
                    <div className="flex flex-col sm:flex-row items-center gap-2 min-h-[320px]">
                      <div className="w-full sm:w-7/12 h-[320px] relative">
                        <EChartsContainer
                          option={
                            categoryView === 'treemap'
                              ? categoryTreemapOption
                              : categoryDonutOption
                          }
                          height="320px"
                        />
                      </div>

                      {/* Complete Category Legend & Exact Breakdown */}
                      <div className="w-full sm:w-5/12 flex flex-col justify-center space-y-1 py-2 pr-1 border-t sm:border-t-0 sm:border-l border-slate-100 dark:border-slate-800/80">
                        <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500 flex justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                          <span>{isZh ? '類別 / 營收' : 'Category / Sales'}</span>
                          <span>{isZh ? '營收 · 佔比' : 'Sales · Share'}</span>
                        </div>
                        {categoryLegendRows.map((cat) => {
                          const share =
                            categorySum > 0 && typeof cat.netSalesUSD === 'number'
                              ? cat.netSalesUSD / categorySum
                              : null;
                          const color = cat.key === '__other' ? '#94a3b8' : categoryColor(cat.key);
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
                              <div className="text-right shrink-0 font-mono text-[11px] space-x-1">
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
                        {categoryView === 'donut' && otherCategoryNames && <p className="pt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{isZh ? '其他包含：' : 'Other includes: '}{otherCategoryNames}</p>}
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-[320px]">
                      <EChartsContainer option={categoryFallbackOption} height="320px" />
                    </div>
                  )}
                </div>
              </div>

              {/* Card 2: Top 12 Product Driver Comparison (Blue USD Bars vs Amber Diamonds) */}
              <div className="lg:col-span-6 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="chart-panel-header mb-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {isZh
                          ? `產品淨銷售額與毛利率前 ${productShown} 名`
                          : `Top ${productShown} Products: Sales & GM%`}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {isZh
                          ? `長條：營收（下軸藍色 USD）；菱形：毛利率（上軸琥珀色 %）。點擊產品下鑽客戶。`
                          : `Bars: sales (bottom blue USD); diamonds: margin (top amber %). Click product to drill.`}
                      </p>
                    </div>
                  </div>

                  {productChartRows.length === 0 ? (
                    <p className="py-20 text-center text-xs text-slate-500 dark:text-slate-400">
                      {isZh ? '此切片沒有產品列。' : 'No product rows in this slice.'}
                    </p>
                  ) : (
                    <div className="w-full h-[340px]">
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
                                {
                                  label: isZh ? '淨銷售額' : 'Net Sales',
                                  value: fmtUSD(row.netSalesUSD),
                                },
                                {
                                  label: isZh ? '毛利率' : 'GM %',
                                  value: fmtPercent(row.grossMarginPercent),
                                },
                                {
                                  label: isZh ? '淨銷量' : 'Net Qty',
                                  value: fmtKG(row.netQtyKG),
                                },
                                {
                                  label: isZh ? '平均單價' : 'ASP',
                                  value: fmtPriceUSD(row.averageSellingPriceUSD),
                                },
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
            </div>

            {/* Detailed Table (All 132 Products) with native details disclosure */}
            <details
              open
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs group"
            >
              <summary className="flex items-center justify-between cursor-pointer select-none">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {isZh
                      ? `產品組合明細表（全體 ${products.length} 項產品 · 點擊列下鑽客戶）`
                      : `Product Mix Table (All ${products.length} Products · Click row to drill)`}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {isZh
                      ? '依淨銷售額降冪排序 · 保留完整毛利額、毛利率、銷量、單價與退貨率指標'
                      : 'Ranked by Net Sales · Full GP, GM%, Volume, ASP, and Return Rate metrics retained'}
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  {products.length} {isZh ? '項產品' : 'Products'}
                </span>
              </summary>
              <div className="sales-table-wrap max-h-96 overflow-y-auto mt-3">
                <table className="sales-table divide-y divide-slate-200 dark:divide-slate-800 text-xs tabular-nums">
                  <thead className="bg-slate-50 dark:bg-slate-800/70 sticky top-0 z-10">
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
                          <div className="font-bold text-indigo-600 dark:text-indigo-400">
                            {row.label}
                          </div>
                          <div className="text-xs font-mono text-slate-400">{row.key}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-bold">{fmtUSD(row.netSalesUSD)}</td>
                        <td className="px-3 py-2 text-right text-amber-600 dark:text-amber-400">
                          {fmtUSD(row.grossProfitUSD)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">
                          {fmtPercent(row.grossMarginPercent)}
                        </td>
                        <td className="px-3 py-2 text-right">{fmtKG(row.netQtyKG)}</td>
                        <td className="px-3 py-2 text-right">
                          {fmtPriceUSD(row.averageSellingPriceUSD)}
                        </td>
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

            {/* Compact Summary & Evidence Receipt */}
            <CategoryShareComparison key={JSON.stringify(slicer)} rows={categories}/>

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
          </>
        )}
      </StateGuard>
    </div>
  );
};

export default D04ProductMix;
