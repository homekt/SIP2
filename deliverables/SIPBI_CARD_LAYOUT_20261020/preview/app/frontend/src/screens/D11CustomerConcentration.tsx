import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Filters, SalesRow } from '../types/sales';
import { useSalesDashboard } from '../services/salesApi';
import { StateGuard } from '../components/common/StateGuard';
import { KpiCard } from '../components/charts/KpiCard';
import { EChartsContainer } from '../components/charts/EChartsContainer';
import { AiInsightCard } from '../components/ai/AiInsightCard';
import { useApp } from '../context/AppContext';
import { getFilterSummaryLabels } from '../utils/slicerData';
import { computeParetoPercentAxis } from '../utils/salesMath';
import {
  DASH,
  exportSalesRowsCsv,
  fmtCount,
  fmtHHI,
  fmtKG,
  fmtPercent,
  fmtUSD,
} from '../utils/salesFormat';

interface Props {
  slicer: Filters;
}

interface RankedShare {
  rank: number;
  row: SalesRow;
  share: number | null;
  cumShare: number | null;
}

type ViewMode = 'top20' | 'all';

type ShareDenial = 'no_rows' | 'status' | 'null' | 'non_finite' | 'negative' | 'total';

interface ChartPoint {
  componentType?: string;
  data?: unknown;
  dataIndex?: unknown;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function finiteSales(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Finite net sales descending; null and non-finite last; key ascending on ties. */
function compareCustomers(left: SalesRow, right: SalesRow): number {
  const leftSales = finiteSales(left.netSalesUSD);
  const rightSales = finiteSales(right.netSalesUSD);
  if (leftSales !== null && rightSales !== null && leftSales !== rightSales) return rightSales - leftSales;
  if (leftSales !== null && rightSales === null) return -1;
  if (leftSales === null && rightSales !== null) return 1;
  if (left.key < right.key) return -1;
  if (left.key > right.key) return 1;
  return 0;
}

function denialOf(customers: SalesRow[], status: string | undefined): ShareDenial | null {
  if (customers.length === 0) return 'no_rows';
  if (status !== 'available') return 'status';
  if (customers.some((row) => row.netSalesUSD == null)) return 'null';
  if (customers.some((row) => finiteSales(row.netSalesUSD) === null)) return 'non_finite';
  if (customers.some((row) => (row.netSalesUSD as number) < 0)) return 'negative';
  const total = customers.reduce((sum, row) => sum + (row.netSalesUSD as number), 0);
  if (!(total > 0)) return 'total';
  return null;
}

function reasonText(denial: ShareDenial, status: string | undefined, isZh: boolean): string {
  switch (denial) {
    case 'no_rows':
      return isZh ? '此切片沒有客戶列，不計算累積佔比。' : 'No customer rows in this slice, so cumulative share is unavailable.';
    case 'status':
      return isZh
        ? `累積佔比不可用（狀態 ${status || DASH}）。長條仍為淨銷售額。`
        : `Cumulative share unavailable (status ${status || DASH}). Bars still show net sales.`;
    case 'null':
      return isZh
        ? '有客戶淨銷售額為空值，不計算累積佔比。空值不會畫成 0。'
        : 'A customer net sales value is null, so cumulative share is not calculated. Null is not drawn as zero.';
    case 'non_finite':
      return isZh
        ? '有客戶淨銷售額不是有限數，不計算累積佔比。'
        : 'A customer net sales value is not finite, so cumulative share is not calculated.';
    case 'negative':
      return isZh
        ? '有客戶淨銷售額為負值，不計算累積佔比。長條仍畫出正負淨銷售。'
        : 'A customer net sales value is negative, so cumulative share is not calculated. Bars still show signed net sales.';
    case 'total':
      return isZh
        ? '所選客戶淨銷售合計不大於 0，不計算累積佔比。'
        : 'Selected-customer net sales total is not above zero, so cumulative share is not calculated.';
    default:
      return isZh ? '累積佔比不可用。' : 'Cumulative share is unavailable.';
  }
}

function pointList(params: unknown): ChartPoint[] {
  if (Array.isArray(params)) return params as ChartPoint[];
  if (params && typeof params === 'object') return [params as ChartPoint];
  return [];
}

/** Resolve a click or tooltip to the sorted window. Never index the unsorted source array. */
function resolveRanked(params: unknown, shown: RankedShare[]): RankedShare | undefined {
  for (const entry of pointList(params)) {
    if (!entry) continue;
    if (entry.componentType === 'markLine' || entry.componentType === 'legend' || entry.componentType === 'dataZoom') {
      continue;
    }
    const data = entry.data;
    if (data && typeof data === 'object' && 'customerKey' in data) {
      const key = (data as { customerKey?: unknown }).customerKey;
      if (typeof key === 'string') {
        const found = shown.find((item) => item.row.key === key);
        if (found) return found;
      }
    }
    if (typeof entry.dataIndex === 'number') return shown[entry.dataIndex];
  }
  return undefined;
}

export const D11CustomerConcentration: React.FC<Props> = ({ slicer }) => {
  const { theme, lang, openDrillDown, metadata, setLastDashboardContext } = useApp();
  const isDark = theme === 'dark';
  const isZh = lang === 'zh-TW';

  const { phase, data, error, reload } = useSalesDashboard('D11', slicer, setLastDashboardContext);
  const [view, setView] = useState<ViewMode>('top20');
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 639px)');
    const apply = () => setNarrow(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  const state =
    phase === 'pending'
      ? 'LOADING'
      : phase === 'no_data'
      ? 'NO_DATA'
      : phase === 'error'
      ? 'ERROR'
      : 'READY';

  const summaryLabels = getFilterSummaryLabels(slicer, metadata, isZh);
  const customers = data?.datasets?.customers;
  const analysis = data?.analysis;
  const kpis = data?.kpis;
  const isConcentrationValid = analysis?.concentrationStatus === 'available';

  const model = useMemo(() => {
    const source = customers ?? [];
    const sorted = [...source].sort(compareCustomers);
    const denial = denialOf(source, analysis?.concentrationStatus);
    const sharesOk = denial === null;
    const total = sharesOk ? sorted.reduce((sum, row) => sum + (row.netSalesUSD as number), 0) : 0;
    let running = 0;
    const ranked: RankedShare[] = sorted.map((row, index) => {
      if (!sharesOk || typeof row.netSalesUSD !== 'number') {
        return { rank: index + 1, row, share: null, cumShare: null };
      }
      running += row.netSalesUSD;
      const share = row.netSalesUSD / total;
      return { rank: index + 1, row, share, cumShare: running / total };
    });
    return {
      ranked,
      populationTotal: sharesOk ? total : null,
      sharesOk,
      denial,
    };
  }, [customers, analysis?.concentrationStatus]);

  const shownRef = useRef<RankedShare[]>([]);
  const drillRef = useRef<(row: SalesRow, share: number | null, cumShare: number | null) => void>(() => {});
  const onEvents = useMemo(
    () => ({
      click: (params: unknown) => {
        const item = resolveRanked(params, shownRef.current);
        if (!item) return;
        drillRef.current(item.row, item.share, item.cumShare);
      },
    }),
    []
  );

  const chart = useMemo(() => {
    const shown = view === 'top20' ? model.ranked.slice(0, 20) : model.ranked;
    const byCategory = new Map(shown.map((item) => [String(item.rank), item]));
    const windowCount = narrow ? 8 : 20;
    const showZoom = view === 'all' && shown.length > windowCount;
    const salesName = isZh ? '淨銷售額 (USD)' : 'Net sales (USD)';
    const shareName = isZh ? '累積佔比' : 'Cumulative share';
    const labelColor = isDark ? '#cbd5e1' : '#334155';
    const mutedColor = isDark ? '#94a3b8' : '#64748b';
    const splitColor = isDark ? '#1e293b' : '#e2e8f0';
    const salesColor = isDark ? '#60a5fa' : '#2563eb';
    const declineColor = isDark ? '#fb7185' : '#be123c';
    const lineColor = isDark ? '#fbbf24' : '#d97706';
    const windowNote =
      view === 'top20'
        ? isZh
          ? `前 ${Math.min(20, model.ranked.length)} 名／共 ${model.ranked.length} 家，依淨銷售由高到低。`
          : `Top ${Math.min(20, model.ranked.length)} of ${model.ranked.length} by net sales.`
        : isZh
          ? `全部 ${model.ranked.length} 家。滑桿只移動視窗。`
          : `All ${model.ranked.length} customers. The slider only moves the window.`;
    const windowMaxPct = shown.reduce(
      (maxVal, item) => (item.cumShare != null ? Math.max(maxVal, item.cumShare * 100) : maxVal),
      0
    );
    const paretoAxisCfg = computeParetoPercentAxis(windowMaxPct, view);
    const denomNote = isZh
      ? paretoAxisCfg.max < 100
        ? `累積佔比分母為全體客戶（前 ${shown.length} 名合計 ${windowMaxPct.toFixed(1)}%，右軸自動縮放至 0%–${paretoAxisCfg.max}%；切換「全部客戶」可檢視 80% 參考線）。`
        : '累積佔比的分母是全部所選客戶，此視窗終點不必是 100%。'
      : paretoAxisCfg.max < 100
        ? `Cumulative share uses all customers (Top ${shown.length} = ${windowMaxPct.toFixed(1)}%, right axis scaled to 0%–${paretoAxisCfg.max}%; switch to All customers for 80% line).`
        : 'Cumulative share uses all selected customers. This window need not end at 100%.';
    const subtitle = model.sharesOk
      ? `${summaryLabels.monthLabel} · USD · ${windowNote} ${denomNote}`
      : `${summaryLabels.monthLabel} · USD · ${reasonText(model.denial || 'status', analysis?.concentrationStatus, isZh)}`;
    const title = isZh ? '客戶淨銷售柏拉圖' : 'Customer net sales Pareto';

    const usdAxis = {
      type: 'value' as const,
      name: 'USD',
      nameTextStyle: { color: salesColor, fontSize: 12 },
      min: model.sharesOk
        ? 0
        : (bound: { min: number }) => Math.min(0, Number.isFinite(bound.min) ? bound.min : 0),
      max: (bound: { max: number }) => Math.max(0, Number.isFinite(bound.max) ? bound.max : 0),
      axisLabel: {
        color: salesColor,
        fontSize: 12,
        formatter: (value: number) => axisUSD(value),
      },
      axisLine: { show: true, onZero: true, lineStyle: { color: '#64748b', width: 1.25 } },
      splitLine: { lineStyle: { color: splitColor } },
    };
    const percentAxis = {
      type: 'value' as const,
      name: '%',
      min: paretoAxisCfg.min,
      max: paretoAxisCfg.max,
      interval: paretoAxisCfg.interval,
      nameTextStyle: { color: lineColor, fontSize: 12 },
      axisLabel: {
        color: lineColor,
        fontSize: 12,
        formatter: (value: number) => `${Math.round(Number(value))}%`,
      },
      axisLine: { show: false },
      splitLine: { show: false },
    };

    const option = {
      title: {
        text: title,
        subtext: subtitle,
        textStyle: { fontSize: 14, fontWeight: 'bold' as const },
        subtextStyle: { fontSize: 12 },
      },
      aria: { enabled: true, description: `${title}. ${subtitle}` },
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        confine: true,
        textStyle: { fontSize: 12 },
        extraCssText: 'max-width:280px;white-space:normal;',
        formatter: (params: unknown) => {
          const item = resolveRanked(params, shown);
          if (!item) return '';
          const unavailable = isZh ? '不可用' : 'unavailable';
          const denomLine = model.sharesOk
            ? `<div>${isZh ? '分母（全部所選客戶）' : 'Denominator (all selected customers)'}: ${exactUSD(model.populationTotal)}</div>`
            : `<div>${escapeHtml(reasonText(model.denial || 'status', analysis?.concentrationStatus, isZh))}</div>`;
          return `<div style="font-size:12px;line-height:1.45">
            <div><b>${escapeHtml(item.row.label || DASH)}</b></div>
            <div style="font-family:ui-monospace,monospace">${escapeHtml(item.row.key)}</div>
            <div>${escapeHtml(salesName)}: ${exactUSD(item.row.netSalesUSD)}</div>
            <div>${isZh ? '單一佔比' : 'Individual share'}: ${model.sharesOk ? exactPct(item.share) : unavailable}</div>
            <div>${isZh ? '累積佔比' : 'Cumulative share'}: ${model.sharesOk ? exactPct(item.cumShare) : unavailable}</div>
            <div>${isZh ? '名次' : 'Rank'}: ${item.rank} / ${model.ranked.length}</div>
            ${denomLine}
          </div>`;
        },
      },
      legend: {
        type: 'scroll' as const,
        top: 0,
        left: 8,
        right: 8,
        itemWidth: 14,
        itemHeight: 8,
        textStyle: { color: labelColor, fontSize: 12 },
      },
      grid: {
        left: 8,
        right: 8,
        top: 52,
        bottom: showZoom ? 76 : 8,
        containLabel: true,
      },
      dataZoom: showZoom
        ? [
            {
              type: 'slider' as const,
              xAxisIndex: 0,
              start: 0,
              end: 100,
              bottom: 8,
              height: 18,
              brushSelect: false,
              filterMode: 'filter' as const,
              textStyle: { color: mutedColor, fontSize: 12 },
            },
            {
              type: 'inside' as const,
              xAxisIndex: 0,
              filterMode: 'filter' as const,
              zoomOnMouseWheel: 'shift' as const,
              moveOnMouseMove: false,
              moveOnMouseWheel: false,
            },
          ]
        : undefined,
      xAxis: {
        type: 'category' as const,
        data: shown.map((item) => String(item.rank)),
        axisTick: { show: false, alignWithLabel: true },
        axisLabel: {
          color: labelColor,
          fontSize: 12,
          interval: 'auto' as const,
          hideOverlap: true,
          rotate: 0,
          width: 40,
          overflow: 'truncate' as const,
          formatter: (value: string) => {
            const item = byCategory.get(String(value));
            if (!item) return String(value);
            return `#${item.rank}`;
          },
        },
      },
      yAxis: model.sharesOk ? [usdAxis, percentAxis] : [usdAxis],
      series: [
        {
          name: salesName,
          type: 'bar' as const,
          cursor: 'pointer',
          barMaxWidth: 36,
          data: shown.map((item) => ({
            value: item.row.netSalesUSD,
            customerKey: item.row.key,
            itemStyle:
              typeof item.row.netSalesUSD === 'number' && item.row.netSalesUSD < 0
                ? { color: declineColor, borderRadius: [0, 0, 3, 3] }
                : { color: salesColor, borderRadius: [3, 3, 0, 0] },
          })),
        },
        ...(model.sharesOk
          ? [
              {
                name: shareName,
                type: 'line' as const,
                yAxisIndex: 1,
                smooth: false,
                connectNulls: false,
                showSymbol: shown.length <= 40,
                symbol: 'emptyCircle',
                symbolSize: 6,
                cursor: 'pointer',
                z: 3,
                lineStyle: { width: 2, color: lineColor },
                itemStyle: { color: lineColor },
                data: shown.map((item) => ({
                  value: item.cumShare == null ? null : item.cumShare * 100,
                  customerKey: item.row.key,
                })),
                markLine: paretoAxisCfg.showPareto80Line
                  ? {
                      silent: true,
                      symbol: 'none',
                      lineStyle: {
                        type: 'dashed',
                        color: isDark ? '#fb7185' : '#e11d48',
                        width: 1.5,
                      },
                      data: [
                        {
                          yAxis: 80,
                          label: {
                            show: true,
                            position: 'insideEndTop',
                            distance: 6,
                            formatter: isZh ? '80% 參考線' : '80% Pareto Reference',
                            fontSize: 11,
                            fontWeight: 'bold',
                            color: isDark ? '#fb7185' : '#e11d48',
                            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.9)',
                            padding: [2, 6],
                            borderRadius: 4,
                          },
                        },
                      ],
                    }
                  : undefined,
              },
            ]
          : []),
      ],
    };

    return { shown, option, showZoom };
  }, [
    view,
    narrow,
    isZh,
    isDark,
    model,
    summaryLabels.monthLabel,
    analysis?.concentrationStatus,
  ]);

