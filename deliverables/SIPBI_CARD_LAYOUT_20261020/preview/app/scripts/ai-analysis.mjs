// Muse lane: AI analysis module (server-side only).
// No credentials are read at import time; env is injected per call so tests
// can use fake env objects. Never log or echo credential values.

const RESPONSES_URL = 'https://api.openai.com/v1/responses';
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_TOKENS = 1500;
const MAX_QUESTION_CHARS = 2000;
const PER_IP_WINDOW_MS = 60_000;
const PER_IP_MAX = 5;
const GLOBAL_WINDOW_MS = 86_400_000;
const GLOBAL_MAX = 100;

const SCHEMA_NAME = 'sales_ai_analysis';

// In-memory rate-limit state (per server process).
const ipHits = new Map(); // ip -> number[] timestamps
let globalHits = []; // number[] timestamps

export function __resetAiRateLimits() {
  ipHits.clear();
  globalHits = [];
}

function prune(arr, cutoff) {
  return arr.filter((t) => t > cutoff);
}

function missingConfig(env) {
  const hasKey = typeof env?.OPENAI_API_KEY === 'string' && env.OPENAI_API_KEY.trim().length > 0;
  const hasModel = typeof env?.OPENAI_MODEL === 'string' && env.OPENAI_MODEL.trim().length > 0;
  if (hasKey && hasModel) return null;
  if (!hasKey && !hasModel) return 'OPENAI_API_KEY and OPENAI_MODEL are not configured';
  if (!hasKey) return 'OPENAI_API_KEY is not configured';
  return 'OPENAI_MODEL is not configured';
}

export function getAiStatus(env = process.env) {
  const reason = missingConfig(env);
  if (reason) return { enabled: false, reason };
  return { enabled: true };
}

// ---- request validation ----

const ALLOWED_BODY_KEYS = new Set(['question', 'context']);
const ALLOWED_CONTEXT_KEYS = new Set([
  'status', 'pageId', 'filters', 'source', 'kpis', 'datasets', 'analysis', 'evidence',
]);
const ALLOWED_FILTER_KEYS = new Set([
  'month', 'company', 'product', 'customer', 'salesperson', 'plant', 'costCenter',
]);
const ALLOWED_DATASET_KEYS = new Set([
  'monthly', 'companies', 'products', 'categories', 'customers',
  'salespeople', 'plants', 'costCenters',
]);
// Raw query / code / credential material must never ride along in the payload.
const FORBIDDEN_KEY = new Set([
  'mdx', 'mdxquery', 'sql', 'sqlquery', 'dax',
  'query', 'querystring', 'statement', 'command',
  'connectionstring', 'connection', 'datasource', 'server', 'uid', 'pwd',
  'password', 'secret', 'secrets', 'apikey', 'api_key', 'token', 'credential', 'credentials',
]);
// NOTE: 'server' above is intentionally NOT forbidden: Source.server is a public
// aggregate field (SSAS host name). Connection secrets are covered by the rest.
// Forbidden detection therefore skips the known public Source shape (see below).
const PUBLIC_SOURCE_KEYS = new Set([
  'server', 'database', 'cube', 'dateRole', 'currency', 'quantityUnit',
  'synthetic', 'coverageStart', 'coverageEnd', 'queriedAt',
]);
const SECRET_VALUE_RE = /\bsk-[A-Za-z0-9_-]{8,}\b|openai_api_key|api[_-]?key\s*[:=]|password\s*[:=]|connection\s*string|bearer\s+[A-Za-z0-9\-._~+/=]{8,}/i;

function normKey(k) {
  return String(k).toLowerCase().replace(/[_\s-]+/g, '');
}

