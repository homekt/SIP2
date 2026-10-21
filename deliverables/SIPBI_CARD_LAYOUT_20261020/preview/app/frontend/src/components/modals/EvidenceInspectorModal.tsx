import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { fmtCount, fmtKG, fmtPercent, fmtUSD } from '../../utils/salesFormat';
import { getFilterSummaryLabels } from '../../utils/slicerData';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sourceProbe: { ready: boolean | null; at: string };
}

const HIDDEN_VIEWS_GOVERNANCE = [
  { id: 'D03', zh: '通路分析 (Channel Analysis)', reasonZh: 'Cube 不含銷售通路維度', reasonEn: 'No channel dimension in Cube' },
  { id: 'D05', zh: '報價轉訂單 (Quote-to-Order)', reasonZh: 'Cube 僅含發票實績，無報價單事實表', reasonEn: 'Invoice facts only; no quote table' },
  { id: 'D09', zh: '退貨原因剖析 (Return Reason)', reasonZh: 'Cube 不含退貨原因碼維度', reasonEn: 'No return reason code dimension' },
  { id: 'D10', zh: '價格折讓瀑布 (Price Waterfall)', reasonZh: 'Cube 無標準牌價表，不得偽造牌價折扣', reasonEn: 'No list price table in Cube' },
  { id: 'D12', zh: '目標與預算達成 (Target & Quota)', reasonZh: 'Cube 無預算配額事實表，嚴禁捏造達成率', reasonEn: 'No budget/quota fact table in Cube' },
  { id: 'D17', zh: '庫存與帳款風險 (Inventory & AR)', reasonZh: 'Cube 僅含銷售明細，無庫存與應收帳款', reasonEn: 'Sales facts only; no inventory/AR' },
];