  shownRef.current = chart.shown;
  drillRef.current = (row, share, cumShare) => {
    openDrillDown({
      title: isZh ? `${row.key} (${row.label}) 客戶下鑽` : `${row.key} (${row.label}) Drill-Down`,
      dimensionName: isZh ? '客戶' : 'Customer',
      dimensionValue: row.key,
      sourceDashboard: 'D11',
      groupBy: 'product',
      filterOverrides: { customer: row.key },
      summaryMetrics: [
        { label: isZh ? '淨銷售額' : 'Net Sales', value: fmtUSD(row.netSalesUSD) },
        { label: isZh ? '單一佔比' : 'Share', value: fmtPercent(share) },
        { label: isZh ? '累積佔比' : 'Cumulative', value: fmtPercent(cumShare) },
      ],
      rows: [],
    });
  };

  const modeClass = (active: boolean) =>
    active
      ? 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white border border-indigo-600 cursor-pointer focus-ring'
      : 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 cursor-pointer focus-ring';

  const openTableRow = (item: RankedShare) => {
    openDrillDown({
      title: isZh ? `${item.row.key} (${item.row.label}) 產品下鑽` : `${item.row.key} (${item.row.label}) Product Drill-Down`,
      dimensionName: isZh ? '客戶' : 'Customer',
      dimensionValue: item.row.key,
      sourceDashboard: 'D11',
      groupBy: 'product',
      filterOverrides: { customer: item.row.key },
      rows: [],
    });
  };