function scanForbidden(node, path, inPublicSource) {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      const hit = scanForbidden(node[i], `${path}[${i}]`, false);
      if (hit) return hit;
    }
    return null;
  }
  if (node !== null && typeof node === 'object') {
    for (const key of Object.keys(node)) {
      const nk = normKey(key);
      const isPublicSourceField = inPublicSource && PUBLIC_SOURCE_KEYS.has(key);
      if (!isPublicSourceField && FORBIDDEN_KEY.has(nk)) {
        return `forbidden field '${key}' at ${path}`;
      }
      const childInPublicSource =
        (key === 'source' && (path === 'context' || path === '')) ||
        (inPublicSource && isPublicSourceField);
      const hit = scanForbidden(node[key], path ? `${path}.${key}` : key, childInPublicSource);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof node === 'string' && SECRET_VALUE_RE.test(node)) {
    return `credential-like value at ${path}`;
  }
  return null;
}

function error(statusCode, code, message) {
  return { statusCode, body: { status: 'error', error: { code, message } } };
}

function validateBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return error(400, 'invalid_request', 'Request body must be a JSON object.');
  }
  for (const key of Object.keys(body)) {
    if (!ALLOWED_BODY_KEYS.has(key)) {
      return error(400, 'invalid_request', `Unknown field '${key}'. Only 'question' and 'context' are accepted.`);
    }
  }
  const { question, context } = body;
  if (typeof question !== 'string' || question.trim().length === 0) {
    return error(400, 'invalid_question', 'question must be a non-empty string.');
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return error(400, 'invalid_question', `question must be at most ${MAX_QUESTION_CHARS} characters.`);
  }
  if (SECRET_VALUE_RE.test(question)) {
    return error(400, 'invalid_question', 'question must not contain keys, secrets, or credentials.');
  }
  if (context === null || typeof context !== 'object' || Array.isArray(context)) {
    return error(400, 'invalid_context', 'context must be a DashboardResponse object.');
  }
  for (const key of Object.keys(context)) {
    if (!ALLOWED_CONTEXT_KEYS.has(key)) {
      return error(400, 'invalid_context', `context field '${key}' is not a public aggregate.`);
    }
  }
  if (context.filters !== undefined) {
    if (context.filters === null || typeof context.filters !== 'object' || Array.isArray(context.filters)) {
      return error(400, 'invalid_context', 'context.filters must be an object.');
    }
    for (const key of Object.keys(context.filters)) {
      if (!ALLOWED_FILTER_KEYS.has(key)) {
        return error(400, 'invalid_context', `context filter '${key}' is not a public filter.`);
      }
    }
  }
  if (context.datasets !== undefined) {
    if (context.datasets === null || typeof context.datasets !== 'object' || Array.isArray(context.datasets)) {
      return error(400, 'invalid_context', 'context.datasets must be an object.');
    }
    for (const key of Object.keys(context.datasets)) {
      if (!ALLOWED_DATASET_KEYS.has(key)) {
        return error(400, 'invalid_context', `context dataset '${key}' is not a public dataset.`);
      }
    }
  }
  const hit = scanForbidden(context, 'context', false);
  if (hit) {
    return error(400, 'invalid_context', `context must contain only public aggregates/evidence: ${hit}.`);
  }
  return null;
}

// ---- OpenAI Responses API ----

function buildInput(question, context) {
  const contextJson = JSON.stringify(context);
  return [
    {
      role: 'system',
      content: [
        {
          type: 'input_text',
          text: 'You are a sales BI analyst. You receive ONLY pre-aggregated public dashboard metrics (USD, KG, Invoice Date grain) plus evidence metadata. '
            + 'Distinguish observed arithmetic (sums, shares, deltas computed from the numbers) from hypotheses (possible causes, explicitly labeled as hypotheses). '
            + 'Never invent order IDs, customers, products, thresholds, or external benchmarks. '
            + 'Never claim budget/BMI/BCG data unless present in the context. '
            + 'Respond with exactly the four JSON arrays defined by the schema. No markdown, no extra text.',
        },
      ],
    },
    {
      role: 'user',
      content: [
        { type: 'input_text', text: `Question: ${question}\n\nDashboard context (public aggregates only):\n${contextJson}` },
      ],
    },
  ];
}

function responseSchema() {
  const arr = {
    type: 'array',
    items: { type: 'string' },
  };
  return {
    type: 'object',
    properties: {
      observations: arr,
      arithmeticContributions: arr,
      hypotheses: arr,
      evidence: arr,
    },
    required: ['observations', 'arithmeticContributions', 'hypotheses', 'evidence'],
    additionalProperties: false,
  };
}

