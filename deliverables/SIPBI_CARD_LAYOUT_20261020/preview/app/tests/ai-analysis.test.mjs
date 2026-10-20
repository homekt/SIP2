// Muse lane: focused tests for scripts/ai-analysis.mjs.
// Uses ONLY injected fake env + fake fetch. Never reads real credentials,
// never calls the live OpenAI API.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getAiStatus, handleAnalysis, __resetAiRateLimits } from '../scripts/ai-analysis.mjs';

const ENABLED_ENV = { OPENAI_API_KEY: 'fake-key-for-tests', OPENAI_MODEL: 'fake-model' };

function validContext() {
  return {
    status: 'ok',
    pageId: 'D01',
    filters: { month: '202609', company: 'All', product: 'All', customer: 'All', salesperson: 'All', plant: 'All', costCenter: 'All' },
    source: { server: 'localhost:25000', database: 'JDE_CUBE_SYNTHETIC_20261020', cube: 'JDE Sales', dateRole: 'Invoice Date', currency: 'USD', quantityUnit: 'KG', synthetic: true, coverageStart: '202401', coverageEnd: '202609', queriedAt: '2026-10-20T00:00:00.000Z' },
    kpis: { netSalesUSD: 100, grossMarginPercent: 0.2 },
    datasets: { monthly: [], companies: [], products: [], categories: [], customers: [], salespeople: [], plants: [], costCenters: [] },
    analysis: { historyStatus: 'available' },
    evidence: { requestId: 'r1', queryHash: 'h1', grain: 'month', measures: ['netSalesUSD'], dateRole: 'Invoice Date', filters: { month: '202609' }, queriedAt: '2026-10-20T00:00:00.000Z', notes: [] },
  };
}

function okFetch(capture) {
  const analysis = {
    observations: ['sales rose'],
    arithmeticContributions: ['product A contributed +10'],
    hypotheses: ['maybe seasonality'],
    evidence: ['request r1'],
  };
  return async (url, opts) => {
    if (capture) capture.push({ url, opts });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(analysis) }] }],
      }),
    };
  };
}

beforeEach(() => {
  __resetAiRateLimits();
});

describe('getAiStatus', () => {
  it('disabled when nothing configured', () => {
    const s = getAiStatus({});
    assert.equal(s.enabled, false);
    assert.ok(typeof s.reason === 'string' && s.reason.length > 0);
  });
  it('disabled when only one of key/model present', () => {
    assert.equal(getAiStatus({ OPENAI_API_KEY: 'x' }).enabled, false);
    assert.equal(getAiStatus({ OPENAI_MODEL: 'm' }).enabled, false);
  });
  it('enabled when both present', () => {
    assert.deepEqual(getAiStatus(ENABLED_ENV), { enabled: true });
  });
});

describe('handleAnalysis validation', () => {
  it('rejects non-object body', async () => {
    const r = await handleAnalysis({ body: null, env: ENABLED_ENV, ip: 'v1' });
    assert.equal(r.statusCode, 400);
    assert.equal(r.body.status, 'error');
  });
  it('rejects unknown body fields (no raw query/code passthrough)', async () => {
    const body = { question: 'q', context: validContext(), mdx: 'SELECT ...' };
    const r = await handleAnalysis({ body, env: ENABLED_ENV, ip: 'v2' });
    assert.equal(r.statusCode, 400);
  });
  it('rejects empty and overlong questions', async () => {
    const e = await handleAnalysis({ body: { question: '  ', context: validContext() }, env: ENABLED_ENV, ip: 'v3' });
    assert.equal(e.statusCode, 400);
    const long = await handleAnalysis({ body: { question: 'x'.repeat(2001), context: validContext() }, env: ENABLED_ENV, ip: 'v3' });
    assert.equal(long.statusCode, 400);
    assert.equal(long.body.error.code, 'invalid_question');
  });
  it('rejects forbidden context fields (sql/credentials)', async () => {
    const ctx = validContext();
    ctx.sql = 'SELECT * FROM t';
    const r = await handleAnalysis({ body: { question: 'q', context: ctx }, env: ENABLED_ENV, ip: 'v4' });
    assert.equal(r.statusCode, 400);
    assert.equal(r.body.error.code, 'invalid_context');
  });
  it('rejects credential-like values in context', async () => {
    const ctx = validContext();
    ctx.evidence.notes = ['leaked sk-abcdefgh12345678'];
    const r = await handleAnalysis({ body: { question: 'q', context: ctx }, env: ENABLED_ENV, ip: 'v5' });
    assert.equal(r.statusCode, 400);
  });
  it('rejects unknown filter keys', async () => {
    const ctx = validContext();
    ctx.filters.day = 'All';
    const r = await handleAnalysis({ body: { question: 'q', context: ctx }, env: ENABLED_ENV, ip: 'v6' });
    assert.equal(r.statusCode, 400);
  });
});

