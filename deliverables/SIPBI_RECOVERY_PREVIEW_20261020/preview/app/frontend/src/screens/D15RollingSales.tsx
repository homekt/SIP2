import React, { useCallback, useMemo, useState } from 'react';
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

type Mode = 'monthly' | 'r3' | 'r12' | 'ytd';

const MODE_ORDER: Mode[] = ['monthly', 'r3', 'r12', 'ytd'];

const escapeHtml = (s: string | null | undefined): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

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

  // Single selected series for the primary workspace. Language-independent key
  // so the choice survives theme/language switches.
  const [mode, setMode] = useState<Mode>('monthly');

  const summaryLabels = getFilterSummaryLabels(slicer, metadata, isZh);
  const kpis = data?.kpis;
  const analysis = data?.analysis;
  const monthly = data?.datasets?.monthly || [];

  // Strictly preserve enrichMonthly calculation and time-gap behavior
  const enrichedMonthly = useMemo(() => enrichMonthly(monthly), [monthly]);

  const barColor = '#4f46e5';
  const barSelectedColor = '#6366f1';
  const r3Color = isDark ? '#2dd4bf' : '#0f766e';
  const r12Color = '#8b5cf6';
  const ytdColor = isDark ? '#f59e0b' : '#b45309';
  const axisLabelColor = isDark ? '#cbd5e1' : '#334155';
  const axisSubColor = isDark ? '#94a3b8' : '#64748b';
  const splitLineColor = isDark ? '#1e293b' : '#f1f5f9';
  const guideColor = isDark ? '#334155' : '#cbd5e1';

  const monthKeys = useMemo(() => enrichedMonthly.map((m) => m.row.key), [enrichedMonthly]);

  const selectedIdx = useMemo(
    () => enrichedMonthly.findIndex((m) => m.row.key === slicer.month),
    [enrichedMonthly, slicer.month]
  );

  const janKeys = useMemo(
    () => monthKeys.filter((k, i) => i > 0 && k.endsWith('01')),
    [monthKeys]
  );

  const years = useMemo(
    () => Array.from(new Set(monthKeys.map((k) => k.slice(0, 4)))),
    [monthKeys]
  );

  const coverageLabel =
    monthKeys.length > 0
      ? `${monthKeys[0]}–${monthKeys[monthKeys.length - 1]} · ${monthKeys.length}`
      : '202401–202609 · 33';

  const modeMeta = useMemo(
    () => ({
      monthly: {
        button: isZh ? '當月' : 'Monthly',
        seriesName: isZh ? '當月淨銷售額 (Monthly USD)' : 'Monthly Net Sales (USD)',
        badge: 'Monthly · USD',
        title: isZh ? '當月淨銷售額 · USD' : 'Monthly Net Sales · USD',
        color: barColor,
      },
      r3: {
        button: isZh ? '近 3 月' : 'R3M Sum',
        seriesName: isZh ? '近 3 月滾動總和 (R3M Sum USD)' : 'Rolling 3M Sum (USD)',
        badge: 'R3M Sum · USD',
        title: isZh ? '近 3 月滾動總和 · USD' : 'Rolling 3M Sum · USD',
        color: r3Color,
      },
      r12: {
        button: isZh ? '近 12 月' : 'R12M Sum',
        seriesName: isZh ? '近 12 月滾動總和 (R12M Sum USD)' : 'Rolling 12M Sum (USD)',
        badge: 'R12M Sum · USD',
        title: isZh ? '近 12 月滾動總和 · USD' : 'Rolling 12M Sum · USD',
        color: r12Color,
      },
      ytd: {
        button: isZh ? '年累計' : 'YTD',
        seriesName: isZh ? '年初至今累計 (YTD · 每年 1 月重設)' : 'YTD Sum (Resets in Jan)',
        badge: 'YTD (Jan Reset) · USD',
        title: isZh ? '年初至今累計 · USD' : 'Year-to-Date Sum · USD',
        color: ytdColor,
      },
    }),
    [isZh, isDark]
  );

  const formatWorkspaceTooltip = useCallback(
    (params: any) => {
      const list = Array.isArray(params) ? params : [params];
      const idx = list[0]?.dataIndex;
      if (typeof idx !== 'number') return '';
      const item = enrichedMonthly[idx];
      if (!item) return '';
      const { row, r3Val, r12Val, ytdVal } = item;
      const head = `<strong>${escapeHtml(row.label || row.key)} (${escapeHtml(row.key)})</strong>`;
      const line = (label: string, v: number | null) =>
        `${escapeHtml(label)}: <strong>${escapeHtml(fmtUSD(v))}</strong>`;
      const modeLine =
        mode === 'monthly'
          ? line(isZh ? '當月淨銷售額' : 'Monthly Net Sales', row.netSalesUSD)
          : mode === 'r3'
          ? line(isZh ? '近 3 月總和 (R3M)' : 'R3M Sum', r3Val)
          : mode === 'r12'
          ? line(isZh ? '近 12 月總和 (R12M)' : 'R12M Sum', r12Val)
          : line(isZh ? '年度累計 (YTD · 1 月重設)' : 'YTD (Jan Reset)', ytdVal);
      const ctx =
        mode === 'monthly'
          ? ''
          : `<br/>${line(isZh ? '當月淨銷售額' : 'Monthly', row.netSalesUSD)}`;
      return `${head}<br/>${modeLine}${ctx}`;
    },
    [enrichedMonthly, mode, isZh]
  );

  const chartOption = useMemo(() => {
    const meta = modeMeta[mode];
    const selectedKey = selectedIdx >= 0 ? monthKeys[selectedIdx] : null;
    const janGuides = janKeys.map((k) => ({ xAxis: k }));
    const janMarkLine = janGuides.length
      ? {
          silent: true,
          symbol: 'none',
          lineStyle: { color: guideColor, type: 'dashed', width: 1 },
          label: { show: false },
          data: janGuides,
        }
      : undefined;
    const selectedMarkArea =
      selectedKey !== null
        ? {
            silent: true,
            itemStyle: {
              color: isDark ? 'rgba(99,102,241,0.12)' : 'rgba(79,70,229,0.08)',
            },
            data: [[{ xAxis: selectedKey }, { xAxis: selectedKey }]],
          }
        : undefined;

    let series: any[];
    if (mode === 'monthly') {
      series = [
        {
          name: meta.seriesName,
          type: 'bar',
          data: enrichedMonthly.map((m, i) => ({
            value: m.row.netSalesUSD,
            itemStyle: {
              color: i === selectedIdx ? barSelectedColor : meta.color,
              borderRadius: [3, 3, 0, 0],
              ...(i === selectedIdx
                ? { borderColor: isDark ? '#c7d2fe' : '#312e81', borderWidth: 1.5 }
                : {}),
            },
          })),
          itemStyle: { color: meta.color },
          markLine: janMarkLine,
          markArea: selectedMarkArea,
        },
      ];
    } else if (mode === 'ytd') {
      // One trace per calendar year under a shared legend entry so the line
      // never connects December into the January reset.
      series = years.map((year, yi) => {
        const yearData = enrichedMonthly.map((m) =>
          m.row.key.startsWith(year) ? m.ytdVal : null
        );
        const selVal =
          selectedIdx >= 0 && enrichedMonthly[selectedIdx].row.key.startsWith(year)
            ? enrichedMonthly[selectedIdx].ytdVal
            : null;
        return {
          name: meta.seriesName,
          type: 'line',
          smooth: false,
          connectNulls: false,
          symbol: 'triangle',
          symbolSize: 6,
          data: yearData,
          itemStyle: { color: meta.color },
          lineStyle: { width: 2.5, color: meta.color },
          emphasis: { focus: 'series' },
          markPoint:
            selectedKey !== null && selVal !== null
              ? { silent: true, symbol: 'circle', symbolSize: 11,
                  label: { show: false },
                  itemStyle: { color: meta.color, borderColor: isDark ? '#f8fafc' : '#0f172a', borderWidth: 2 },
                  data: [{ coord: [selectedKey, selVal] }] }
              : undefined,
          ...(yi === 0
            ? {
                markLine: janMarkLine,
                markArea: selectedMarkArea,
              }
            : {}),
        };
      });
    } else {
      const values = enrichedMonthly.map((m) => (mode === 'r3' ? m.r3Val : m.r12Val));
      const selVal = selectedIdx >= 0 ? values[selectedIdx] : null;
      series = [
        {
          name: meta.seriesName,
          type: 'line',
          smooth: false,
          connectNulls: false,
          symbol: mode === 'r3' ? 'diamond' : 'rect',
          symbolSize: 6,
          data: values,
          itemStyle: { color: meta.color },
          lineStyle: { width: 2.5, color: meta.color },
          emphasis: { focus: 'series' },
          markLine: janMarkLine,
          markArea: selectedMarkArea,
          markPoint:
            selectedKey !== null && selVal !== null
              ? {
                  silent: true,
                symbol: 'circle',
                symbolSize: 11,
                label: { show: false },
                itemStyle: { color: meta.color, borderColor: isDark ? '#f8fafc' : '#0f172a', borderWidth: 2 },
                  data: [{ coord: [selectedKey, selVal] }],
                }
              : undefined,
        },
      ];
    }

    return {
      aria: { enabled: true, description: `${meta.title}. ${coverageLabel}. ${summaryLabels.companyLabel}` },
      tooltip: {
        trigger: 'axis',
        confine: true,
        formatter: formatWorkspaceTooltip,
      },
      legend: {
        bottom: 0,
        textStyle: { color: axisLabelColor, fontSize: 12 },
        data: [meta.seriesName],
      },
      grid: { left: 12, right: 16, bottom: 28, top: 28, containLabel: true },
      xAxis: {
        type: 'category',
        data: monthKeys,
        axisLabel: {
          color: axisLabelColor,
          fontSize: 12,
          rotate: 0,
          formatter: (key: string) => `${key.slice(2, 4)}/${key.slice(4, 6)}`,
          hideOverlap: true,
        },
        axisTick: { alignWithLabel: true },
      },
      yAxis: {
        type: 'value',
        name: 'USD',
        nameTextStyle: { color: axisSubColor, fontSize: 11 },
        axisLabel: {
          color: axisSubColor,
          fontSize: 12,
          formatter: (v: number) =>
            Math.abs(v) >= 1_000_000
              ? `$${(v / 1_000_000).toFixed(1)}M`
              : `$${(v / 1000).toFixed(0)}k`,
        },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      series,
    };
  }, [
    mode,
    modeMeta,
    enrichedMonthly,
    monthKeys,
    selectedIdx,
    janKeys,
    years,
    coverageLabel,
    summaryLabels.companyLabel,
    isDark,
    isZh,
    axisLabelColor,
    axisSubColor,
    splitLineColor,
    guideColor,
    formatWorkspaceTooltip,
  ]);

  const handleMonthClick = useCallback(
    (params: any) => {
      const item = enrichedMonthly[params.dataIndex];
      if (item) {
        navigate('D15', { month: item.row.key });
      }
    },
    [enrichedMonthly, navigate]
  );

  const chartEvents = useMemo(() => ({ click: handleMonthClick }), [handleMonthClick]);

  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent, key: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigate('D15', { month: key });
      }
    },
    [navigate]
  );

  return (
    <div className="sales-dashboard">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {isZh ? 'D15 累計與滾動銷售 (Rolling Sales)' : 'D15 Rolling Sales'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isZh
              ? `發票日期 · 202401–202609 共 33 個完整月 · USD / KG · ${summaryLabels.companyLabel}`
              : `Invoice Date · 33 complete months 202401–202609 · USD / KG · ${summaryLabels.companyLabel}`}
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
                subValue={analysis?.ytdNetSalesUSD == null ? (isZh ? '資料不足' : 'Insufficient history') : (isZh ? '完整月份' : 'Complete months')}
                trend="neutral"
                tone="default"
                footnote={
                  isZh
                    ? '每年 1 月重設歸零 (Jan .. Selected Month)'
                    : 'Resets in January (Jan .. Selected Month)'
                }
              />
            </div>

            {/* Single primary time-series workspace */}
            <div className="chart-panel">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div
                  role="group"
                  aria-label={isZh ? '選擇時間序列模式' : 'Select time-series mode'}
                  className="flex flex-wrap gap-1.5"
                >
                  {MODE_ORDER.map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={mode === m}
                      onClick={() => setMode(m)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                        mode === m
                          ? 'bg-indigo-600 dark:bg-indigo-500 text-white border-indigo-600 dark:border-indigo-500'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {modeMeta[m].button}
                    </button>
                  ))}
                </div>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  {modeMeta[mode].badge}
                </span>
              </div>
              <p className="chart-panel-subtitle mb-2">
                {isZh
                  ? 'R3M＝含當月共 3 個完整月總和 · R12M＝12 個完整月總和 · YTD＝當年 1 月至當月累計（每年 1 月重設）· 未滿視窗為空白斷點'
                  : 'R3M = 3 complete months ending here · R12M = 12 months · YTD = Jan→month, resets each January · Incomplete windows stay gaps (—).'}
              </p>
              <h3 className="chart-panel-title">{modeMeta[mode].title}</h3>
              <p className="chart-panel-subtitle mb-2">
                {isZh ? `發票月份 ${coverageLabel} 個完整月` : `Invoice months ${coverageLabel} complete months`}
                {` · ${summaryLabels.companyLabel}`}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 sm:hidden mb-2">
                {isZh ? '左右捲動圖表可查看全部月份。' : 'Scroll the chart horizontally to view all months.'}
              </p>
              <div className="overflow-x-auto">
                <div className="min-w-[680px]">
                  <EChartsContainer
                    option={chartOption}
                    height="340px"
                    onEvents={chartEvents}
                  />
                </div>
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {isZh ? '點擊任一月份切換焦點月份' : 'Click any month point to focus'}
              </p>
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
                        tabIndex={0}
                        onClick={() => navigate('D15', { month: m.key })}
                        onKeyDown={(e) => handleRowKeyDown(e, m.key)}
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

            {/* Compact Summary & Evidence Receipt below KPIs, Workspace & Table */}
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
                    ? 'YTD 為當年度 01 月至所選發票月份之累計（每年 1 月重設）；R3M 與 R12M 為以所選月份為終點之完整 3 個月與 12 個月滾動總和，單一主圖採單一 USD 座標軸一次呈現一種序列'
                    : 'YTD sums Jan..selected month (resets every January); R3M and R12M sum the 3 and 12 complete months ending on the selected month; the single workspace shows one series on one USD axis at a time',
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
