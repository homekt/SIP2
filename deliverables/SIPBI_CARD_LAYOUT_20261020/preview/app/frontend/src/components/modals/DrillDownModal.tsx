import React, { useEffect, useMemo, useState } from 'react';
import { useApp, DASHBOARD_TITLES, AUTHORIZED_SALES_TABS } from '../../context/AppContext';
import { Evidence, Filters, SalesRow } from '../../types/sales';
import { DrilldownGroupBy, fetchSalesDrilldown } from '../../services/salesApi';
import { computeDrilldownSummary } from '../../utils/salesMath';
import {
  downloadCsv,
  exportSalesRowsCsv,
  fmtCount,
  fmtKG,
  fmtPercent,
  fmtPriceUSD,
  fmtUSD,
} from '../../utils/salesFormat';

const DRILL_DIMENSIONS: { key: DrilldownGroupBy; zh: string; en: string; filterKey?: keyof Filters }[] = [
  { key: 'product', zh: '產品 (Product)', en: 'Product', filterKey: 'product' },
  { key: 'category', zh: '產品類別 (Category)', en: 'Category' },
  { key: 'customer', zh: '客戶 (Customer)', en: 'Customer', filterKey: 'customer' },
  { key: 'company', zh: '營運公司 (Company)', en: 'Company', filterKey: 'company' },
  { key: 'salesperson', zh: '業務員 (Salesperson)', en: 'Salesperson', filterKey: 'salesperson' },
  { key: 'plant', zh: '廠區 (Plant)', en: 'Plant', filterKey: 'plant' },
  { key: 'costCenter', zh: '成本中心 (Cost Center)', en: 'Cost Center', filterKey: 'costCenter' },
  { key: 'month', zh: '發票月份 (Month)', en: 'Invoice Month', filterKey: 'month' },
];

