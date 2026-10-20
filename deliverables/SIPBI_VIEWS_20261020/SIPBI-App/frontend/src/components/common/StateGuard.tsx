import React from 'react';
import { DashboardState, GrainGuardError } from '../../types/cube';
import { useApp } from '../../context/AppContext';

interface StateGuardProps {
  state: DashboardState;
  error?: GrainGuardError | null;
  message?: string;
  onRetry?: () => void;
  children: React.ReactNode;
}

export const StateGuard: React.FC<StateGuardProps> = ({
  state,
  error,
  message,
  onRetry,
  children,
}) => {
  const { lang, resetFilters } = useApp();
  const isZh = lang === 'zh-TW';
  const normalized = String(state || '').toUpperCase();

  if (normalized === 'LOADING') {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-slate-500 dark:text-slate-400">
        <div className="animate-spin h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full mb-4"></div>
        <p className="text-base font-medium">
          {isZh
            ? '正在自 SSAS JDE Sales Cube 檢索多維銷售數據...'
            : 'Retrieving multidimensional sales data from SSAS JDE Sales Cube...'}
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 font-mono">
          localhost:25000 · JDE_SALES_CUBE_20261020 · JDE Sales
        </p>
      </div>
    );
  }

  if (normalized === 'NO_DATA') {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 my-4">
        <svg
          className="h-12 w-12 mb-3 text-slate-300 dark:text-slate-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
          {isZh
            ? '所選發票月份或維度切片範圍內無銷售資料 (no_data)'
            : 'No sales data found for the selected Invoice Date / dimension filters (no_data)'}
        </p>
        {message && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl text-center">
            {message}
          </p>
        )}
        <button
          type="button"
          onClick={resetFilters}
          className="mt-4 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
        >
          {isZh ? '重設為預設篩選 (202609 · All)' : 'Reset to Default Filters (202609 · All)'}
        </button>
      </div>
    );
  }

  if (normalized === 'ERROR') {
    return (
      <div className="p-6 my-4 bg-rose-50 dark:bg-rose-950/30 border-l-4 border-rose-500 rounded-r-xl shadow-xs">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-bold text-rose-800 dark:text-rose-200">
              {error?.code || (isZh ? '查詢執行失敗' : 'QUERY_EXECUTION_ERROR')}
            </h3>
            <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">
              {error?.reason ||
                message ||
                (isZh ? '無法自後端取得 SSAS 銷售分析資料' : 'Failed to fetch SSAS sales analytics data')}
            </p>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer"
            >
              {isZh ? '重新載入' : 'Retry'}
            </button>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
