import React, { useState } from 'react';
import { Filters, Member } from '../../types/sales';
import { useApp } from '../../context/AppContext';
import { DEFAULT_FILTERS } from '../../utils/salesFormat';
import { getFilterSummaryLabels } from '../../utils/slicerData';

interface SlicerBarProps {
  slicer: Filters;
  onChange: React.Dispatch<React.SetStateAction<Filters>> | ((next: Filters) => void);
}

export const SlicerBar: React.FC<SlicerBarProps> = ({ slicer, onChange }) => {
  const { t, lang, metadata, metadataLoading, metadataError, resetFilters } = useApp();
  const isZh = lang === 'zh-TW';
  const [customMonth, setCustomMonth] = useState('');

  const updateFilter = (field: keyof Filters, val: string) => {
    const next: Filters = {
      ...slicer,
      [field]: val || 'All',
    };
    onChange(next);
  };

  const months: Member[] = metadata?.months || [];
  const companies: Member[] = metadata?.members?.company || [];
  const products: Member[] = metadata?.members?.product || [];
  const customers: Member[] = metadata?.members?.customer || [];
  const salespeople: Member[] = metadata?.members?.salesperson || [];
  const plants: Member[] = metadata?.members?.plant || [];
  const costCenters: Member[] = metadata?.members?.costCenter || [];

  const isCustomMonthSelected =
    slicer.month !== 'All' &&
    months.length > 0 &&
    !months.some((m) => m.key === slicer.month);

  const isModified =
    slicer.month !== DEFAULT_FILTERS.month ||
    slicer.company !== 'All' ||
    slicer.product !== 'All' ||
    slicer.customer !== 'All' ||
    slicer.salesperson !== 'All' ||
    slicer.plant !== 'All' ||
    slicer.costCenter !== 'All';

  const extraFilterCount = [slicer.product, slicer.customer, slicer.salesperson, slicer.plant, slicer.costCenter].filter(v => v !== 'All').length;
  const summary = getFilterSummaryLabels(slicer, metadata, isZh);

  const handleApplyCustomMonth = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customMonth.trim();
    if (/^\d{6}$/.test(trimmed) || trimmed === 'All') {
      updateFilter('month', trimmed);
    }
  };

  const renderDimensionSelect = (
    field: keyof Filters,
    label: string,
    members: Member[],
    allCaptionZh: string,
    allCaptionEn: string
  ) => (
    <div className="min-w-[140px] flex-1">
      <label htmlFor={`sales-filter-${field}`} className="block text-2xs font-semibold text-slate-500 dark:text-slate-400 mb-1 truncate">
        {label}
      </label>
      <select
        id={`sales-filter-${field}`}
        value={slicer[field]}
        onChange={(e) => updateFilter(field, e.target.value)}
        className="w-full text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-md px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
      >
        <option value="All">{isZh ? allCaptionZh : allCaptionEn}</option>
        {members.map((m) => (
          <option key={m.key} value={m.key}>
            {m.key === m.label ? m.key : `${m.key} - ${m.label}`}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 shadow-xs space-y-3 transition-colors">
      {/* Disclosure & Source Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800 text-2xs">
        <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-200 dark:border-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            <span>SSAS Live · JDE Sales</span>
          </span>
          <span className="font-mono text-slate-500 dark:text-slate-400">
            USD · KG · Invoice Date ({metadata?.source?.coverageStart || '202401'}..{metadata?.source?.coverageEnd || '202609'})
          </span>
          <span className="px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/60">
            {isZh
              ? '合成示範資料 (Synthetic Data) · 五家公司共用主檔 · 免登入模式 (No Login)'
              : 'Synthetic Demo Data · Shared 5 Companies · No Login Required'}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {metadataLoading && (
            <span className="text-slate-400 animate-pulse">
              {isZh ? '載入主檔維度中...' : 'Loading metadata...'}
            </span>
          )}
          {metadataError && (
            <span className="text-rose-600 dark:text-rose-400 font-semibold">
              {isZh ? `主檔載入錯誤: ${metadataError}` : `Metadata error: ${metadataError}`}
            </span>
          )}
          {isModified && (
            <button
              type="button"
              onClick={resetFilters}
              className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold transition-colors flex items-center space-x-1 cursor-pointer"
            >
              <span>🔄</span>
              <span>{isZh ? '重設篩選 (202609 · All)' : 'Reset Filters'}</span>
            </button>
          )}
        </div>
      </div>

      {/* 7 Filter Controls: Month + 6 Dimensions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-end max-w-2xl">
        <div className="min-w-[160px] flex-1">
          <label htmlFor="sales-filter-month" className="block text-2xs font-semibold text-slate-500 dark:text-slate-400 mb-1 truncate">
            {t('slicer.month')}
          </label>
          <div className="flex space-x-1">
            <select
              id="sales-filter-month"
              value={slicer.month}
              onChange={(e) => updateFilter('month', e.target.value)}
              className="w-full text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-md px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="All">{isZh ? '全部月份 (All)' : 'All Months (All)'}</option>
              {isCustomMonthSelected && (
                <option value={slicer.month}>
                  {slicer.month} ({isZh ? '自訂月份' : 'Custom'})
                </option>
              )}
              {months.length > 0 ? (
                months
                  .slice()
                  .reverse()
                  .map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label || m.key}
                    </option>
                  ))
              ) : (
                <option value="202609">2026-09 (202609)</option>
              )}
            </select>
          </div>
        </div>

        {renderDimensionSelect(
          'company',
          t('slicer.company'),
          companies,
          '全部公司 (All)',
          'All Companies (All)'
        )}
      </div>
      <details className="sales-extra-filters rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
        <summary className="text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer focus-ring">
          {isZh ? '更多篩選：產品、客戶、業務員、廠別、成本中心' : 'More filters: product, customer, salesperson, plant, cost center'}
          {extraFilterCount > 0 && <span className="ml-2 text-blue-600 dark:text-blue-400">{isZh ? `（${extraFilterCount} 項已套用）` : `(${extraFilterCount} active)`}</span>}
        </summary>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 items-end">
        {renderDimensionSelect(
          'product',
          t('slicer.product'),
          products,
          '全部產品 (All)',
          'All Products (All)'
        )}
        {renderDimensionSelect(
          'customer',
          t('slicer.customer'),
          customers,
          '全部客戶 (All)',
          'All Customers (All)'
        )}
        {renderDimensionSelect(
          'salesperson',
          t('slicer.salesperson'),
          salespeople,
          '全部業務員 (All)',
          'All Salespeople (All)'
        )}
        {renderDimensionSelect(
          'plant',
          t('slicer.plant'),
          plants,
          '全部廠區 (All)',
          'All Plants (All)'
        )}
        {renderDimensionSelect(
          'costCenter',
          t('slicer.costCenter'),
          costCenters,
          '全部成本中心 (All)',
          'All Cost Centers (All)'
        )}
        </div>
      </details>

      {/* Bottom Row: Custom YYYYMM Input + Active Filter Summary */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-2xs">
        <div className="flex flex-wrap items-center gap-1.5 text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-600 dark:text-slate-300">
            {isZh ? '目前切片：' : 'Active Slicers:'}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-mono">
            <span>{summary.monthLabel}</span>
            {slicer.month !== DEFAULT_FILTERS.month && (
              <button
                type="button"
                onClick={() => updateFilter('month', DEFAULT_FILTERS.month)}
                className="hover:text-rose-600 dark:hover:text-rose-400 font-bold ml-0.5 text-xs cursor-pointer leading-none"
                title={isZh ? '還原預設月份' : 'Restore default month'}
                aria-label={isZh ? '還原預設月份' : 'Restore default month'}
              >
                ×
              </button>
            )}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            <span>{summary.companyLabel}</span>
            {slicer.company !== 'All' && (
              <button
                type="button"
                onClick={() => updateFilter('company', 'All')}
                className="hover:text-rose-600 dark:hover:text-rose-400 font-bold ml-0.5 text-xs cursor-pointer leading-none"
                title={isZh ? '清除公司篩選' : 'Clear company filter'}
                aria-label={isZh ? '清除公司篩選' : 'Clear company filter'}
              >
                ×
              </button>
            )}
          </span>
          {slicer.product !== 'All' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              <span>{summary.productLabel}</span>
              <button
                type="button"
                onClick={() => updateFilter('product', 'All')}
                className="hover:text-rose-600 dark:hover:text-rose-400 font-bold ml-0.5 text-xs cursor-pointer leading-none"
                title={isZh ? '清除產品篩選' : 'Clear product filter'}
                aria-label={isZh ? '清除產品篩選' : 'Clear product filter'}
              >
                ×
              </button>
            </span>
          )}
          {slicer.customer !== 'All' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              <span>{summary.customerLabel}</span>
              <button
                type="button"
                onClick={() => updateFilter('customer', 'All')}
                className="hover:text-rose-600 dark:hover:text-rose-400 font-bold ml-0.5 text-xs cursor-pointer leading-none"
                title={isZh ? '清除客戶篩選' : 'Clear customer filter'}
                aria-label={isZh ? '清除客戶篩選' : 'Clear customer filter'}
              >
                ×
              </button>
            </span>
          )}
          {slicer.salesperson !== 'All' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              <span>{summary.salespersonLabel}</span>
              <button
                type="button"
                onClick={() => updateFilter('salesperson', 'All')}
                className="hover:text-rose-600 dark:hover:text-rose-400 font-bold ml-0.5 text-xs cursor-pointer leading-none"
                title={isZh ? '清除業務員篩選' : 'Clear salesperson filter'}
                aria-label={isZh ? '清除業務員篩選' : 'Clear salesperson filter'}
              >
                ×
              </button>
            </span>
          )}
          {slicer.plant !== 'All' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              <span>{summary.plantLabel}</span>
              <button
                type="button"
                onClick={() => updateFilter('plant', 'All')}
                className="hover:text-rose-600 dark:hover:text-rose-400 font-bold ml-0.5 text-xs cursor-pointer leading-none"
                title={isZh ? '清除廠區篩選' : 'Clear plant filter'}
                aria-label={isZh ? '清除廠區篩選' : 'Clear plant filter'}
              >
                ×
              </button>
            </span>
          )}
          {slicer.costCenter !== 'All' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              <span>{summary.costCenterLabel}</span>
              <button
                type="button"
                onClick={() => updateFilter('costCenter', 'All')}
                className="hover:text-rose-600 dark:hover:text-rose-400 font-bold ml-0.5 text-xs cursor-pointer leading-none"
                title={isZh ? '清除成本中心篩選' : 'Clear cost center filter'}
                aria-label={isZh ? '清除成本中心篩選' : 'Clear cost center filter'}
              >
                ×
              </button>
            </span>
          )}
          {isModified && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-semibold border border-rose-200 dark:border-rose-800 transition-colors cursor-pointer text-2xs"
              title={isZh ? '一鍵重設所有篩選至預設狀態' : 'Reset all filters to default'}
            >
              <span>↺</span>
              <span>{isZh ? '一鍵重設' : 'Reset All'}</span>
            </button>
          )}
        </div>

        {/* Custom YYYYMM tester for empty/future months */}
        <form onSubmit={handleApplyCustomMonth} className="flex items-center space-x-1.5">
          <label htmlFor="sales-custom-month" className="text-slate-500 dark:text-slate-400">
            {isZh ? '指定 YYYYMM 月份:' : 'Custom YYYYMM:'}
          </label>
          <input
            id="sales-custom-month"
            type="text"
            value={customMonth}
            onChange={(e) => setCustomMonth(e.target.value)}
            placeholder="e.g. 202610"
            maxLength={6}
            className="w-24 text-2xs font-mono border border-slate-300 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={!/^(\d{6}|All)$/.test(customMonth.trim())}
            className="px-2 py-1 rounded text-2xs font-semibold bg-slate-100 hover:bg-indigo-600 hover:text-white dark:bg-slate-800 dark:hover:bg-indigo-600 text-slate-700 dark:text-slate-300 disabled:opacity-40 transition-colors cursor-pointer"
          >
            {isZh ? '套用' : 'Apply'}
          </button>
        </form>
      </div>
    </div>
  );
};
