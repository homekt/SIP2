import React, { useEffect, useRef, useState } from 'react';
import type { DashboardResponse } from '../types/sales';
import { fmtCount, fmtPercent, fmtUSD } from '../utils/salesFormat';

interface SalesAiWorkspaceProps {
  context: DashboardResponse | null;
  lang: 'zh-TW' | 'en';
}

interface AiAnalysis {
  observations: string[];
  arithmeticContributions: string[];
  hypotheses: string[];
  evidence: string[];
}

type Phase = 'idle' | 'pending' | 'ok' | 'error';

const STR = {
  'zh-TW': {
    title: 'D07 AI 銷售分析工作區',
    subtitle: '僅使用已驗證的彙總儀表板數據（USD / KG，發票日期）進行受治理結構化分析',
    questionLabel: '分析問題 (Governed Analytical Question)',
    placeholder: '例如：202609 全公司銷售較去年同期變化的主要貢獻來自哪些產品？',
    samples: [
      '本月淨銷售額年增減的主要產品貢獻為何？',
      '毛利率偏低的客戶或產品集中在哪裡？',
      '前五大客戶集中度是否過高？',
    ],
    ask: '執行 AI 分析',
    asking: '分析中…',
    cancel: '取消',
    needContext: '尚無儀表板數據：請先載入任一銷售儀表板，再回到此處提問。',
    cancelled: '已取消此次分析。',
    httpError: '分析請求失敗，請稍後再試。',
    disabled: 'AI 尚未啟用（缺少伺服器端模型設定），核心銷售頁面仍可正常使用。',
    rateLimited: '請求過於頻繁（每分鐘上限 5 次／每日上限 100 次），請稍後再試。',
    observations: '觀測事實 (Observed Facts)',
    contributions: '算術貢獻（可驗證 Arithmetic Contributions）',
    hypotheses: '成因假設（待驗證 Hypotheses）',
    evidence: '證據溯源 (Evidence & Trace)',
    contextTitle: '本次分析使用的受治理儀表板上下文 (Governed Context)',
    empty: '—',
    noResult: '請選擇上方範例問題或輸入問題後點擊「執行 AI 分析」。',
  },
  en: {
    title: 'D07 AI Sales Analysis Workspace',
    subtitle: 'Analyzes only validated aggregate dashboard data (USD / KG, Invoice Date) via governed structured schema',
    questionLabel: 'Analytical Question',
    placeholder: 'E.g. which products drove the YoY change in net sales for 202609?',
    samples: [
      'Which products drove the YoY change in net sales this month?',
      'Where is low gross margin concentrated by customer or product?',
      'Is the top-5 customer concentration too high?',
    ],
    ask: 'Run AI Analysis',
    asking: 'Analyzing…',
    cancel: 'Cancel',
    needContext: 'No dashboard data yet: load any sales dashboard first, then ask here.',
    cancelled: 'This analysis was cancelled.',
    httpError: 'Analysis request failed. Please try again later.',
    disabled: 'AI is not enabled (missing server-side model config); core sales pages still work.',
    rateLimited: 'Too many requests (max 5/min, 100/day). Please try again later.',
    observations: 'Observed Facts',
    contributions: 'Arithmetic Contributions (Verifiable)',
    hypotheses: 'Hypotheses (To Verify)',
    evidence: 'Evidence & Trace',
    contextTitle: 'Governed Dashboard Context Used for This Analysis',
    empty: '—',
    noResult: 'Select a sample prompt above or enter a question and click "Run AI Analysis".',
  },
} as const;

function fmt(v: number | string | null | undefined, empty: string): string {
  if (v === null || v === undefined) return empty;
  return String(v);
}