function extractOutputText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.length > 0) {
    return data.output_text;
  }
  const chunks = [];
  const outputs = Array.isArray(data?.output) ? data.output : [];
  for (const item of outputs) {
    const contents = Array.isArray(item?.content) ? item.content : [];
    for (const part of contents) {
      if (typeof part?.text === 'string' && part.text.length > 0) {
        chunks.push(part.text);
      }
    }
    if (typeof item?.text === 'string' && item.text.length > 0) {
      chunks.push(item.text);
    }
  }
  return chunks.join('');
}

function isStringArray(v) {
  return Array.isArray(v) && v.every((s) => typeof s === 'string');
}

/**
 * @param {{body: unknown, ip?: string, env?: NodeJS.ProcessEnv|Record<string,string|undefined>, fetchImpl?: typeof fetch, now?: number}} args
 * @returns {Promise<{statusCode: number, body: unknown}>}
 */
export async function handleAnalysis(args) {
  const { body, ip, env = process.env, fetchImpl = globalThis.fetch, now = Date.now() } = args ?? {};

  const invalid = validateBody(body);
  if (invalid) return invalid;

  const disabledReason = missingConfig(env);
  if (disabledReason) {
    return error(503, 'ai_disabled', `AI analysis is disabled: ${disabledReason}.`);
  }

  // Rate limits (count only requests that reach this point).
  const nowTs = typeof now === 'number' ? now : Date.now();
  globalHits = prune(globalHits, nowTs - GLOBAL_WINDOW_MS);
  const ipKey = typeof ip === 'string' && ip.length > 0 ? ip : 'unknown';
  const recentHits = prune(ipHits.get(ipKey) ?? [], nowTs - PER_IP_WINDOW_MS);
  if (recentHits.length >= PER_IP_MAX) {
    return error(429, 'rate_limited', 'Per-IP rate limit exceeded (5 requests per minute).');
  }
  if (globalHits.length >= GLOBAL_MAX) {
    return error(429, 'rate_limited', 'Global daily analysis quota exceeded (100 per day).');
  }
  recentHits.push(nowTs);
  ipHits.set(ipKey, recentHits);
  globalHits.push(nowTs);

  const { question, context } = body;
  const payload = {
    model: env.OPENAI_MODEL,
    input: buildInput(question, context),
    text: {
      format: {
        type: 'json_schema',
        name: SCHEMA_NAME,
        strict: true,
        schema: responseSchema(),
      },
    },
    max_output_tokens: MAX_OUTPUT_TOKENS,
    store: false,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  let data;
  try {
    res = await fetchImpl(RESPONSES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (res?.ok) data = await res.json();
  } catch (err) {
    if (err?.name === 'AbortError' || controller.signal.aborted) {
      return error(504, 'ai_upstream_timeout', 'AI upstream request timed out after 60s.');
    }
    return error(502, 'ai_upstream_error', 'AI upstream request failed.');
  } finally {
    clearTimeout(timer);
  }

  if (!res || !res.ok) {
    return error(502, 'ai_upstream_error', `AI upstream returned status ${res?.status ?? 'unknown'}.`);
  }

  let parsed;
  try {
    parsed = JSON.parse(extractOutputText(data));
  } catch {
    return error(502, 'ai_upstream_error', 'AI upstream returned unparseable structured output.');
  }

  if (
    parsed === null || typeof parsed !== 'object' || Array.isArray(parsed) ||
    !isStringArray(parsed.observations) || !isStringArray(parsed.arithmeticContributions) ||
    !isStringArray(parsed.hypotheses) || !isStringArray(parsed.evidence)
  ) {
    return error(502, 'ai_upstream_error', 'AI upstream returned an invalid analysis shape.');
  }

  // Output is data for display only; the caller must never execute it.
  return {
    statusCode: 200,
    body: {
      status: 'ok',
      analysis: {
        observations: parsed.observations,
        arithmeticContributions: parsed.arithmeticContributions,
        hypotheses: parsed.hypotheses,
        evidence: parsed.evidence,
      },
    },
  };
}
