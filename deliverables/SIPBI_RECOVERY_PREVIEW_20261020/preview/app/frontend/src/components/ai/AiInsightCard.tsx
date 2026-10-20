import React, { useState } from 'react';
import { useApp, AUTHORIZED_SALES_TABS } from '../../context/AppContext';
import { Evidence, Source } from '../../types/sales';

export interface AiInsightData {
  observed: string;
  interpretation: string;
  limitations: string[];
  coverage: string;
  confidence: string;
  nextSteps?: string[];
  evidenceId: string;
  claimType: 'OBSERVATION' | 'ARITHMETIC_CONTRIBUTION' | 'HYPOTHESIS_UNVERIFIED';
  evidence?: Evidence;
  source?: Source;
}

interface AiInsightCardProps {
  data: AiInsightData;
  title?: string;
  onOpenEvidence?: (evidenceId: string) => void;
}

export const AiInsightCard: React.FC<AiInsightCardProps> = ({
  data,
  title,
  onOpenEvidence,
}) => {
  const { navigate, lang, aiEnabled } = useApp();
  const [showDetails, setShowDetails] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const isZh = lang === 'zh-TW';
  const defaultTitle = isZh ? '銷售數據證據解讀' : 'Sales Evidence Summary';
  const activeTitle = title || defaultTitle;

  const claimBadge = {
    OBSERVATION: {
      bg: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700',
      label: isZh ? '實測觀察' : 'Observation',
    },
    ARITHMETIC_CONTRIBUTION: {
      bg: 'bg-teal-50 text-[#0f766e] dark:bg-teal-950/50 dark:text-[#2dd4bf] border-teal-200 dark:border-teal-800',
      label: isZh ? '算術結構' : 'Arithmetic',
    },
    HYPOTHESIS_UNVERIFIED: {
      bg: 'bg-amber-50 text-[#b45309] dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      label: isZh ? '待驗證假說' : 'Unverified',
    },
  }[data.claimType];

  const isTargetAllowed = (tab: string | null) => {
    if (!tab) return false;
    if (tab === 'D07') return aiEnabled;
    return (AUTHORIZED_SALES_TABS as readonly string[]).includes(tab);
  };

  return (
    <section
      aria-label={activeTitle}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-2xs transition-colors"
    >
      {/* Compact Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 text-xs font-bold shrink-0">
            Σ
          </span>
          <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
            {activeTitle}
          </h3>
          <span
            className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
            title={
              isZh
                ? '直接由本地 SSAS Cube 算術彙總，非雲端生成推論'
                : 'Deterministic local SSAS Cube aggregation (No Cloud LLM)'
            }
          >
            {isZh ? 'SSAS 本地直連 (非雲端 AI)' : 'SSAS Local Cube (No-Cloud)'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${claimBadge.bg}`}>
            {claimBadge.label}
          </span>
          <span className="px-2 py-0.5 rounded text-[11px] bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-mono border border-slate-200 dark:border-slate-700">
            {isZh ? '範圍' : 'Scope'}: {data.coverage}
          </span>
          <button
            type="button"
            onClick={() => setShowDetails((prev) => !prev)}
            aria-expanded={showDetails}
            className="text-xs px-2.5 py-1 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium rounded border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
          >
            {showDetails
              ? isZh
                ? '收合結構分析 ▲'
                : 'Collapse Notes ▲'
              : isZh
              ? '展開結構分析與下一步 ▼'
              : 'Structural Notes & Next Steps ▼'}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowDrawer(!showDrawer);
              onOpenEvidence?.(data.evidenceId);
            }}
            aria-expanded={showDrawer}
            className="text-xs px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 text-indigo-700 dark:text-indigo-300 font-medium rounded border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer"
          >
            {showDrawer
              ? isZh
                ? '隱藏證據收據'
                : 'Hide Evidence'
              : isZh
              ? '查閱證據收據'
              : 'View Evidence'}
          </button>
        </div>
      </div>

      {/* Always-visible compact summary + mandatory disclosure */}
      <div className="space-y-2 text-xs">
        <div className="text-slate-800 dark:text-slate-200 leading-relaxed tabular-nums">
          <span className="font-semibold text-slate-600 dark:text-slate-400 mr-1.5">
            {isZh ? '實測數據摘要：' : 'Observed Metrics:'}
          </span>
          <span>{data.observed}</span>
        </div>

        {/* Disclosure & Boundaries: ALWAYS visible, never hidden */}
        {data.limitations && data.limitations.length > 0 && (
          <div className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 rounded border border-slate-200/80 dark:border-slate-800 leading-normal">
            <strong className="text-[#b45309] dark:text-amber-400">
              {isZh ? '資料揭露與限制：' : 'Disclosure & Boundaries:'}
            </strong>{' '}
            {data.limitations.join('；')}
          </div>
        )}

        {/* Expandable detailed structural notes & next steps (kept in DOM via details for full accessibility) */}
        <details
          open={showDetails}
          onToggle={(e) => setShowDetails((e.currentTarget as HTMLDetailsElement).open)}
          className="group"
        >
          <summary className="sr-only">
            {isZh ? '結構分析說明與建議下一步' : 'Structural Notes and Recommended Next Steps'}
          </summary>
          <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            <div>
              <span className="font-semibold text-slate-700 dark:text-slate-300 block mb-0.5">
                {isZh ? '結構分析說明：' : 'Structural Notes:'}
              </span>
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50/70 dark:bg-slate-800/50 p-2.5 rounded border border-slate-200/70 dark:border-slate-800 tabular-nums">
                {data.interpretation}
              </p>
            </div>

            {data.nextSteps && data.nextSteps.length > 0 && (
              <div>
                <span className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  {isZh
                    ? '建議下一步銷售分析（點擊切換看板）：'
                    : 'Recommended Sales Views (Click to Navigate):'}
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {data.nextSteps.map((step, idx) => {
                    const match = step.match(/D(0[0-9]|1[0-8])/i);
                    const rawTarget = match ? `D${match[1].toUpperCase()}` : null;
                    const targetTab = isTargetAllowed(rawTarget) ? rawTarget : null;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => targetTab && navigate(targetTab)}
                        disabled={!targetTab}
                        className={`text-left px-2.5 py-1.5 rounded text-xs font-medium border transition-colors flex items-center justify-between ${
                          targetTab
                            ? 'bg-white hover:bg-indigo-50/60 dark:bg-slate-800 dark:hover:bg-slate-700 border-slate-200 hover:border-indigo-400 dark:border-slate-700 text-slate-800 dark:text-slate-200 cursor-pointer'
                            : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 cursor-default'
                        }`}
                      >
                        <span className="line-clamp-2">{step}</span>
                        {targetTab && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded text-[11px] font-bold font-mono bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 shrink-0">
                            {targetTab} ➔
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </details>
      </div>

      {/* Evidence Receipt Drawer */}
      {showDrawer && (
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs bg-slate-900 text-slate-200 p-3.5 rounded font-mono">
          <div className="flex justify-between items-center mb-2 pb-1 border-b border-slate-800">
            <span className="text-teal-400 font-bold">VERIFIED SSAS EVIDENCE RECEIPT</span>
            <span className="text-[11px] text-slate-400">
              {data.evidence?.queriedAt || 'Live Query'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px]">
            <div>
              <span className="text-slate-400">Request ID:</span>{' '}
              {data.evidence?.requestId || data.evidenceId}
            </div>
            <div>
              <span className="text-slate-400">SSAS Target:</span>{' '}
              {data.source
                ? `${data.source.server} / ${data.source.database} / [${data.source.cube}]`
                : 'localhost:25000 / JDE_SALES_CUBE_20261020 / [JDE Sales]'}
            </div>
            <div>
              <span className="text-slate-400">Units & Date Role:</span>{' '}
              {data.source
                ? `Currency: ${data.source.currency} | Quantity: ${data.source.quantityUnit} | Date Role: ${data.source.dateRole}`
                : 'Currency: USD | Quantity: KG | Date Role: Invoice Date'}
            </div>
            <div>
              <span className="text-slate-400">Grain:</span> {data.evidence?.grain || '—'}
            </div>
            <div className="sm:col-span-2 break-all">
              <span className="text-slate-400">Query Hash:</span>{' '}
              {data.evidence?.queryHash || '—'}
            </div>
          </div>
          {data.evidence?.notes && data.evidence.notes.length > 0 && (
            <ul className="mt-2 pt-2 border-t border-slate-800 text-[11px] text-slate-300 list-disc pl-4 space-y-0.5">
              {data.evidence.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};