  return (
    <div className="sales-dashboard space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {isZh ? 'D11 客戶集中度 (Customer Concentration)' : 'D11 Customer Concentration'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {`${summaryLabels.monthLabel} · ${summaryLabels.companyLabel} · USD`}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() =>
              exportSalesRowsCsv(
                `D11_Concentration_${slicer.month}.csv`,
                customers ?? [],
                'CustomerKey'
              )
            }
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 cursor-pointer focus-ring"
          >
            {isZh ? '📥 匯出客戶集中度 CSV' : '📥 Export Concentration CSV'}
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
                title={isZh ? '前五大客戶集中度 (CR5)' : 'Top 5 Share (CR5)'}
                value={isConcentrationValid ? fmtPercent(analysis?.cr5) : DASH}
                subValue={isConcentrationValid ? (isZh ? '當期營收占比' : 'Selected revenue share') : (isZh ? '不適用' : 'Unavailable')}
                trend="neutral"
                footnote={isZh ? '前 5 名／全體客戶淨銷售' : 'Top 5 / all customer net sales'}
              />
              <KpiCard
                title={isZh ? '赫芬達爾指數 (HHI)' : 'HHI Concentration Index'}
                value={isConcentrationValid ? fmtHHI(analysis?.hhi) : DASH}
                subValue={`${model.ranked.length} ${isZh ? '家客戶' : 'Customers'}`}
                trend="neutral"
                footnote={isZh ? '全體客戶佔比平方和' : 'Sum of squared revenue shares'}
              />
              <KpiCard
                title={isZh ? '客戶總淨銷售額' : 'Total Customer Sales'}
                value={fmtUSD(kpis.netSalesUSD)}
                subValue={`GM%: ${fmtPercent(kpis.grossMarginPercent)}`}
                trend="neutral"
                footnote={isZh ? `總毛利額: ${fmtUSD(kpis.grossProfitUSD)}` : `Gross Profit: ${fmtUSD(kpis.grossProfitUSD)}`}
              />
              <KpiCard
                title={isZh ? '首位客戶佔比 (Top 1 Share)' : 'Top 1 Customer Share'}
                value={model.sharesOk ? fmtPercent(model.ranked[0]?.share) : DASH}
                subValue={model.ranked[0]?.row.key || DASH}
                trend="neutral"
                footnote={model.ranked[0]?.row.label || DASH}
                drillThroughTarget="D06"
              />
            </div>

