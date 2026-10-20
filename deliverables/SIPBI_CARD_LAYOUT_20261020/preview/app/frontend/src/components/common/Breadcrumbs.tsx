import React from 'react';
import { useApp, DASHBOARD_TITLES } from '../../context/AppContext';
import { Filters } from '../../types/sales';

export const Breadcrumbs: React.FC = () => {
  const { activeTab, history, goBack, clearHistory, filters, setFilters, lang } = useApp();
  const isZh = lang === 'zh-TW';

  if (history.length === 0) return null;

  const prev = history[history.length - 1];
  const currentTitle = DASHBOARD_TITLES[activeTab]
    ? DASHBOARD_TITLES[activeTab][isZh ? 'zh' : 'en']
    : activeTab;

  const activeFilters: { label: string; val: string; key: keyof Filters }[] = [];
  if (filters.company && filters.company !== 'All') {
    activeFilters.push({ label: isZh ? '公司' : 'Company', val: filters.company, key: 'company' });
  }
  if (filters.product && filters.product !== 'All') {
    activeFilters.push({ label: isZh ? '產品' : 'Product', val: filters.product, key: 'product' });
  }
  if (filters.customer && filters.customer !== 'All') {
    activeFilters.push({ label: isZh ? '客戶' : 'Customer', val: filters.customer, key: 'customer' });
  }
  if (filters.salesperson && filters.salesperson !== 'All') {
    activeFilters.push({ label: isZh ? '業務員' : 'Salesperson', val: filters.salesperson, key: 'salesperson' });
  }
  if (filters.plant && filters.plant !== 'All') {
    activeFilters.push({ label: isZh ? '廠區' : 'Plant', val: filters.plant, key: 'plant' });
  }
  if (filters.costCenter && filters.costCenter !== 'All') {
    activeFilters.push({ label: isZh ? '成本中心' : 'Cost Center', val: filters.costCenter, key: 'costCenter' });
  }

  return (
    <div className="mb-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2.5 shadow-2xs flex flex-wrap items-center justify-between gap-2 text-xs transition-colors">
      <div className="flex items-center space-x-2">
        <button
          onClick={goBack}
          className="inline-flex items-center space-x-1.5 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-bold rounded-md border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer"
          title={isZh ? `返回 ${prev.tab} (${prev.title})` : `Back to ${prev.tab}`}
        >
          <span>⬅</span>
          <span>{isZh ? `返回: ${prev.tab}` : `Back: ${prev.tab}`}</span>
        </button>

        <div className="hidden sm:flex items-center space-x-1 text-slate-400 dark:text-slate-500">
          <span>/</span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {activeTab} · {currentTitle}
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-2xs text-slate-400">{isZh ? '穿透鎖定:' : 'Filters:'}</span>
            {activeFilters.map((f) => (
              <span
                key={f.key}
                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-2xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700"
              >
                <span>
                  {f.label}: {f.val}
                </span>
                <button
                  onClick={() => setFilters((prevF) => ({ ...prevF, [f.key]: 'All' }))}
                  className="hover:text-rose-500 ml-0.5 font-bold cursor-pointer"
                  title={isZh ? '清除此篩選' : 'Clear filter'}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <button
          onClick={clearHistory}
          className="text-2xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 px-2 py-1 rounded transition-colors cursor-pointer"
          title={isZh ? '清除所有導航歷史' : 'Clear navigation history'}
        >
          {isZh ? '清除記錄' : 'Clear History'}
        </button>
      </div>
    </div>
  );
};
