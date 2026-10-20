import React, { useEffect, useRef, useState } from 'react';
import type { DashboardResponse } from '../types/sales';

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
    title: 'AI 銷售分析',
    subtitle: '僅使用已驗證的彙總儀表板數據（USD / KG，發票日期）進行分析',
    questionLabel: '問題',
    placeholder: '例如：202609 全公司銷售較去年同期變化的主要贡献來自哪些產品？',
    samples: [
      '本月淨銷售額年增減的主要產品貢獻為何？',
      '毛利率偏低的客戶或產品集中在哪裡？',
      '前五大客戶集中度是否過高？',
    ],
    ask: '執行分析',
    asking: '分析中…',
    cancel: '取消',
    needContext: '尚無儀表板數據：請先載入任一銷售儀表板，再回到此處提問。',
    cancelled: '已取消此次分析。',
    httpError: '分析請求失敗，請稍後再試。',
    disabled: 'AI 尚未啟用（缺少伺服器端模型設定），核心銷售頁面仍可正常使用。',
    rateLimited: '請求過於頻繁，請稍後再試。',
    observations: '觀察',
    contributions: '算術貢獻（可驗證）',
    hypotheses: '假設（待驗證）',
    evidence: '證據',
    contextTitle: '本次分析使用的儀表板上下文',
    empty: '—',
    noResult: '尚無分析結果。',
  },
  en: {
    title: 'AI Sales Analysis',
    subtitle: 'Analyzes only validated aggregate dashboard data (USD / KG, Invoice Date)',
    questionLabel: 'Question',
    placeholder: 'E.g. which products drove the YoY change in net sales for 202609?',
    samples: [
      'Which products drove the YoY change in net sales this month?',
      'Where is low gross margin concentrated by customer or product?',
      'Is the top-5 customer concentration too high?',
    ],
    ask: 'Run analysis',
    asking: 'Analyzing…',
    cancel: 'Cancel',
    needContext: 'No dashboard data yet: load any sales dashboard first, then ask here.',
    cancelled: 'This analysis was cancelled.',
    httpError: 'Analysis request failed. Please try again later.',
    disabled: 'AI is not enabled (missing server-side model config); core sales pages still work.',
    rateLimited: 'Too many requests. Please try again later.',
    observations: 'Observations',
    contributions: 'Arithmetic contributions (verifiable)',
    hypotheses: 'Hypotheses (to verify)',
    evidence: 'Evidence',
    contextTitle: 'Dashboard context used for this analysis',
    empty: '—',
    noResult: 'No analysis result yet.',
  },
} as const;

function fmt(v: number | string | null | undefined, empty: string): string {
  if (v === null || v === undefined) return empty;
  return String(v);
}

function Section({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <h4>{title}</h4>
      {items.length === 0 ? (
        <p>{empty}</p>
      ) : (
        <ul>
          {items.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

const SalesAiWorkspace: React.FC<SalesAiWorkspaceProps> = ({ context, lang }) => {
  const t = STR[lang];
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
    <div>
      <div>
        <h2>{t.title}</h2>
        <p>{t.subtitle}</p>
      </div>

      <div>
        <label htmlFor="sales-ai-question">{t.questionLabel}</label>
        <div>
          {t.samples.map((s) => (
            <button key={s} type="button" onClick={() => setQuestion(s)} disabled={phase === 'pending'}>
              {s}
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
        />
        <div>
          <button type="button" onClick={handleAsk} disabled={phase === 'pending'}>
            {phase === 'pending' ? t.asking : t.ask}
          </button>
          {phase === 'pending' && (
            <button type="button" onClick={handleCancel}>
              {t.cancel}
            </button>
          )}
        </div>
      </div>

      {context && (
        <div>
          <h4>{t.contextTitle}</h4>
          <p>
            {fmt(context.pageId, t.empty)} · {fmt(context.filters?.month, t.empty)} ·{' '}
            {fmt(context.filters?.company, t.empty)} · {fmt(context.status, t.empty)}
          </p>
          <p>
            netSalesUSD: {fmt(context.kpis?.netSalesUSD, t.empty)} · grossMargin:{' '}
            {fmt(context.kpis?.grossMarginPercent, t.empty)} · evidence:{' '}
            {fmt(context.evidence?.requestId, t.empty)} / {fmt(context.evidence?.queryHash, t.empty)}
          </p>
        </div>
      )}

      <div aria-live="polite">
        {phase === 'pending' && <p>{t.asking}</p>}
        {phase === 'error' && <p role="alert">{errorMsg}</p>}
        {phase === 'idle' && errorMsg && <p>{errorMsg}</p>}
        {phase === 'ok' && result && (
          <div>
            <Section title={t.observations} items={result.observations} empty={t.empty} />
            <Section title={t.contributions} items={result.arithmeticContributions} empty={t.empty} />
            <Section title={t.hypotheses} items={result.hypotheses} empty={t.empty} />
            <Section title={t.evidence} items={result.evidence} empty={t.empty} />
          </div>
        )}
        {phase === 'idle' && !errorMsg && !result && <p>{t.noResult}</p>}
      </div>
    </div>
  );
};

export default SalesAiWorkspace;