describe('handleAnalysis disabled + upstream', () => {
  it('returns disabled 503 without calling fetch', async () => {
    let called = 0;
    const r = await handleAnalysis({
      body: { question: 'Why did sales move?', context: validContext() },
      env: {},
      ip: 'd1',
      fetchImpl: async () => { called += 1; throw new Error('must not be called'); },
    });
    assert.equal(r.statusCode, 503);
    assert.equal(r.body.error.code, 'ai_disabled');
    assert.equal(called, 0);
  });
  it('success returns the four analysis arrays', async () => {
    const r = await handleAnalysis({
      body: { question: 'Why did sales move?', context: validContext() },
      env: ENABLED_ENV,
      ip: 's1',
      fetchImpl: okFetch(),
    });
    assert.equal(r.statusCode, 200);
    assert.equal(r.body.status, 'ok');
    for (const k of ['observations', 'arithmeticContributions', 'hypotheses', 'evidence']) {
      assert.ok(Array.isArray(r.body.analysis[k]), k);
      assert.ok(r.body.analysis[k].every((s) => typeof s === 'string'), k);
    }
  });
  it('posts to Responses API with json_schema format, token cap, and auth header', async () => {
    const capture = [];
    await handleAnalysis({
      body: { question: 'Why?', context: validContext() },
      env: ENABLED_ENV,
      ip: 's2',
      fetchImpl: okFetch(capture),
    });
    assert.equal(capture.length, 1);
    const { url, opts } = capture[0];
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(opts.method, 'POST');
    assert.equal(opts.headers['Content-Type'], 'application/json');
    assert.equal(opts.headers.Authorization, 'Bearer fake-key-for-tests');
    const payload = JSON.parse(opts.body);
    assert.equal(payload.model, 'fake-model');
    assert.equal(payload.max_output_tokens, 1500);
    assert.equal(payload.text.format.type, 'json_schema');
    assert.equal(payload.text.format.strict, true);
  });
  it('maps upstream HTTP failure to 502 without leaking the key', async () => {
    const r = await handleAnalysis({
      body: { question: 'Why?', context: validContext() },
      env: ENABLED_ENV,
      ip: 's3',
      fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    });
    assert.equal(r.statusCode, 502);
    assert.ok(!JSON.stringify(r.body).includes('fake-key-for-tests'));
  });
  it('maps abort/timeout to 504', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    const r = await handleAnalysis({
      body: { question: 'Why?', context: validContext() },
      env: ENABLED_ENV,
      ip: 's4',
      fetchImpl: async () => { throw abortErr; },
    });
    assert.equal(r.statusCode, 504);
  });
  it('maps unparseable model output to 502', async () => {
    const r = await handleAnalysis({
      body: { question: 'Why?', context: validContext() },
      env: ENABLED_ENV,
      ip: 's5',
      fetchImpl: async () => ({
        ok: true, status: 200, json: async () => ({ output: [{ content: [{ text: 'not json' }] }] }),
      }),
    });
    assert.equal(r.statusCode, 502);
  });
});

describe('handleAnalysis rate limits', () => {
  it('allows 5 per minute per IP, rejects the 6th with 429', async () => {
    const Moraine = 1_700_000_000_000;
    for (let i = 0; i < 5; i += 1) {
      const r = await handleAnalysis({
        body: { question: `q${i}`, context: validContext() },
        env: ENABLED_ENV, ip: 'rl-ip', fetchImpl: okFetch(), Moraine: Moraine + i * 1000,
      });
      assert.equal(r.statusCode, 200);
    }
    const limited = await handleAnalysis({
      body: { question: 'q5', context: validContext() },
      env: ENABLED_ENV, ip: 'rl-ip', fetchImpl: okFetch(), Moraine: Moraine + 5000,
    });
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.body.error.code, 'rate_limited');
  });
  it('does not count invalid requests against the quota', async () => {
    const Moraine = 1_700_000_100_000;
    for (let i = 0; i < 10; i += 1) {
      await handleAnalysis({ body: { question: '', context: validContext() }, env: ENABLED_ENV, ip: 'rl-ip2', fetchImpl: okFetch(), Moraine });
    }
    const r = await handleAnalysis({
      body: { question: 'valid?', context: validContext() },
      env: ENABLED_ENV, ip: 'rl-ip2', fetchImpl: okFetch(), Moraine,
    });
    assert.equal(r.statusCode, 200);
  });
});