export const EvidenceInspectorModal: React.FC<Props> = ({ isOpen, onClose, sourceProbe }) => {
  const { lang, activeTab, filters, metadata, lastDashboardContext, aiEnabled } = useApp();
  const [activeLayer, setActiveLayer] = useState<'L1' | 'L2' | 'L3'>('L1');
  const [copiedHash, setCopiedHash] = useState(false);

  if (!isOpen) return null;

  const isZh = lang === 'zh-TW';
  const summaryLabels = getFilterSummaryLabels(filters, metadata, isZh);
  const kpis = lastDashboardContext?.kpis;
  const ev = lastDashboardContext?.evidence;
  const src = lastDashboardContext?.source || metadata?.source;

  const handleCopyHash = () => {
    if (!ev?.queryHash) return;
    navigator.clipboard.writeText(ev.queryHash).then(() => {
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    });
  };

  const memberCounts = [
    { key: 'months', zh: '發票月份 (Invoice Months)', en: 'Invoice Months', count: metadata?.months?.length ?? 0 },
    { key: 'company', zh: '營運公司 (Company)', en: 'Companies', count: metadata?.members?.company?.length ?? 0 },
    { key: 'product', zh: '產品品項 (Product)', en: 'Products', count: metadata?.members?.product?.length ?? 0 },
    { key: 'customer', zh: '客戶 (Customer)', en: 'Customers', count: metadata?.members?.customer?.length ?? 0 },
    { key: 'salesperson', zh: '業務員 (Salesperson)', en: 'Salespeople', count: metadata?.members?.salesperson?.length ?? 0 },
    { key: 'plant', zh: '廠區 (Plant)', en: 'Plants', count: metadata?.members?.plant?.length ?? 0 },
    { key: 'costCenter', zh: '成本中心 (Cost Center)', en: 'Cost Centers', count: metadata?.members?.costCenter?.length ?? 0 },
  ];

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-slate-800 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded text-2xs font-extrabold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-mono">
                WP15 METADATA + WP16 EVIDENCE INSPECTOR
              </span>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                {isZh ? 'SSAS 語意目錄與三層式證據檢視器' : 'SSAS Metadata & 3-Tier Evidence Inspector'}
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isZh
                ? '依據《Phase 0.5 驗證與探索工作台規格 v2.0》提供 L1 結論、L2 語意目錄與 L3 技術證據溯源'
                : 'Governed L1 Conclusion, L2 Cube Metadata Catalog, and L3 Technical Evidence Trace'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <span className="sr-only">Close</span>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Layer Switcher Tabs */}
        <div className="px-6 pt-3 border-b border-slate-200 dark:border-slate-800 flex gap-2 bg-slate-50/40 dark:bg-slate-900">
          {[
            {
              id: 'L1' as const,
              zh: 'L1 當前切片與 KPI 摘要',
              en: 'L1 Current Slice & KPIs',
            },
            {
              id: 'L2' as const,
              zh: 'L2 SSAS 語意目錄 (WP15)',
              en: 'L2 Cube Metadata (WP15)',
            },
            {
              id: 'L3' as const,
              zh: 'L3 技術證據與算術規則 (WP16)',
              en: 'L3 Evidence & Math Rules (WP16)',
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveLayer(tab.id)}
              className={`px-3.5 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                activeLayer === tab.id
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {isZh ? tab.zh : tab.en}
            </button>
          ))}
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {activeLayer === 'L1' && (
            <div className="space-y-4">
              {/* Source Status */}
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-2xs font-bold uppercase text-slate-400">SSAS Semantic Authority</div>
                  <div className="font-mono font-bold text-sm text-slate-900 dark:text-white mt-0.5">
                    {src?.server || 'localhost:25000'} / {src?.database || 'JDE_SALES_CUBE_20261020'} /{' '}
                    {src?.cube || 'JDE Sales'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-1 rounded-full text-2xs font-bold ${
                      sourceProbe.ready
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                    }`}
                  >
                    {sourceProbe.ready
                      ? isZh
                        ? '● SSAS 連線正常'
                        : '● SSAS Online'
                      : isZh
                      ? '● SSAS 離線'
                      : '● SSAS Offline'}
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-2xs font-mono bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                    {activeTab} · {ev?.grain || `invoice-date/${activeTab}`}
                  </span>
                </div>
              </div>

              {/* Active Filters */}
              <div>
                <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-2">
                  {isZh ? '目前生效之全域切片條件 (Active Slicer Context)' : 'Active Slicer Context'}
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono">
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <div className="text-2xs text-slate-400 font-sans">{isZh ? '發票月份' : 'Month'}</div>
                    <div className="font-bold text-slate-900 dark:text-white">{summaryLabels.monthLabel}</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <div className="text-2xs text-slate-400 font-sans">{isZh ? '營運公司' : 'Company'}</div>
                    <div className="font-bold text-slate-900 dark:text-white">{summaryLabels.companyLabel}</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <div className="text-2xs text-slate-400 font-sans">{isZh ? '產品 / 客戶' : 'Product / Customer'}</div>
                    <div className="font-bold text-slate-900 dark:text-white truncate">
                      {filters.product} / {filters.customer}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <div className="text-2xs text-slate-400 font-sans">
                      {isZh ? '業務員 / 廠區 / 成本中心' : 'Sales / Plant / CC'}
                    </div>
                    <div className="font-bold text-slate-900 dark:text-white truncate">
                      {filters.salesperson} / {filters.plant} / {filters.costCenter}
                    </div>
                  </div>
                </div>
              </div>

              {/* Verified KPI Snapshot */}
              <div>
                <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-2">
                  {isZh ? '當前切片 SSAS 認證量值摘要 (Certified Cube KPIs)' : 'Certified Cube KPIs for Current Slice'}
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono">
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <div className="text-2xs text-slate-500 font-sans">Net Sales USD</div>
                    <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                      {fmtUSD(kpis?.netSalesUSD ?? null)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <div className="text-2xs text-slate-500 font-sans">Gross Profit USD</div>
                    <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                      {fmtUSD(kpis?.grossProfitUSD ?? null)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <div className="text-2xs text-slate-500 font-sans">Weighted Gross Margin %</div>
                    <div className="text-base font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                      {fmtPercent(kpis?.grossMarginPercent ?? null)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <div className="text-2xs text-slate-500 font-sans">Net Quantity KG</div>
                    <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                      {fmtKG(kpis?.netQtyKG ?? null)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <div className="text-2xs text-slate-500 font-sans">Distinct Orders (Non-additive)</div>
                    <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                      {fmtCount(kpis?.orderCount ?? null)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <div className="text-2xs text-slate-500 font-sans">Sales Line Count</div>
                    <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                      {fmtCount(kpis?.salesLineCount ?? null)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeLayer === 'L2' && (
            <div className="space-y-4">
              {/* Dimension Member Counts */}
              <div>
                <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-2">
                  {isZh
                    ? '1. 受治理維度與有效成員數 (/api/metadata)'
                    : '1. Governed Dimensions & Member Counts (/api/metadata)'}
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {memberCounts.map((m) => (
                    <div
                      key={m.key}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
                    >
                      <div className="text-2xs text-slate-500">{isZh ? m.zh : m.en}</div>
                      <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                        {m.count} {isZh ? '個成員' : 'members'}
                      </div>
                    </div>
                  ))}
                  <div className="p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800">
                    <div className="text-2xs text-indigo-700 dark:text-indigo-300">
                      {isZh ? '涵蓋期間 (Coverage)' : 'Data Coverage'}
                    </div>
                    <div className="text-sm font-bold font-mono text-indigo-900 dark:text-indigo-200 mt-1">
                      {src?.coverageStart || '202401'} .. {src?.coverageEnd || '202609'}
                    </div>
                  </div>
                </div>
              </div>

              {/* 12 Public Measures */}
              <div>
                <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-2">
                  {isZh
                    ? '2. SSAS Cube 公開認證量值 (12 Public Measures)'
                    : '2. Certified Public Cube Measures (12 Measures)'}
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    ev?.measures || [
                      'Net Sales USD',
                      'Net Cost USD',
                      'Gross Profit USD',
                      'Net Quantity KG',
                      'Sales Quantity KG',
                      'Return Quantity KG',
                      'Order Count',
                      'Sales Line Count',
                      'Full Return Line Count',
                      'Partial Return Line Count',
                      'Allowance Line Count',
                      'Negative Margin Line Count',
                    ]
                  ).map((m) => (
                    <span
                      key={m}
                      className="px-2.5 py-1 rounded-md font-mono text-2xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>

              {/* Hidden Views Governance */}
              <div>
                <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-2">
                  {isZh
                    ? '3. 能力邊界與嚴格隱藏視圖 (Strict Capability Gating)'
                    : '3. Capability Boundary & Hidden Unsupported Views'}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {HIDDEN_VIEWS_GOVERNANCE.map((hv) => (
                    <div
                      key={hv.id}
                      className="p-2.5 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/50 flex items-center justify-between"
                    >
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        <span className="font-mono text-amber-700 dark:text-amber-400 mr-1.5">{hv.id}</span>
                        {hv.zh}
                      </span>
                      <span className="text-2xs text-amber-800 dark:text-amber-300">
                        {isZh ? hv.reasonZh : hv.reasonEn}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-2xs text-slate-500">
                  {isZh
                    ? `• D07 AI 銷售分析工作區狀態：${aiEnabled ? '已啟用 (Enabled)' : '已隱藏（未配置伺服器端 OPENAI_API_KEY / OPENAI_MODEL）'}`
                    : `• D07 AI Workspace status: ${aiEnabled ? 'Enabled' : 'Hidden (OPENAI_API_KEY / OPENAI_MODEL not configured)'}`}
                </div>
              </div>
            </div>
          )}

          {activeLayer === 'L3' && (
            <div className="space-y-4">
              {/* Cryptographic Query Hash & Request ID */}
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-2 font-mono">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-2xs text-slate-400 font-sans mr-2">Request ID:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{ev?.requestId || '—'}</span>
                  </div>
                  <div>
                    <span className="text-2xs text-slate-400 font-sans mr-2">Queried At:</span>
                    <span className="text-slate-700 dark:text-slate-300">{ev?.queriedAt || sourceProbe.at || '—'}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <div className="truncate">
                    <span className="text-2xs text-slate-400 font-sans mr-2">SHA-256 Query Hash:</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">{ev?.queryHash || '—'}</span>
                  </div>
                  {ev?.queryHash && (
                    <button
                      type="button"
                      onClick={handleCopyHash}
                      className="px-2.5 py-1 rounded text-2xs font-sans font-semibold bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 cursor-pointer shrink-0"
                    >
                      {copiedHash ? (isZh ? '✔ 已複製' : '✔ Copied') : isZh ? '複製 Hash' : 'Copy Hash'}
                    </button>
                  )}
                </div>
              </div>

              {/* 10 Semantic & Arithmetic Honesty Rules */}
              <div>
                <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-2">
                  {isZh
                    ? '後端強制執行之語意與算術誠實性規則 (evidence.notes)'
                    : 'Server-Enforced Semantic & Arithmetic Honesty Notes (evidence.notes)'}
                </h4>
                <ol className="list-decimal pl-5 space-y-1.5 text-slate-700 dark:text-slate-300">
                  {(ev?.notes || []).map((note, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {note}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between text-2xs text-slate-500">
          <span>
            {isZh
              ? '所有數值均直接來自 SSAS Cube 認證彙總，無前端未加權平均或假資料'
              : 'All values originate directly from certified SSAS Cube aggregates'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold rounded-lg transition-colors cursor-pointer"
          >
            {isZh ? '關閉' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