function Section({
  title,
  badge,
  accentClass,
  items,
  empty,
}: {
  title: string;
  badge: string;
  accentClass: string;
  items: string[];
  empty: string;
}) {
  return (
    <div
      className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 border-l-4 ${accentClass} rounded-xl p-4 shadow-2xs flex flex-col`}
    >
      <div className="flex items-center justify-between mb-2.5">
        <h4 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h4>
        <span className="px-2 py-0.5 rounded text-2xs font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
          {badge} · {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">{empty}</p>
      ) : (
        <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300 list-disc pl-4">
          {items.map((s, i) => (
            <li key={i} className="leading-relaxed">
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const SalesAiWorkspace: React.FC<SalesAiWorkspaceProps> = ({ context, lang }) => {
  const t = STR[lang];
  const isZh = lang === 'zh-TW';
  const [question, setQuestion] = useState<string>(t.samples[0]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<AiAnalysis | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    seqRef.current += 1;
    abortRef.current?.abort();
    setResult(null);
    setPhase('idle');
    setErrorMsg('');
  }, [context]);

  // Abort in-flight requests on unmount; never auto-fetch.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleCancel = () => {
    seqRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase('idle');
    setErrorMsg(t.cancelled);
  };

  const handleAsk = async () => {
    if (phase === 'pending') return;
    if (!context) {
      setPhase('error');
      setErrorMsg(t.needContext);
      return;
    }
    const q = question.trim();
    if (q.length === 0 || q.length > 2000) {
      setPhase('error');
      setErrorMsg(t.httpError);
      return;
    }
    const seq = seqRef.current + 1;
    seqRef.current = seq;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase('pending');
    setErrorMsg('');
    setResult(null);
    try {
      const res = await fetch('/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, context }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (seq !== seqRef.current) return; // stale response: ignore
      if (!res.ok || data?.status !== 'ok' || !data?.analysis) {
        const code = data?.error?.code;
        setPhase('error');
        setErrorMsg(
          code === 'ai_disabled' ? t.disabled : code === 'rate_limited' ? t.rateLimited : t.httpError,
        );
        return;
      }
      const a = data.analysis as AiAnalysis;
      setResult({
        observations: Array.isArray(a.observations) ? a.observations : [],
        arithmeticContributions: Array.isArray(a.arithmeticContributions) ? a.arithmeticContributions : [],
        hypotheses: Array.isArray(a.hypotheses) ? a.hypotheses : [],
        evidence: Array.isArray(a.evidence) ? a.evidence : [],
      });
      setPhase('ok');
    } catch (err) {
      if (seq !== seqRef.current) return; // stale: ignore
      if (err instanceof DOMException && err.name === 'AbortError') {
        setPhase('idle');
        setErrorMsg(t.cancelled);
        return;
      }
      setPhase('error');
      setErrorMsg(t.httpError);
    }
  };

  return (
    <div className="sales-dashboard space-y-4">
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-5 py-4 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">🤖</span>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">{t.title}</h2>
            <span className="px-2 py-0.5 rounded text-2xs font-mono font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              OpenAI Responses API · Strict JSON Schema
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t.subtitle}</p>
        </div>
      </div>

      {/* Governed Context Card (Tier 1) */}
      {context && (
        <div className="bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              {t.contextTitle}
            </h4>
            <span className="text-2xs font-mono text-slate-500 dark:text-slate-400">
              {fmt(context.pageId, t.empty)} · {fmt(context.filters?.month, t.empty)} ·{' '}
              {fmt(context.filters?.company, t.empty)} · {fmt(context.status, t.empty)}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="bg-white dark:bg-slate-800/70 px-3 py-2 rounded-lg border border-slate-200/80 dark:border-slate-700">
              <div className="text-2xs text-slate-500 font-sans">{isZh ? '淨銷售額 (Net Sales)' : 'Net Sales USD'}</div>
              <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                {fmtUSD(context.kpis?.netSalesUSD ?? null)}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800/70 px-3 py-2 rounded-lg border border-slate-200/80 dark:border-slate-700">
              <div className="text-2xs text-slate-500 font-sans">{isZh ? '加權毛利率 (GM%)' : 'Weighted GM %'}</div>
              <div className="font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                {fmtPercent(context.kpis?.grossMarginPercent ?? null)}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800/70 px-3 py-2 rounded-lg border border-slate-200/80 dark:border-slate-700">
              <div className="text-2xs text-slate-500 font-sans">{isZh ? '不重複訂單 (Orders)' : 'Distinct Orders'}</div>
              <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                {fmtCount(context.kpis?.orderCount ?? null)}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800/70 px-3 py-2 rounded-lg border border-slate-200/80 dark:border-slate-700">
              <div className="text-2xs text-slate-500 font-sans">Evidence Hash</div>
              <div className="font-semibold text-slate-700 dark:text-slate-300 mt-0.5 truncate" title={fmt(context.evidence?.queryHash, t.empty)}>
                {fmt(context.evidence?.requestId?.slice(0, 8), t.empty)} / {fmt(context.evidence?.queryHash?.slice(0, 10), t.empty)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Question Input & Sample Chips (Tier 2) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="sales-ai-question" className="text-xs font-bold text-slate-700 dark:text-slate-200">
            {t.questionLabel}
          </label>
          <span className="text-2xs font-mono text-slate-400">
            {question.length} / 2000
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {t.samples.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setQuestion(s)}
              disabled={phase === 'pending'}
              className="px-3 py-1 rounded-full text-xs bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-slate-700 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              💡 {s}
            </button>
          ))}
        </div>

        <textarea
          id="sales-ai-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t.placeholder}
          rows={3}
          maxLength={2000}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500 transition-colors"
        />

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleAsk}
            disabled={phase === 'pending'}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {phase === 'pending' ? t.asking : t.ask}
          </button>
          {phase === 'pending' && (
            <button
              type="button"
              onClick={handleCancel}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            >
              {t.cancel}
            </button>
          )}
        </div>
      </div>

      {/* Results & Status Area (Tier 3) */}
      <div aria-live="polite" className="space-y-3">
        {phase === 'pending' && (
          <div className="bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4 text-xs text-indigo-700 dark:text-indigo-300 font-medium">
            ⏳ {t.asking}
          </div>
        )}
        {phase === 'error' && (
          <div
            role="alert"
            className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-4 text-xs text-rose-700 dark:text-rose-300 font-medium"
          >
            ⚠️ {errorMsg}
          </div>
        )}
        {phase === 'idle' && errorMsg && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-xs text-amber-700 dark:text-amber-300">
            {errorMsg}
          </div>
        )}
        {phase === 'ok' && result && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Section
              title={t.observations}
              badge="FACT"
              accentClass="border-l-blue-500"
              items={result.observations}
              empty={t.empty}
            />
            <Section
              title={t.contributions}
              badge="MATH"
              accentClass="border-l-emerald-500"
              items={result.arithmeticContributions}
              empty={t.empty}
            />
            <Section
              title={t.hypotheses}
              badge="HYPOTHESIS"
              accentClass="border-l-amber-500"
              items={result.hypotheses}
              empty={t.empty}
            />
            <Section
              title={t.evidence}
              badge="TRACE"
              accentClass="border-l-slate-500"
              items={result.evidence}
              empty={t.empty}
            />
          </div>
        )}
        {phase === 'idle' && !errorMsg && !result && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center text-xs text-slate-500 dark:text-slate-400">
            {t.noResult}
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesAiWorkspace;
