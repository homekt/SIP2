import React, { useMemo } from 'react';
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

export const D11CustomerConcentration: React.FC<Props> = ({ slicer }) => {
  const { theme, lang, openDrillDown, metadata, setLastDashboardContext } = useApp();
  const isDark = theme === 'dark';
  const isZh = lang === 'zh-TW';

  const { phase, data, error, reload } = useSalesDashboard('D11', slicer, setLastDashboardContext);
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
  const isConcentrationValid = analysis?.concentrationStatus === 'available';

  const { rankedShares, populationTotal, sharesOk } = useMemo(() => {
    const valuesOk =
      customers.length > 0 &&
      customers.every((row) => typeof row.netSalesUSD === 'number' && row.netSalesUSD >= 0);
    const total = valuesOk
      ? customers.reduce((sum, row) => sum + (row.netSalesUSD as number), 0)
      : 0;
    const canShare = isConcentrationValid && valuesOk && total > 0;
    let running = 0;
    const shares: RankedShare[] = customers.map((row, index) => {
      if (!canShare || typeof row.netSalesUSD !== 'number') {
        return { rank: index + 1, row, share: null, cumShare: null };
      }
      const share = row.netSalesUSD / total;
      running += share;
      return { rank: index + 1, row, share, cumShare: running };
    });
    return {
      rankedShares: shares,
      populationTotal: canShare ? total : null,
      sharesOk: canShare,
    };
  }, [customers, isConcentrationValid]);

  const topRankRows = rankedShares.slice(0, 10);
  const topShown = topRankRows.length;

  const salesColor = '#4f46e5';
  const declineColor = isDark ? '#fb7185' : '#be123c';
  const secondaryColor = '#64748b';
  const attentionColor = '#b45309';
  const labelColor = isDark ? '#cbd5e1' : '#334155';
  const mutedColor = isDark ? '#94a3b8' : '#64748b';
  const splitColor = isDark ? '#1e293b' : '#e2e8f0';
  const salesName = isZh ? '淨銷售額 (USD)' : 'Net sales (USD)';
  const shareName = isZh ? '累積佔比' : 'Cumulative share';

  const openCustomer = (row: SalesRow, share: number | null, cumShare: number | null) => {
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

  const topOption = {
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow' as const },
      confine: true,
      textStyle: { fontSize: 12 },
      extraCssText: 'max-width:380px;white-space:normal;',
      formatter: (params: { dataIndex?: unknown } | Array<{ dataIndex?: unknown }>) => {
        const index = pointIndex(params);
        const item = index == null ? undefined : topRankRows[index];
        if (!item || index == null) return '';
        const shareLine = sharesOk
          ? `<div>${isZh ? '佔全體客戶淨銷售' : 'Share of all customer net sales'}: ${exactPct(item.share)}</div>`
          : `<div>${isZh ? '佔比未計算（母體不可用）' : 'Share is not calculated (population unavailable)'}</div>`;
        return `<div style="font-size:12px;line-height:1.45">
          <div><b>${escapeHtml(item.row.label || DASH)}</b></div>
          <div style="font-family:ui-monospace,monospace">${escapeHtml(item.row.key)}</div>
          <div>${escapeHtml(salesName)}: ${exactUSD(item.row.netSalesUSD)}</div>
          ${shareLine}
          <div>${isZh ? `名次 ${item.rank}／全體 ${customers.length}。此圖只排前 ${topShown} 名。` : `Rank ${item.rank} of ${customers.length}. This chart ranks only the top ${topShown}.`}</div>
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
    // inverse keeps rank 1 at the top; dataIndex stays aligned with topRankRows.
    yAxis: {
      type: 'category' as const,
      inverse: true,
      data: topRankRows.map((item) => rankLabel(item.row, item.rank)),
      axisLabel: { color: labelColor, fontSize: 12, width: 220, overflow: 'truncate' as const, margin: 8 },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series: [
      {
        name: salesName,
        type: 'bar' as const,
        cursor: 'pointer',
        data: topRankRows.map((item) =>
          typeof item.row.netSalesUSD === 'number' && item.row.netSalesUSD < 0
            ? { value: item.row.netSalesUSD, itemStyle: { color: declineColor } }
            : { value: item.row.netSalesUSD }
        ),
        itemStyle: { color: salesColor },
        label: {
          show: true,
          position: 'left' as const,
          distance: 4,
          fontSize: 12,
          color: declineColor,
          formatter: (point: { value?: unknown }) =>
            typeof point.value === 'number' && point.value < 0 ? '−' : '',
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

  const shareOption = {
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'line' as const },
      confine: true,
      textStyle: { fontSize: 12 },
      extraCssText: 'max-width:380px;white-space:normal;',
      formatter: (params: { dataIndex?: unknown } | Array<{ dataIndex?: unknown }>) => {
        const index = pointIndex(params);
        const item = index == null ? undefined : rankedShares[index];
        if (!item) return '';
        return `<div style="font-size:12px;line-height:1.45">
          <div><b>${escapeHtml(item.row.label || DASH)}</b></div>
          <div style="font-family:ui-monospace,monospace">${escapeHtml(item.row.key)}</div>
          <div>${isZh ? '名次' : 'Rank'}: ${item.rank} / ${rankedShares.length}</div>
          <div>${escapeHtml(salesName)}: ${exactUSD(item.row.netSalesUSD)}</div>
          <div>${isZh ? '單一佔比' : 'Share'}: ${exactPct(item.share)}</div>
          <div>${isZh ? '累積佔比' : 'Cumulative share'}: ${exactPct(item.cumShare)}</div>
          <div>${isZh ? '分母（全體客戶淨銷售合計）' : 'Denominator (all customer net sales)'}: ${exactUSD(populationTotal)}</div>
        </div>`;
      },
    },
    legend: {
      type: 'scroll' as const,
      bottom: 0,
      textStyle: { color: labelColor, fontSize: 12 },
      data: [shareName],
    },
    grid: { left: 8, right: 16, top: 16, bottom: 48, containLabel: true },
    xAxis: {
      type: 'category' as const,
      data: rankedShares.map((item) => String(item.rank)),
      name: isZh ? '名次' : 'Rank',
      nameTextStyle: { color: mutedColor, fontSize: 12 },
      axisLabel: { color: labelColor, fontSize: 12, hideOverlap: true },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      min: 0,
      name: '%',
      nameTextStyle: { color: mutedColor, fontSize: 12 },
      axisLabel: {
        color: mutedColor,
        fontSize: 12,
        formatter: (value: number) => `${Math.round(Number(value))}%`,
      },
      splitLine: { lineStyle: { color: splitColor } },
    },
    series: [
      {
        name: shareName,
        type: 'line' as const,
        smooth: false,
        connectNulls: false,
        showSymbol: rankedShares.length <= 40,
        symbol: 'emptyCircle',
        symbolSize: 6,
        cursor: 'pointer',
        lineStyle: { width: 2, type: 'dashed' as const, color: attentionColor },
        itemStyle: { color: attentionColor },
        data: rankedShares.map((item) => (item.cumShare == null ? null : item.cumShare * 100)),
      },
    ],
  };

  return (
    <div className="sales-dashboard space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {isZh ? 'D11 客戶集中度 (Customer Concentration)' : 'D11 Customer Concentration'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isZh
              ? '前 10 名看淨銷售高低；累積佔比用全體客戶。CR5 與 HHI 沿用同一母體規則。'
              : 'Top 10 ranks net sales. Cumulative share uses every customer. CR5 and HHI keep the same population rule.'}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() =>
              exportSalesRowsCsv(`D11_Concentration_${slicer.month}.csv`, customers, 'CustomerKey')
            }
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 cursor-pointer"
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
            {!isConcentrationValid && (
              <div className="p-4 rounded-md border border-amber-200 bg-amber-50 text-xs leading-5 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <strong>
                  {isZh
                    ? `集中度不可用（${analysis?.concentrationStatus || DASH}）。`
                    : `Concentration unavailable (${analysis?.concentrationStatus || DASH}). `}
                </strong>
                {isZh
                  ? '總淨銷售額 ≤ 0，或任一客戶淨銷售額為負值或空值時，不定義佔比、CR5 與 HHI，三者顯示為 —。累積曲線也不畫。'
                  : 'When total net sales ≤ 0, or any customer net sales is negative or null, share, CR5, and HHI are undefined and shown as —. The cumulative curve is not drawn.'}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                title={isZh ? '前五大客戶集中度 (CR5)' : 'Top 5 Share (CR5)'}
                value={isConcentrationValid ? fmtPercent(analysis?.cr5) : DASH}
                subValue={analysis?.concentrationStatus || DASH}
                trend="neutral"
                footnote={isZh ? '前 5 名／全體客戶淨銷售' : 'Top 5 / all customer net sales'}
              />
              <KpiCard
                title={isZh ? '赫芬達爾指數 (HHI)' : 'HHI Concentration Index'}
                value={isConcentrationValid ? fmtHHI(analysis?.hhi) : DASH}
                subValue={`${customers.length} ${isZh ? '家客戶' : 'Customers'}`}
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
                value={sharesOk ? fmtPercent(rankedShares[0]?.share) : DASH}
                subValue={rankedShares[0]?.row.key || DASH}
                trend="neutral"
                footnote={rankedShares[0]?.row.label || DASH}
                drillThroughTarget="D06"
              />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="chart-panel bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {isZh ? `淨銷售前 ${topShown} 名` : `Top ${topShown} by net sales`}
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {isZh
                    ? `前 ${topShown} 名／全體 ${customers.length} 家。排序：淨銷售額由高到低，同額依代碼。此圖只比較金額，不把前 10 名當成全體。零軸為基準。`
                    : `Top ${topShown} of ${customers.length} customers by net sales (descending, ties: member code). This panel compares amounts. It does not treat the top 10 as the full population. Zero is the baseline.`}
                </p>
                {topRankRows.length === 0 ? (
                  <p className="py-10 text-xs text-slate-500 dark:text-slate-400">
                    {isZh ? '此切片沒有客戶列。' : 'No customer rows in this slice.'}
                  </p>
                ) : (
                  <EChartsContainer
                    option={topOption}
                    height={chartHeight(topRankRows.length)}
                    onEvents={{
                      click: (params: { componentType?: string; dataIndex?: unknown }) => {
                        if (params?.componentType === 'markLine') return;
                        const index = pointIndex(params);
                        const item = index == null ? undefined : topRankRows[index];
                        if (!item) return;
                        openCustomer(item.row, item.share, item.cumShare);
                      },
                    }}
                  />
                )}
              </div>

              <div className="chart-panel bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {isZh ? '全體客戶累積佔比' : 'Cumulative share, all customers'}
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {sharesOk
                    ? isZh
                      ? `全體 ${rankedShares.length} 家，按淨銷售名次累加。分母 ${fmtUSD(populationTotal, 2)}。虛線為累積佔比，不平滑，也不畫 80% 目標。`
                      : `All ${rankedShares.length} customers, accumulated by net-sales rank. Denominator ${fmtUSD(populationTotal, 2)}. The dashed line is cumulative share, unsmoothed, with no 80% target.`
                    : isZh
                      ? '母體不可用時不畫佔比曲線，避免一條到不了全體的線看起來像 100%。'
                      : 'When the population is unavailable, no share curve is drawn, so a partial line cannot be read as 100%.'}
                </p>
                {sharesOk ? (
                  <EChartsContainer
                    option={shareOption}
                    height="420px"
                    onEvents={{
                      click: (params: { dataIndex?: unknown }) => {
                        const index = pointIndex(params);
                        const item = index == null ? undefined : rankedShares[index];
                        if (!item) return;
                        openCustomer(item.row, item.share, item.cumShare);
                      },
                    }}
                  />
                ) : (
                  <div className="mt-3 flex min-h-[360px] items-center justify-center border border-dashed border-slate-300 px-6 dark:border-slate-600">
                    <p className="max-w-xl text-xs leading-5 text-slate-600 dark:text-slate-300">
                      {isZh
                        ? `累積佔比曲線不可用（${analysis?.concentrationStatus || DASH}）。只有狀態為 available、全體客戶淨銷售合計 > 0，且沒有負值或空值時才畫這條線。此處不畫百分比軸，也不畫 80% 目標。`
                        : `Cumulative share curve unavailable (${analysis?.concentrationStatus || DASH}). The line is drawn only when status is available, all-customer net sales are above zero, and no customer net sales is negative or null. This panel does not draw a percent axis or an 80% target.`}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
                {isZh
                  ? `全體客戶排名與累積佔比（${rankedShares.length} 家）`
                  : `All customers: rank and cumulative share (${rankedShares.length})`}
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
                    {rankedShares.map((item) => (
                      <tr
                        key={item.row.key}
                        onClick={() =>
                          openDrillDown({
                            title: isZh ? `${item.row.key} (${item.row.label}) 產品下鑽` : `${item.row.key} (${item.row.label}) Product Drill-Down`,
                            dimensionName: isZh ? '客戶' : 'Customer',
                            dimensionValue: item.row.key,
                            sourceDashboard: 'D11',
                            groupBy: 'product',
                            filterOverrides: { customer: item.row.key },
                            rows: [],
                          })
                        }
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
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
                    ? `當前切片共 ${customers.length} 家客戶，總淨銷售額 ${fmtUSD(
                        kpis.netSalesUSD
                      )}；前五大客戶集中度 CR5 為 ${fmtPercent(analysis?.cr5)}，HHI 集中度指數為 ${fmtHHI(
                        analysis?.hhi
                      )}。`
                    : `Current slice covers ${customers.length} customers with Total Net Sales ${fmtUSD(
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
                    ? '累積佔比線涵蓋當前切片的全部客戶，分母是全體客戶淨銷售合計。前 10 名橫條不是這條曲線的截斷版。沒有 80% 目標線。'
                    : 'The cumulative share line includes every customer in the slice. Its denominator is total customer net sales. The top-10 bars are not a truncated version of that curve. There is no 80% target line.',
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