export const DrillDownModal: React.FC = () => {
  const { drillDownModal, closeDrillDown, navigate, filters, setFilters, lang, aiEnabled } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeDim, setActiveDim] = useState<DrilldownGroupBy>('product');
  const [liveRows, setLiveRows] = useState<SalesRow[] | null>(null);
  const [liveEvidence, setLiveEvidence] = useState<Evidence | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  const isZh = lang === 'zh-TW';

  useEffect(() => {
    if (!drillDownModal) {
      setLiveRows(null);
      setLiveEvidence(null);
      setLiveError(null);
      setSearchTerm('');
      return;
    }

    const initialDim: DrilldownGroupBy = drillDownModal.groupBy || 'product';
    setActiveDim(initialDim);

    if (drillDownModal.salesRows && drillDownModal.salesRows.length > 0 && !drillDownModal.groupBy) {
      setLiveRows(drillDownModal.salesRows);
      setLiveEvidence(drillDownModal.evidence || null);
      return;
    }

    const controller = new AbortController();
    const mergedFilters = {
      ...filters,
      ...(drillDownModal.filterOverrides || {}),
    };

    setLoadingLive(true);
    setLiveError(null);
    fetchSalesDrilldown(initialDim, mergedFilters, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setLiveRows(res.rows || []);
          setLiveEvidence(res.evidence || null);
          setLoadingLive(false);
        }
      })
      .catch((err: any) => {
        if (!controller.signal.aborted) {
          setLiveError(err?.message || 'Failed to fetch /api/drilldown');
          if (drillDownModal.salesRows) {
            setLiveRows(drillDownModal.salesRows);
          }
          setLoadingLive(false);
        }
      });

    return () => controller.abort();
  }, [drillDownModal, filters]);

  const handleDimensionSwitch = (dim: DrilldownGroupBy) => {
    if (!drillDownModal) return;
    setActiveDim(dim);
    const mergedFilters = {
      ...filters,
      ...(drillDownModal.filterOverrides || {}),
    };
    setLoadingLive(true);
    setLiveError(null);
    fetchSalesDrilldown(dim, mergedFilters)
      .then((res) => {
        setLiveRows(res.rows || []);
        setLiveEvidence(res.evidence || null);
        setLoadingLive(false);
      })
      .catch((err: any) => {
        setLiveError(err?.message || 'Failed to fetch /api/drilldown');
        setLoadingLive(false);
      });
  };

  const filteredSalesRows = useMemo(
    () =>
      (liveRows || []).filter(
        (r) =>
          r.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.label.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [liveRows, searchTerm]
  );

  const drillSummary = useMemo(
    () => computeDrilldownSummary(filteredSalesRows),
    [filteredSalesRows]
  );

  if (!drillDownModal) return null;

  const {
    title,
    subtitle,
    dimensionName,
    dimensionValue,
    sourceDashboard,
    summaryMetrics,
    rows,
    suggestedDrillThrough,
  } = drillDownModal;

  const activeDimMeta = DRILL_DIMENSIONS.find((d) => d.key === activeDim);
  const canApplyFilter = Boolean(activeDimMeta?.filterKey);

  const handleApplyMemberFilter = (memberKey: string) => {
    if (!activeDimMeta?.filterKey) return;
    const fk = activeDimMeta.filterKey;
    setFilters((prev) => ({
      ...prev,
      ...(drillDownModal.filterOverrides || {}),
      [fk]: memberKey,
    }));
    closeDrillDown();
  };

  const isTargetAllowed = (tab?: string) => {
    if (!tab) return false;
    if (tab === 'D07') return aiEnabled;
    return (AUTHORIZED_SALES_TABS as readonly string[]).includes(tab);
  };

  const validSuggestions = (suggestedDrillThrough || []).filter((s) =>
    isTargetAllowed(s.targetTab)
  );

  const hasSalesRows = Boolean(liveRows && liveRows.length > 0);

  const filteredLegacyRows = (rows || []).filter(
    (r) =>
      r.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.subLabel && r.subLabel.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleExportCSV = () => {
    if (hasSalesRows && liveRows) {
      exportSalesRowsCsv(
        `JDE_Sales_DrillDown_${sourceDashboard}_${activeDim}_${dimensionValue}.csv`,
        liveRows,
        activeDim
      );
      return;
    }
    if (!rows.length) return;
    const headers = [
      dimensionName,
      'SubLabel',
      rows[0].metric1Label,
      rows[0].metric2Label || '',
      'Status',
    ].filter(Boolean);

    const dataRows = rows.map((r) => [
      r.label,
      r.subLabel || '',
      r.metric1Value,
      r.metric2Value ?? '',
      r.statusBadge?.label || '',
    ]);
    downloadCsv(`JDE_Sales_DrillDown_${dimensionValue}.csv`, headers, dataRows);
  };

  const handleCopy = () => {
    const text =
      hasSalesRows && liveRows
        ? liveRows
            .map(
              (r) =>
                `${r.key} (${r.label}) | Net Sales: ${fmtUSD(r.netSalesUSD)} | GP: ${fmtUSD(
                  r.grossProfitUSD
                )} (${fmtPercent(r.grossMarginPercent)}) | Qty: ${fmtKG(r.netQtyKG)} | Orders: ${fmtCount(
                  r.orderCount
                )}`
            )
            .join('\n')
        : rows
            .map(
              (r) =>
                `${r.label} | ${r.metric1Label}: ${r.metric1Value} ${
                  r.metric2Label ? `| ${r.metric2Label}: ${r.metric2Value}` : ''
                }`
            )
            .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fade-in"
      onClick={closeDrillDown}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden transition-all text-slate-800 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded text-2xs font-extrabold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-mono">
                {sourceDashboard} ➔ SSAS DRILL-DOWN (O04 / O07)
              </span>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                {title}
              </h2>
            </div>
            {subtitle && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
            )}
          </div>

          <button
            onClick={closeDrillDown}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <span className="sr-only">Close</span>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Summary KPIs */}
          {summaryMetrics && summaryMetrics.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {summaryMetrics.map((m, idx) => (
                <div
                  key={idx}
                  className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700"
                >
                  <div className="text-2xs font-semibold text-slate-500 dark:text-slate-400">
                    {m.label}
                  </div>
                  <div className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                    {m.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Live /api/drilldown Dimension Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-2xs font-bold text-slate-500 dark:text-slate-400 mr-1">
                {isZh ? '下鑽群組 (/api/drilldown):' : 'Drill GroupBy (/api/drilldown):'}
              </span>
              {DRILL_DIMENSIONS.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => handleDimensionSwitch(d.key)}
                  className={`px-2.5 py-1 rounded-md text-2xs font-semibold transition-colors cursor-pointer ${
                    activeDim === d.key
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {isZh ? d.zh : d.en}
                </button>
              ))}
            </div>
            {liveEvidence && (
              <span className="text-2xs font-mono text-slate-400">
                Hash: {liveEvidence.queryHash.slice(0, 8)} · {liveEvidence.grain}
              </span>
            )}
          </div>

          {/* Drill-Through Quick Action Cards */}
          {validSuggestions.length > 0 && (
            <div className="bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 rounded-xl p-4">
              <div className="text-xs font-bold text-indigo-900 dark:text-indigo-300 mb-2 flex items-center space-x-1.5">
                <span>🎯</span>
                <span>{isZh ? '推薦穿透分析' : 'Recommended Drill-Through'}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {validSuggestions.map((st, idx) => {
                  const targetTitle = DASHBOARD_TITLES[st.targetTab]
                    ? DASHBOARD_TITLES[st.targetTab][isZh ? 'zh' : 'en']
                    : st.targetTab;
                  return (
                    <button
                      key={idx}
                      onClick={() =>
                        navigate(st.targetTab, st.slicerUpdates, `${sourceDashboard} ➔ ${dimensionValue}`)
                      }
                      className="flex flex-col text-left p-2.5 bg-white dark:bg-slate-900 hover:bg-indigo-50/50 dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 rounded-lg transition-all group shadow-2xs cursor-pointer"
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 group-hover:text-indigo-600">
                          {st.targetTab} · {targetTitle}
                        </span>
                        <span className="text-2xs font-bold text-slate-400 group-hover:text-indigo-500">
                          {isZh ? '帶入條件穿透 ➔' : 'Drill Through ➔'}
                        </span>
                      </div>
                      <span className="text-2xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                        {st.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Search & Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <input
                type="text"
                placeholder={isZh ? '搜尋維度代碼或名稱...' : 'Search member key or label...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500"
              />
              <svg
                className="w-4 h-4 text-slate-400 absolute left-2.5 top-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold cursor-pointer"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleCopy}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center space-x-1 cursor-pointer"
              >
                <span>{copied ? (isZh ? '✔ 已複製' : '✔ Copied') : isZh ? '📋 複製' : '📋 Copy'}</span>
              </button>
              <button
                onClick={handleExportCSV}
                className="px-2.5 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded-lg border border-indigo-200 dark:border-indigo-800 transition-colors flex items-center space-x-1 cursor-pointer"
              >
                <span>{isZh ? '📥 匯出 CSV' : '📥 Export CSV'}</span>
              </button>
            </div>
          </div>

          {liveError && (
            <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-800">
              {liveError}
            </div>
          )}

          {/* Detail Rows Table */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="max-h-80 overflow-y-auto">
              {loadingLive ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  {isZh ? '正在自 /api/drilldown 載入 SSAS 下鑽明細...' : 'Loading SSAS drilldown rows...'}
                </div>
              ) : hasSalesRows ? (
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 z-10 font-sans">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '維度成員 (Key / Label)' : 'Member (Key / Label)'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '淨銷售額 (USD)' : 'Net Sales (USD)'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '毛利額 (USD)' : 'Gross Profit (USD)'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '加權毛利率' : 'GM %'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '淨銷量 (KG)' : 'Net Qty (KG)'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '平均單價' : 'ASP (USD/KG)'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '退貨率' : 'Return %'}
                      </th>
                      <th
                        className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300"
                        title={
                          isZh
                            ? 'SSAS DISTINCTCOUNT 不重複訂單數（跨維度成員不可直接相加）'
                            : 'SSAS DISTINCTCOUNT orders (non-additive across members)'
                        }
                      >
                        {isZh ? '不重複訂單*' : 'Orders*'}
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '明細行數' : 'Lines'}
                      </th>
                      <th className="px-3 py-2.5 text-center font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '連動 (O02)' : 'Filter (O02)'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                    {filteredSalesRows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-8 text-center text-slate-400 font-sans">
                          {isZh ? '未找到符合條件的下鑽數據' : 'No records match search criteria'}
                        </td>
                      </tr>
                    ) : (
                      filteredSalesRows.map((r) => (
                        <tr
                          key={r.key}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <td className="px-3 py-2 text-left font-sans text-slate-900 dark:text-slate-100">
                            <div className="font-semibold">{r.label}</div>
                            <div className="text-2xs text-slate-400 font-mono">{r.key}</div>
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-slate-800 dark:text-slate-200">
                            {fmtUSD(r.netSalesUSD)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right ${
                              (r.grossProfitUSD ?? 0) < 0
                                ? 'text-rose-600 dark:text-rose-400 font-bold'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {fmtUSD(r.grossProfitUSD)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-semibold ${
                              (r.grossMarginPercent ?? 0) < 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-indigo-600 dark:text-indigo-400'
                            }`}
                          >
                            {fmtPercent(r.grossMarginPercent)}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">
                            {fmtKG(r.netQtyKG)}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">
                            {fmtPriceUSD(r.averageSellingPriceUSD)}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">
                            {fmtPercent(r.returnRatePercent)}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">
                            {fmtCount(r.orderCount)}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400">
                            {fmtCount(r.salesLineCount)}
                          </td>
                          <td className="px-3 py-2 text-center font-sans">
                            {canApplyFilter ? (
                              <button
                                type="button"
                                onClick={() => handleApplyMemberFilter(r.key)}
                                className="px-2 py-0.5 rounded text-2xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-600 hover:text-white border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer"
                                title={
                                  isZh
                                    ? `將 ${r.label} 套用至全域切片器 (O02)`
                                    : `Apply ${r.label} to global slicer (O02)`
                                }
                              >
                                {isZh ? '套用篩選' : 'Apply'}
                              </button>
                            ) : (
                              <span className="text-2xs text-slate-400">{isZh ? '群組彙總' : 'Group'}</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {drillSummary && (
                    <tfoot className="bg-slate-100/90 dark:bg-slate-800/90 sticky bottom-0 z-10 font-mono border-t-2 border-slate-300 dark:border-slate-700">
                      <tr>
                        <td className="px-3 py-2.5 text-left font-sans font-bold text-slate-900 dark:text-white">
                          {isZh
                            ? `加權合計對帳 (${filteredSalesRows.length} 項)`
                            : `Weighted Total (${filteredSalesRows.length} rows)`}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-slate-900 dark:text-white">
                          {fmtUSD(drillSummary.netSalesUSD)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-slate-900 dark:text-white">
                          {fmtUSD(drillSummary.grossProfitUSD)}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right font-bold text-indigo-700 dark:text-indigo-300"
                          title={isZh ? 'SUM(毛利額) / SUM(淨銷售額)' : 'SUM(Gross Profit) / SUM(Net Sales)'}
                        >
                          {fmtPercent(drillSummary.grossMarginPercent)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-slate-800 dark:text-slate-200">
                          {fmtKG(drillSummary.netQtyKG)}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-300"
                          title={isZh ? 'SUM(淨銷售額) / SUM(淨銷量)' : 'SUM(Net Sales) / SUM(Net Qty)'}
                        >
                          {fmtPriceUSD(drillSummary.averageSellingPriceUSD)}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-300"
                          title={isZh ? 'SUM(退貨量) / SUM(銷售量)' : 'SUM(Return Qty) / SUM(Sales Qty)'}
                        >
                          {fmtPercent(drillSummary.returnRatePercent)}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right font-sans"
                          title={
                            isZh
                              ? '不重複訂單數 (DISTINCTCOUNT) 具非加總性，跨成員列不可直接相加'
                              : 'Distinct order count (DISTINCTCOUNT) is non-additive across member rows'
                          }
                        >
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                            {isZh ? '非加總' : 'Non-add.'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-slate-800 dark:text-slate-200">
                          {fmtCount(drillSummary.salesLineCount)}
                        </td>
                        <td className="px-3 py-2.5 text-center font-sans text-2xs text-slate-500">—</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              ) : (
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 z-10 font-sans">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">
                        {dimensionName}
                      </th>
                      <th className="px-4 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {rows[0]?.metric1Label || (isZh ? '指標 1' : 'Metric 1')}
                      </th>
                      {rows[0]?.metric2Label && (
                        <th className="px-4 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                          {rows[0].metric2Label}
                        </th>
                      )}
                      <th className="px-4 py-2.5 text-center font-semibold text-slate-600 dark:text-slate-300">
                        {isZh ? '狀態' : 'Status'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                    {filteredLegacyRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-slate-400 font-sans">
                          {isZh ? '未找到符合條件的下鑽數據' : 'No records match search criteria'}
                        </td>
                      </tr>
                    ) : (
                      filteredLegacyRows.map((r, idx) => (
                        <tr
                          key={idx}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <td className="px-4 py-2 text-left font-sans text-slate-900 dark:text-slate-100">
                            <div className="font-semibold">{r.label}</div>
                            {r.subLabel && <div className="text-2xs text-slate-400">{r.subLabel}</div>}
                          </td>
                          <td className="px-4 py-2 text-right font-bold text-slate-800 dark:text-slate-200">
                            {typeof r.metric1Value === 'number'
                              ? r.metric1Value.toLocaleString()
                              : r.metric1Value}
                          </td>
                          {rows[0]?.metric2Label && (
                            <td className="px-4 py-2 text-right text-slate-700 dark:text-slate-300">
                              {typeof r.metric2Value === 'number'
                                ? r.metric2Value.toLocaleString()
                                : r.metric2Value || '—'}
                            </td>
                          )}
                          <td className="px-4 py-2 text-center">
                            {r.statusBadge ? (
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full text-2xs font-semibold ${
                                  r.statusBadge.tone === 'success'
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    : r.statusBadge.tone === 'danger'
                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                    : r.statusBadge.tone === 'warning'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                }`}
                              >
                                {r.statusBadge.label}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex flex-wrap items-center justify-between gap-2 text-2xs text-slate-500">
          <span>
            {hasSalesRows
              ? isZh
                ? `已顯示 ${filteredSalesRows.length} 筆 SSAS 維度彙總記錄 · *不重複訂單數具非加總性 (Non-additive) · 比率皆為加權計算`
                : `Showing ${filteredSalesRows.length} SSAS aggregated dimension records · *Orders are non-additive DISTINCTCOUNT · Weighted ratios`
              : isZh
              ? `已顯示 ${filteredLegacyRows.length} 筆記錄`
              : `Showing ${filteredLegacyRows.length} records`}
          </span>
          <button
            onClick={closeDrillDown}
            className="px-4 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold rounded-lg transition-colors cursor-pointer"
          >
            {isZh ? '關閉' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
