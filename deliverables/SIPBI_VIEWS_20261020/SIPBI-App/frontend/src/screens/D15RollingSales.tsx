import React, { useMemo } from 'react';
import { enrichMonthly } from '../utils/salesMath';
import { Filters } from '../types/sales';
import { useSalesDashboard } from '../services/salesApi';
import { StateGuard } from '../components/common/StateGuard';
import { KpiCard } from '../components/charts/KpiCard';
import { EChartsContainer } from '../components/charts/EChartsContainer';
import { AiInsightCard } from '../components/ai/AiInsightCard';
import { useApp } from '../context/AppContext';
import { getFilterSummaryLabels } from '../utils/slicerData';
import {
  exportSalesRowsCsv,
  fmtCount,
  fmtKG,
  fmtPercent,
  fmtSignedPercent,
  fmtUSD,
} from '../utils/salesFormat';

interface Props {
  slicer: Filters;
}

export const D15RollingSales: React.FC<Props> = ({ slicer }) => {
  const { theme, lang, navigate, metadata, setLastDashboardContext } = useApp();
  const isDark = theme === 'dark';
  const isZh = lang === 'zh-TW';

  const { phase, data, error, reload } = useSalesDashboard('D15', slicer, setLastDashboardContext);
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
  const monthly = data?.datasets?.monthly || [];

  // Strictly preserve enrichMonthly calculation and time-gap behavior
  const enrichedMonthly = useMemo(() => enrichMonthly(monthly), [monthly]);

  const salesColor = '#4f46e5';
  const gpColor = isDark ? '#2dd4bf' : '#0f766e';
  const attentionColor = isDark ? '#f59e0b' : '#b45309';
  const axisLabelColor = isDark ? '#cbd5e1' : '#334155';
  const axisSubColor = isDark ? '#94a3b8' : '#64748b';
  const splitLineColor = isDark ? '#1e293b' : '#f1f5f9';

  const monthKeys = useMemo(() => enrichedMonthly.map((m) => m.row.key), [enrichedMonthly]);

  const formatSmallMultipleTooltip = (params: any[]) => {
    const idx = params?.[0]?.dataIndex;
    const item = typeof idx === 'number' ? enrichedMonthly[idx] : undefined;
    if (!item) return '';
    const { row, r3Val, r12Val, ytdVal } = item;
    return [
      `<strong>${row.label || row.key} (${row.key})</strong>`,
      `${isZh ? '當月淨銷售額 (Monthly)' : 'Monthly Net Sales'}: <strong>${fmtUSD(
        row.netSalesUSD
      )}</strong>`,
      `${isZh ? '近 3 月滾動總和 (R3M Sum)' : 'R3M Rolling Sum'}: <strong>${fmtUSD(r3Val)}</strong>`,
      `${isZh ? '近 12 月滾動總和 (R12M Sum)' : 'R12M Rolling Sum'}: <strong>${fmtUSD(
        r12Val
      )}</strong>`,
      `${isZh ? '年初至今累計 (YTD · 1月重設)' : 'YTD Sum (Jan Reset)'}: <strong>${fmtUSD(
        ytdVal
      )}</strong>`,
    ].join('<br/>');
  };

  const makeSmallMultipleOption = (config: {
    seriesName: string;
    values: Array<number | null>;
    color: string;
    symbol: string;
    lineType?: 'solid' | 'dashed';
    yAxisName: string;
  }) => ({
    tooltip: {
      trigger: 'axis',
      formatter: formatSmallMultipleTooltip,
    },
    grid: { left: 12, right: 16, bottom: 10, top: 28, containLabel: true },
    xAxis: {
      type: 'category',
      data: monthKeys,
      axisLabel: {
        color: axisLabelColor,
        fontSize: 11,
        rotate: 0,
        hideOverlap: true,
      },
      axisTick: { alignWithLabel: true },
    },
    yAxis: {
      type: 'value',
      name: config.yAxisName,
      nameTextStyle: { color: axisSubColor, fontSize: 11 },
      axisLabel: {
        color: axisSubColor,
        fontSize: 11,
        formatter: (v: number) =>
          Math.abs(v) >= 1_000_000
            ? `$${(v / 1_000_000).toFixed(1)}M`
            : `$${(v / 1000).toFixed(0)}k`,
      },
      splitLine: { lineStyle: { color: splitLineColor } },
    },
    series: [
      {
        name: config.seriesName,
        type: 'line',
        smooth: false,
        connectNulls: false,
        symbol: config.symbol,
        symbolSize: 6,
        data: config.values,
        itemStyle: { color: config.color },
        lineStyle: {
          width: 2.5,
          type: config.lineType || 'solid',
          color: config.color,
        },
      },
    ],
  });

  const monthlyPanelOption = makeSmallMultipleOption({
    seriesName: isZh ? '當月淨銷售額 (Monthly USD)' : 'Monthly Net Sales (USD)',
    values: enrichedMonthly.map((m) => m.row.netSalesUSD),
    color: salesColor,
    symbol: 'circle',
    yAxisName: 'USD (1M)',
  });

  const r3mPanelOption = makeSmallMultipleOption({
    seriesName: isZh ? '近 3 月滾動總和 (R3M Sum USD)' : 'Rolling 3M Sum (USD)',
    values: enrichedMonthly.map((m) => m.r3Val),
    color: gpColor,
    symbol: 'diamond',
    yAxisName: 'USD (R3M Sum)',
  });

  const r12mPanelOption = makeSmallMultipleOption({
    seriesName: isZh ? '近 12 月滾動總和 (R12M Sum USD)' : 'Rolling 12M Sum (USD)',
    values: enrichedMonthly.map((m) => m.r12Val),
    color: salesColor,
    symbol: 'rect',
    yAxisName: 'USD (R12M Sum)',
  });

  const ytdPanelOption = makeSmallMultipleOption({
    seriesName: isZh ? '年初至今累計 (YTD Sum USD · 1月重設)' : 'YTD Sum (USD · Resets in Jan)',
    values: enrichedMonthly.map((m) => m.ytdVal),
    color: attentionColor,
    symbol: 'triangle',
    yAxisName: 'USD (YTD)',
  });

  const handlePanelMonthClick = (params: any) => {
    const item = enrichedMonthly[params.dataIndex];
    if (item) {
      navigate('D15', { month: item.row.key });
    }
  };

  return (
    <div className="sales-dashboard">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {isZh ? 'D15 累計與滾動銷售 (Rolling Sales)' : 'D15 Rolling Sales'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isZh
              ? '四宮格獨立尺度檢視：當月淨銷售額 (Monthly)、近 3 月滾動總和 (R3M Sum)、近 12 月滾動總和 (R12M Sum) 與年初至今累計 (YTD，每年 1 月重設)'
              : 'Four Small Multiples with independent USD scales: Monthly, Rolling 3M Sum, Rolling 12M Sum, and YTD Sum (resets in January)'}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() =>
              exportSalesRowsCsv(`D15_Rolling_${slicer.company}.csv`, monthly, 'MonthKey')
            }
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 cursor-pointer"
          >
            {isZh ? '📥 匯出月度序列 CSV' : '📥 Export Monthly CSV'}
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
            {/* 4 Primary KPI Cards (Placed before charts and long text summary) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <KpiCard
                title={isZh ? '當期淨銷售額 (Monthly)' : 'Current Net Sales'}
                value={fmtUSD(kpis.netSalesUSD)}
                subValue={`YoY: ${fmtSignedPercent(analysis?.yoyGrowth)}`}
                trend={
                  analysis?.yoyGrowth !== null && analysis?.yoyGrowth !== undefined
                    ? analysis.yoyGrowth > 0
                      ? 'up'
                      : analysis.yoyGrowth < 0
                      ? 'down'
                      : 'neutral'
                    : 'neutral'
                }
                footnote={summaryLabels.monthLabel}
              />
              <KpiCard
                title={isZh ? '近 3 個月滾動總和 (R3M Sum)' : 'Rolling 3M Sum'}
                value={fmtUSD(analysis?.rolling3NetSalesUSD)}
                subValue={isZh ? '3 個完整月總和' : '3-Month Rolling Sum'}
                trend="neutral"
                footnote={
                  isZh ? '含當月前推 3 個完整連續月' : '3 complete months ending selected'
                }
              />
              <KpiCard
                title={isZh ? '近 12 個月滾動總和 (R12M Sum)' : 'Rolling 12M Sum'}
                value={fmtUSD(analysis?.rolling12NetSalesUSD)}
                subValue={isZh ? '12 個完整月總和' : '12-Month Rolling Sum'}
                trend="neutral"
                footnote={
                  isZh ? '含當月前推 12 個完整連續月' : '12 complete months ending selected'
                }
              />
              <KpiCard
                title={isZh ? '年初至今累計 (YTD Sum)' : 'YTD Net Sales Sum'}
                value={fmtUSD(analysis?.ytdNetSalesUSD)}
                subValue={analysis?.historyStatus || '—'}
                trend="neutral"
                tone="default"
                footnote={
                  isZh
                    ? '每年 1 月重設歸零 (Jan .. Selected Month)'
                    : 'Resets in January (Jan .. Selected Month)'
                }
              />
            </div>

            {/* Scale & Window Rule Banner */}
            <div className="bg-slate-100/80 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2 text-xs text-slate-700 dark:text-slate-300 flex flex-wrap items-center justify-between gap-2">
              <div>
                <strong className="font-semibold text-slate-900 dark:text-white">
                  {isZh ? '尺度與視窗說明：' : 'Scale & Window Rules: '}
                </strong>
                {isZh
                  ? '下方四個小型序列面板各自採用獨立 USD 座標軸尺度（Independent USD Scales），分別呈現單月、3 個月總和、12 個月總和與年度累計；YTD 於每年 1 月重設（Resets in January），未滿滾動期數之起算月份保留為空白斷點 (Gaps)。'
                  : 'All four small-multiple panels use independent USD scales (Monthly, R3M Sum, R12M Sum, YTD Sum). YTD resets every January; incomplete initial windows remain gaps without averaging or extrapolation.'}
              </div>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                {isZh ? '點擊任一月份切換焦點月份' : 'Click any month point to focus'}
              </span>
            </div>

            {/* Four Small Multiples Grid: Monthly / R3M Sum / R12M Sum / YTD */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 1. Monthly Net Sales */}
              <div className="chart-panel">
                <div className="chart-panel-header">
                  <div>
                    <h3 className="chart-panel-title">
                      {isZh
                        ? '1. 當月淨銷售額 (Monthly Net Sales · 獨立 USD 尺度)'
                        : '1. Monthly Net Sales (Independent USD Scale)'}
                    </h3>
                    <p className="chart-panel-subtitle">
                      {isZh
                        ? '單一發票月份實際淨銷售額 · 未平滑折線 (1 個月量級)'
                        : 'Single invoice-month Net Sales · Unsmoothed line (1-month scale)'}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    Monthly · USD
                  </span>
                </div>
                <EChartsContainer
                  option={monthlyPanelOption}
                  height="220px"
                  onEvents={{ click: handlePanelMonthClick }}
                />
              </div>

              {/* 2. R3M Rolling Sum */}
              <div className="chart-panel">
                <div className="chart-panel-header">
                  <div>
                    <h3 className="chart-panel-title">
                      {isZh
                        ? '2. 近 3 個月滾動總和 (R3M Sum · 獨立 USD 尺度)'
                        : '2. Rolling 3-Month Sum (R3M Sum · Independent USD Scale)'}
                    </h3>
                    <p className="chart-panel-subtitle">
                      {isZh
                        ? '含當月前推 3 個完整連續月總和 · 序列前 2 個月未滿視窗保留空白斷點 (Gaps)'
                        : '3-month rolling sum · First 2 months shown as gaps (incomplete window)'}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-teal-50 dark:bg-teal-950/60 text-[#0f766e] dark:text-[#2dd4bf] border border-teal-200 dark:border-teal-800">
                    R3M Sum · USD
                  </span>
                </div>
                <EChartsContainer
                  option={r3mPanelOption}
                  height="220px"
                  onEvents={{ click: handlePanelMonthClick }}
                />
              </div>

              {/* 3. R12M Rolling Sum */}
              <div className="chart-panel">
                <div className="chart-panel-header">
                  <div>
                    <h3 className="chart-panel-title">
                      {isZh
                        ? '3. 近 12 個月滾動總和 (R12M Sum · 獨立 USD 尺度)'
                        : '3. Rolling 12-Month Sum (R12M Sum · Independent USD Scale)'}
                    </h3>
                    <p className="chart-panel-subtitle">
                      {isZh
                        ? '含當月前推 12 個完整連續月總和 · 序列前 11 個月未滿視窗保留空白斷點 (Gaps)'
                        : '12-month rolling sum · First 11 months shown as gaps (incomplete window)'}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    R12M Sum · USD
                  </span>
                </div>
                <EChartsContainer
                  option={r12mPanelOption}
                  height="220px"
                  onEvents={{ click: handlePanelMonthClick }}
                />
              </div>

              {/* 4. YTD Cumulative Sum */}
              <div className="chart-panel">
                <div className="chart-panel-header">
                  <div>
                    <h3 className="chart-panel-title">
                      {isZh
                        ? '4. 年初至今累計 (YTD Sum · 每年 1 月重設 · 獨立 USD 尺度)'
                        : '4. Year-to-Date Sum (YTD · Resets in January · Independent USD Scale)'}
                    </h3>
                    <p className="chart-panel-subtitle">
                      {isZh
                        ? '同曆年 01 月至當月累計總和 · 每年 1 月重設歸零起算 (Resets every January)'
                        : 'Cumulative sum from Jan through month · Resets every January'}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-50 dark:bg-amber-950/60 text-[#b45309] dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    YTD (Jan Reset) · USD
                  </span>
                </div>
                <EChartsContainer
                  option={ytdPanelOption}
                  height="220px"
                  onEvents={{ click: handlePanelMonthClick }}
                />
              </div>
            </div>

            {/* Full Monthly & Rolling Series Table */}
            <div className="chart-panel">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="chart-panel-title">
                    {isZh
                      ? `月度銷售、毛利與滾動序列明細表 (共 ${enrichedMonthly.length} 個完整月份)`
                      : `Monthly Sales, Margin & Rolling Series Table (${enrichedMonthly.length} Months)`}
                  </h3>
                  <p className="chart-panel-subtitle">
                    {isZh
                      ? '完整月度序列與 R3M / R12M / YTD 數值 · 缺漏視窗顯示為 —'
                      : 'Full monthly rows with R3M / R12M / YTD values · Incomplete windows shown as —'}
                  </p>
                </div>
              </div>
              <div className="sales-table-wrap max-h-96 overflow-y-auto">
                <table className="sales-table divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/90 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '發票月份' : 'Invoice Month'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '當月淨銷售額 (1M)' : 'Monthly Sales'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '近 3 月總和 (R3M)' : 'R3M Sum'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '近 12 月總和 (R12M)' : 'R12M Sum'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '年度累計 (YTD · 1月重設)' : 'YTD (Jan Reset)'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '當月毛利額' : 'Gross Profit'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '毛利率' : 'GM %'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '淨銷量 (KG)' : 'Net Qty (KG)'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '訂單數 / 行數' : 'Orders / Lines'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                    {enrichedMonthly.map(({ row: m, r3Val, r12Val, ytdVal }) => (
                      <tr
                        key={m.key}
                        onClick={() => navigate('D15', { month: m.key })}
                        className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors ${
                          m.key === slicer.month ? 'bg-indigo-50/60 dark:bg-indigo-950/30' : ''
                        }`}
                      >
                        <td className="px-3 py-2 font-bold text-indigo-600 dark:text-indigo-400">
                          {m.label ? `${m.label} (${m.key})` : m.key}
                        </td>
                        <td className="px-3 py-2 text-right font-bold">{fmtUSD(m.netSalesUSD)}</td>
                        <td className="px-3 py-2 text-right">{fmtUSD(r3Val)}</td>
                        <td className="px-3 py-2 text-right">{fmtUSD(r12Val)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{fmtUSD(ytdVal)}</td>
                        <td className="px-3 py-2 text-right text-[#0f766e] dark:text-[#2dd4bf]">
                          {fmtUSD(m.grossProfitUSD)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">
                          {fmtPercent(m.grossMarginPercent)}
                        </td>
                        <td className="px-3 py-2 text-right">{fmtKG(m.netQtyKG)}</td>
                        <td className="px-3 py-2 text-right">
                          {fmtCount(m.orderCount)} / {fmtCount(m.salesLineCount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Compact Summary & Evidence Receipt below KPIs, Small Multiples & Table */}
            <AiInsightCard
              title={isZh ? 'D15 累計與滾動銷售證據說明' : 'D15 Cumulative & Rolling Sales Summary'}
              data={{
                observed: isZh
                  ? `於 ${summaryLabels.monthLabel} (${summaryLabels.companyLabel})，當期淨銷售額為 ${fmtUSD(
                      kpis.netSalesUSD
                    )}，年初至今累計 (YTD) 為 ${fmtUSD(
                      analysis?.ytdNetSalesUSD
                    )}，近 3 個月滾動 (R3M) 為 ${fmtUSD(
                      analysis?.rolling3NetSalesUSD
                    )}，近 12 個月滾動 (R12M) 為 ${fmtUSD(analysis?.rolling12NetSalesUSD)}。`
                  : `For ${summaryLabels.monthLabel} (${summaryLabels.companyLabel}), Current Net Sales is ${fmtUSD(
                      kpis.netSalesUSD
                    )}, YTD is ${fmtUSD(analysis?.ytdNetSalesUSD)}, Rolling 3M is ${fmtUSD(
                      analysis?.rolling3NetSalesUSD
                    )}, and Rolling 12M is ${fmtUSD(analysis?.rolling12NetSalesUSD)}.`,
                interpretation: isZh
                  ? `歷史比較狀態為 ${analysis?.historyStatus}。當滾動視窗超出資料覆蓋範圍 (202401..202609) 或月份為 All 時，系統嚴格回傳 null（顯示為 —），不進行人工外推。`
                  : `History status is ${analysis?.historyStatus}. Any window extending outside 202401..202609 coverage or with month=All returns null (—) without extrapolation.`,
                claimType: 'ARITHMETIC_CONTRIBUTION',
                coverage: `${summaryLabels.monthLabel} · ${summaryLabels.companyLabel}`,
                confidence: 'SSAS Direct',
                evidenceId: data?.evidence?.requestId || 'D15',
                evidence: data?.evidence,
                source: data?.source,
                limitations: [
                  isZh
                    ? 'YTD 為當年度 01 月至所選發票月份之累計（每年 1 月重設）；R3M 與 R12M 為以所選月份為終點之完整 3 個月與 12 個月滾動總和，四面板採用各自獨立之 USD 座標軸尺度'
                    : 'YTD sums Jan..selected month (resets every January); R3M and R12M sum the 3 and 12 complete months ending on the selected month across independent USD scales',
                ],
                nextSteps: [
                  isZh ? '進入 D02 檢視同期 YoY 銷售動能' : 'Go to D02 Sales Momentum',
                  isZh ? '進入 D16 檢視成長與衰退產品瀑布' : 'Go to D16 Growth Contribution',
                ],
              }}
            />
          </>
        )}
      </StateGuard>
    </div>
  );
};

export default D15RollingSales;
