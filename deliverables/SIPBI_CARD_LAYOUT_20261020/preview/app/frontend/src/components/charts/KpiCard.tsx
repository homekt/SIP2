import React from 'react';
import { useApp } from '../../context/AppContext';
import { EChartsContainer } from './EChartsContainer';

interface KpiCardProps {
  title: string;
  value: string | number;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  tone?: 'default' | 'success' | 'warning' | 'danger';
  footnote?: string;
  onClick?: () => void;
  drillThroughTarget?: string;
  drillThroughLabel?: string;
  trendSeries?: { values: Array<number | null>; labels: string[]; caption: string };
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  subValue,
  trend = 'neutral',
  tone = 'default',
  footnote,
  onClick,
  drillThroughTarget,
  drillThroughLabel,
  trendSeries,
}) => {
  const { navigate, lang, theme } = useApp();
  const isZh = lang === 'zh-TW';

  // Direction is supplied explicitly by the page's actual period comparison.
  const effectiveTrend = trend;

  // Keep card surfaces calm and consistent; only subtle border accent when warranted
  const toneClasses = {
    default:
      'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100',
    success:
      'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100',
    warning:
      'border-amber-300/80 dark:border-amber-800/70 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100',
    danger:
      'border-rose-300/80 dark:border-rose-800/70 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100',
  }[tone];

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (drillThroughTarget) {
      navigate(drillThroughTarget);
    }
  };

  const isClickable = Boolean(onClick || drillThroughTarget);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isClickable) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const trendBadgeClasses =
    effectiveTrend === 'up'
      ? 'text-[#0f766e] dark:text-[#2dd4bf] bg-teal-50/80 dark:bg-teal-950/40 border border-teal-200/70 dark:border-teal-800/60 px-1.5 py-0.5 rounded'
      : effectiveTrend === 'down'
      ? 'text-[#be123c] dark:text-[#fb7185] bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200/70 dark:border-rose-800/60 px-1.5 py-0.5 rounded'
      : 'text-slate-600 dark:text-slate-400';

  const trendSymbol =
    effectiveTrend === 'up' ? '▲ ' : effectiveTrend === 'down' ? '▼ ' : '';

  const validSeries = trendSeries && trendSeries.values.length === trendSeries.labels.length &&
    trendSeries.values.length >= 2 && trendSeries.values.some(v => v !== null && Number.isFinite(v));
  const sparkline = validSeries ? {
    animation: false,
    aria: { enabled: true, description: trendSeries.caption },
    grid: { left: 3, right: 4, top: 5, bottom: 4 },
    tooltip: { show: false },
    xAxis: { type: 'category', show: false, data: trendSeries.labels, boundaryGap: false },
    yAxis: { type: 'value', show: false, scale: true },
    series: [{ type: 'line', smooth: false, connectNulls: false, showSymbol: false,
      data: trendSeries.values.map(v => v !== null && Number.isFinite(v) ? v : null),
      lineStyle: { width: 2, color: theme === 'dark' ? '#60a5fa' : '#2563eb' },
      itemStyle: { color: theme === 'dark' ? '#60a5fa' : '#2563eb' } }],
  } : null;

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? handleClick : undefined}
      onKeyDown={isClickable ? handleKeyDown : undefined}
      aria-label={isClickable ? `${title}: ${value}` : undefined}
      className={`kpi-card min-w-0 p-4 border rounded-xl relative flex flex-col justify-between transition-colors duration-150 focus-ring ${toneClasses} ${
        isClickable
          ? 'cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-slate-50/60 dark:hover:bg-slate-800/50 group select-none'
          : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 leading-snug">
          {title}
        </div>
        {isClickable && (
          <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 opacity-80 group-hover:opacity-100 group-focus-visible:opacity-100 shrink-0 transition-opacity">
            {drillThroughLabel ||
              (drillThroughTarget
                ? `${drillThroughTarget} ➔`
                : isZh
                ? '下鑽 ➔'
                : 'Drill ➔')}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-2 flex-wrap">
        <div className="kpi-value font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
          {value}
        </div>
        {subValue && (
          <span className={`text-xs font-semibold tabular-nums font-mono ${trendBadgeClasses}`}>
            {trendSymbol}
            {subValue}
          </span>
        )}
      </div>

      {sparkline && trendSeries && (
        <div className="kpi-sparkline mt-2 pt-2 border-t border-slate-100 dark:border-slate-800" aria-label={trendSeries.caption}>
          <EChartsContainer option={sparkline} height="42px" />
          <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{trendSeries.caption}</p>
        </div>
      )}

      {footnote && (
        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 leading-tight truncate" title={footnote}>
          {footnote}
        </p>
      )}
    </div>
  );
};
