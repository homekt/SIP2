import React from 'react';
import { useApp } from '../../context/AppContext';

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
}) => {
  const { navigate, lang } = useApp();
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

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? handleClick : undefined}
      onKeyDown={isClickable ? handleKeyDown : undefined}
      aria-label={isClickable ? `${title}: ${value}` : undefined}
      className={`p-3.5 border rounded-lg shadow-2xs relative flex flex-col justify-between transition-colors duration-150 focus-ring ${toneClasses} ${
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
        <div className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums font-mono">
          {value}
        </div>
        {subValue && (
          <span className={`text-xs font-semibold tabular-nums font-mono ${trendBadgeClasses}`}>
            {trendSymbol}
            {subValue}
          </span>
        )}
      </div>

      {footnote && (
        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 leading-tight truncate" title={footnote}>
          {footnote}
        </p>
      )}
    </div>
  );
};