            <div className="chart-panel bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <div
                className="mb-3 flex flex-wrap gap-2"
                role="group"
                aria-label={isZh ? '客戶範圍' : 'Customer range'}
              >
                <button
                  type="button"
                  aria-pressed={view === 'top20'}
                  onClick={() => setView('top20')}
                  className={modeClass(view === 'top20')}
                >
                  {isZh ? '前 20 名' : 'Top 20'}
                </button>
                <button
                  type="button"
                  aria-pressed={view === 'all'}
                  onClick={() => setView('all')}
                  className={modeClass(view === 'all')}
                >
                  {isZh ? '全部客戶' : 'All customers'}
                </button>
              </div>

              <h3 className="chart-panel-title">{chart.option.title.text}</h3>
              <p className="chart-panel-subtitle mb-2">{chart.option.title.subtext}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 sm:hidden mb-2">
                {isZh ? '左右捲動圖表；點擊名次可查看客戶明細。' : 'Scroll horizontally; select a rank for customer details.'}
              </p>
              {model.ranked.length === 0 ? (
                <p className="py-10 text-xs text-slate-500 dark:text-slate-400">
                  {isZh ? '此切片沒有客戶列。' : 'No customer rows in this slice.'}
                </p>
              ) : (
                <div
                  className="overflow-x-auto"
                  tabIndex={0}
                  aria-label={
                    isZh
                      ? '柏拉圖。窄螢幕可橫向捲動以看完全部名次。'
                      : 'Pareto chart. On a narrow screen, scroll horizontally to see every rank.'
                  }
                >
                  <div className={view === 'top20' && narrow ? 'min-w-[36rem]' : 'w-full min-w-0'}>
                    <EChartsContainer option={{ ...chart.option, title: undefined }} height="380px" onEvents={onEvents} />
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
                {isZh
                  ? `全體客戶排名與累積佔比（${model.ranked.length} 家）`
                  : `All customers: rank and cumulative share (${model.ranked.length})`}
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs tabular-nums">
                  <thead className="bg-slate-50 dark:bg-slate-800/70">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">Rank</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '客戶' : 'Customer'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '淨銷售額 (USD)' : 'Net Sales (USD)'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '營收佔比' : 'Revenue Share'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '累積佔比' : 'Cumulative Share'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '毛利率' : 'GM %'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '淨銷量 (KG)' : 'Net Qty (KG)'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '訂單數' : 'Orders'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                    {model.ranked.map((item) => (
                      <tr
                        key={item.row.key}
                        tabIndex={0}
                        role="button"
                        aria-label={`${item.row.key} ${item.row.label}`}
                        onClick={() => openTableRow(item)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openTableRow(item);
                          }
                        }}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors focus-ring"
                      >
                        <td className="px-3 py-2 font-bold text-slate-500">#{item.rank}</td>
                        <td className="px-3 py-2 font-sans">
                          <div className="font-bold text-indigo-600 dark:text-indigo-400">{item.row.label}</div>
                          <div className="text-[11px] font-mono text-slate-400">{item.row.key}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-bold">{fmtUSD(item.row.netSalesUSD)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-indigo-600 dark:text-indigo-400">
                          {fmtPercent(item.share)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">{fmtPercent(item.cumShare)}</td>
                        <td className="px-3 py-2 text-right">{fmtPercent(item.row.grossMarginPercent)}</td>
                        <td className="px-3 py-2 text-right">{fmtKG(item.row.netQtyKG)}</td>
                        <td className="px-3 py-2 text-right">{fmtCount(item.row.orderCount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <AiInsightCard
              title={isZh ? 'D11 客戶集中度算術結構解讀' : 'D11 Customer Concentration Arithmetic Summary'}
              data={{
                observed: isConcentrationValid
                  ? isZh
                    ? `當前切片共 ${model.ranked.length} 家客戶，總淨銷售額 ${fmtUSD(
                        kpis.netSalesUSD
                      )}；前五大客戶集中度 CR5 為 ${fmtPercent(analysis?.cr5)}，HHI 集中度指數為 ${fmtHHI(
                        analysis?.hhi
                      )}。`
                    : `Current slice covers ${model.ranked.length} customers with Total Net Sales ${fmtUSD(
                        kpis.netSalesUSD
                      )}; Top-5 Concentration (CR5) is ${fmtPercent(analysis?.cr5)} and HHI is ${fmtHHI(
                        analysis?.hhi
                      )}.`
                  : isZh
                    ? `當前切片集中度狀態為 ${analysis?.concentrationStatus}，CR5 與 HHI 顯示為 ${DASH}。`
                    : `Concentration status is ${analysis?.concentrationStatus}; CR5 and HHI are ${DASH}.`,
                interpretation: isZh
                  ? 'CR5 為前五大客戶淨銷售額佔全體客戶淨銷售總額之比例；HHI 為全體客戶銷售額佔比平方和，僅在全體客戶銷售總額 > 0 且無負營收客戶時計算。'
                  : 'CR5 is the revenue share of the top 5 customers; HHI is the sum of squared customer revenue shares across all customers when total > 0 and no customer revenue is negative.',
                claimType: 'ARITHMETIC_CONTRIBUTION',
                coverage: `${summaryLabels.monthLabel} · ${summaryLabels.companyLabel}`,
                confidence: 'SSAS Direct',
                evidenceId: data?.evidence?.requestId || 'D11',
                evidence: data?.evidence,
                source: data?.source,
                limitations: [
                  isZh
                    ? '累積佔比的分母是所選全部客戶。前 20 名與滑桿視窗都不會把終點改成 100%，也沒有 80% 目標。CR5 與 HHI 沿用 API。'
                    : 'Cumulative share uses every selected customer as the denominator. Top 20 and the slider window are not forced to 100%, and there is no 80% target. CR5 and HHI come from the API.',
                ],
                nextSteps: [
                  isZh ? '進入 D06 檢視個別客戶毛利額與退貨表現' : 'Go to D06 Customer Contribution',
                  isZh ? '進入 D13 檢視負責業務員之實績分佈' : 'Go to D13 Salesperson Actuals',
                ],
              }}
            />
          </div>
        )}
      </StateGuard>
    </div>
  );
};

export default D11CustomerConcentration;
