import React, { useEffect, useRef, useId } from 'react';
import * as echarts from 'echarts';
import { useApp } from '../../context/AppContext';

interface EChartsContainerProps {
  option: any;
  style?: React.CSSProperties;
  className?: string;
  height?: string;
  onEvents?: Record<string, (params: any) => void>;
}

export const EChartsContainer: React.FC<EChartsContainerProps> = ({ option, style, className, height, onEvents }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const { theme } = useApp();
  const isDark = theme === 'dark';
  const captionId = useId();
  const title = !Array.isArray(option.title) ? option.title : undefined;

  // Re-init chart when theme switches between light and dark
  useEffect(() => {
    if (!chartRef.current) return;

    if (chartInstance.current) {
      chartInstance.current.dispose();
      chartInstance.current = null;
    }

    // Use devicePixelRatio (minimum 2x for Retina / HiDPI / Windows display scaling)
    const dpr = typeof window !== 'undefined' ? Math.max(window.devicePixelRatio || 1, 2) : 2;

    chartInstance.current = echarts.init(chartRef.current, isDark ? 'dark' : undefined, {
      renderer: 'canvas',
      devicePixelRatio: dpr
    });

    const themedOption = {
      ...option,
      // DOM captions wrap naturally and remain readable outside the canvas.
      title: title ? { ...title, show: false } : option.title,
      grid: title && option.grid && !Array.isArray(option.grid)
        ? { ...option.grid, top: 40 }
        : option.grid,
      tooltip: { ...option.tooltip, confine: true },
      aria: { enabled: true, description: title ? `${title.text}. ${title.subtext || ''}` : undefined, ...option.aria },
      backgroundColor: 'transparent'
    };

    chartInstance.current.setOption(themedOption, true);

    // Leave room for the plotted bars on narrow ranking cards. Restore the
    // authored label widths and tick density when the container widens again.
    const fitRankingAxes = () => {
      const axesY = Array.isArray(option.yAxis) ? option.yAxis : [option.yAxis];
      if (!axesY.some((axis: any) => axis?.type === 'category')) return;
      const axesX = Array.isArray(option.xAxis) ? option.xAxis : [option.xAxis];
      const width = chartRef.current?.clientWidth || 600;
      const narrow = width < 480;
      chartInstance.current?.setOption({
        xAxis: axesX.map((axis: any) => axis?.type === 'value'
          ? { ...axis, name: '', splitNumber: narrow ? 2 : (axis.splitNumber || 4) }
          : axis),
        yAxis: axesY.map((axis: any) => axis?.type === 'category'
          ? { ...axis, axisLabel: { ...axis.axisLabel,
              width: narrow ? Math.min(axis.axisLabel?.width || 180, 110) : (axis.axisLabel?.width ?? null),
              overflow: narrow ? 'truncate' : (axis.axisLabel?.overflow ?? null) } }
          : axis),
      });
    };
    fitRankingAxes();

    // Register event listeners
    if (onEvents) {
      Object.entries(onEvents).forEach(([eventName, handler]) => {
        chartInstance.current?.on(eventName, handler);
      });
    }

    // Auto-resize on window resize & container size change (e.g. sidebar collapse)
    const handleResize = () => {
      chartInstance.current?.resize();
      fitRankingAxes();
    };

    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver(handleResize);

    resizeObserver.observe(chartRef.current);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (onEvents && chartInstance.current) {
        Object.entries(onEvents).forEach(([eventName, handler]) => {
          chartInstance.current?.off(eventName, handler);
        });
      }
    };
  }, [option, isDark, onEvents]);

  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  return (
    <figure className="m-0 min-w-0" aria-labelledby={title?.text ? captionId : undefined}>
      {title?.text && (
        <figcaption id={captionId} className="mb-2 min-w-0">
          <div className="text-sm font-semibold leading-6 text-slate-900 dark:text-slate-100 break-words">{title.text}</div>
          {title.subtext && <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400 break-words">{title.subtext}</p>}
        </figcaption>
      )}
      <div
        ref={chartRef}
        className={`overflow-hidden ${className || 'w-full min-w-0 transition-all duration-200'}`}
        style={style || { minHeight: height || '320px', height: height || '320px' }}
      />
    </figure>
  );
};
