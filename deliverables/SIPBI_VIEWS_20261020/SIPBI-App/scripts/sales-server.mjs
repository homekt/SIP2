/**
 * Sales BI HTTP server. Static files and /api on one origin. No wildcard CORS.
 * Cube work goes through scripts/sales-query.ps1 via execFile -File.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildDashboard,
  buildDrilldown,
  buildNoData,
  bundleRequest,
  checkMembers,
  normalizeMembers,
  pagesFor,
  parseSearch,
  resolvePage
} from './sales-domain.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2'
};

const SHELLS = new Set(['powershell.exe', 'powershell', 'pwsh.exe', 'pwsh']);

function assertHost(value, label) {
  const pattern = label === 'server' ? /^[A-Za-z0-9_.:\\-]{1,80}$/ : /^[A-Za-z0-9_]{1,128}$/;
  if (!pattern.test(value)) {
    const error = new Error('invalid source config');
    error.code = 'invalid_config';
    throw error;
  }
}

export function sourceConfigFrom(env = process.env, overrides = {}) {
  const server = overrides.server || env.SIPBI_SSAS_SERVER || 'localhost:25000';
  const database = overrides.database || env.SIPBI_SSAS_DATABASE || 'JDE_SALES_CUBE_20261020';
  assertHost(server, 'server');
  assertHost(database, 'database');
  return { server, database, cube: 'JDE Sales' };
}

export function buildPowerShellArgs(scriptPath, request) {
  const mode = request.kind === 'members' ? 'members' : request.kind === 'status' ? 'status' : 'bundle';
  const args = ['-NoProfile', '-File', scriptPath, '-Mode', mode];
  if (mode === 'bundle') {
    const filters = request.filters;
    args.push(
      '-Month', filters.month,
      '-Company', filters.company,
      '-Product', filters.product,
      '-Customer', filters.customer,
      '-Salesperson', filters.salesperson,
      '-Plant', filters.plant,
      '-CostCenter', filters.costCenter,
      '-PriorMonth', request.priorMonth || '',
      '-YtdMonths', request.ytdMonths || '',
      '-Rolling3Months', request.rolling3Months || '',
      '-Rolling12Months', request.rolling12Months || '',
      '-MonthlyMonths', request.monthlyMonths || '',
      '-AnalysisServer', request.server,
      '-Database', request.database,
      '-Cube', 'JDE Sales'
    );
  } else {
    args.push('-AnalysisServer', request.server, '-Database', request.database, '-Cube', 'JDE Sales');
  }
  return args;
}

function parseJsonText(stdout) {
  const text = String(stdout || '').replace(/^\uFEFF/, '').trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* extract below */ }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
  }
  return null;
}

export function createPowerShellQuery(options) {
  const scriptPath = options.scriptPath;
  const shell = options.powershell || 'powershell.exe';
  if (!SHELLS.has(shell)) {
    const error = new Error('powershell host is not allowed');
    error.code = 'invalid_config';
    throw error;
  }
  const timeout = options.timeoutMs || 120000;
  return function query(request) {
    const args = buildPowerShellArgs(scriptPath, request);
    return new Promise((resolve) => {
      execFile(shell, args, {
        cwd: options.cwd || rootDir,
        encoding: 'utf8',
        timeout,
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true
      }, (err, stdout) => {
        const parsed = parseJsonText(stdout);
        if (parsed && parsed.status === 'ok' && !err) {
          resolve({ ok: true, ...parsed });
          return;
        }
        if (parsed && parsed.status === 'error') {
          const code = parsed.error && parsed.error.code === 'source_timeout'
            ? 'source_timeout'
            : parsed.error && parsed.error.code === 'invalid_parameter'
              ? 'invalid_parameter'
              : 'source_unavailable';
          resolve({ ok: false, code });
          return;
        }
        if (err && err.killed) {
          resolve({ ok: false, code: 'source_timeout' });
          return;
        }
        resolve({ ok: false, code: 'source_unavailable' });
      });
    });
  };
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function errorBody(code, message) {
  return { status: 'error', error: { code, message } };
}

function sourceHttp(code) {
  if (code === 'source_timeout') return { status: 504, code: 'source_timeout', message: 'The cube query timed out.' };
  if (code === 'invalid_parameter') return { status: 500, code: 'internal_error', message: 'The request failed.' };
  return { status: 503, code: 'source_unavailable', message: 'The sales cube is unavailable.' };
}

function lruSet(map, key, value, max) {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > max) map.delete(map.keys().next().value);
}

function resolveStatic(distDir, urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath.split('?')[0]); } catch { return { error: true }; }
  if (decoded.includes('\0') || decoded.includes('\\') || decoded.includes(':')) return { error: true };
  const parts = decoded.split('/').filter(Boolean);
  if (parts.some((part) => part === '..' || part === '.')) return { error: true };
  const root = path.resolve(distDir);
  const full = path.resolve(root, ...parts);
  if (full !== root && !full.startsWith(root + path.sep)) return { error: true };
  return { full };
}

function currentIso(now) {
  const value = now ? now() : Date.now();
  return typeof value === 'string' ? value : new Date(value).toISOString();
}

function sourceEnvelope(config, queriedAt) {
  return {
    server: config.server,
    database: config.database,
    cube: config.cube,
    dateRole: 'Invoice Date',
    currency: 'USD',
    quantityUnit: 'KG',
    synthetic: true,
    coverageStart: '202401',
    coverageEnd: '202609',
    queriedAt
  };
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error('too_large');
      error.code = 'too_large';
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function fallbackAi() {
  return {
    getAiStatus() {
      return { enabled: false, reason: 'module_unavailable' };
    },
    async handleAnalysis() {
      return {
        statusCode: 503,
        body: errorBody('ai_disabled', 'AI analysis is not configured.')
      };
    }
  };
}

function sanitizeOutbound(body) {
  if (!body || typeof body !== 'object') return errorBody('upstream_error', 'AI analysis failed.');
  const json = JSON.stringify(body, (key, value) => {
    if (key === 'stack' || key === 'stderr' || key === 'stdout') return undefined;
    if (typeof value === 'string' && (/\bsk-[A-Za-z0-9_-]{8,}\b/.test(value) || /Provider=/i.test(value))) return '[redacted]';
    return value;
  });
  return JSON.parse(json);
}

export function createSalesServer(options = {}) {
  const config = options.sourceConfig || sourceConfigFrom(options.env || process.env, options);
  const distDir = options.distDir || path.join(rootDir, 'frontend', 'dist');
  const rawQuery = options.query || createPowerShellQuery({
    scriptPath: options.scriptPath || path.join(__dirname, 'sales-query.ps1'),
    powershell: options.powershell,
    timeoutMs: options.timeoutMs,
    cwd: rootDir
  });
  const query = async (request) => {
    try { return await rawQuery(request); }
    catch { return {ok:false,code:'source_unavailable'}; }
  };
  const bundleCache = new Map();
  const inflight = new Map();
  let memberCache = null;
  let memberCacheExpires = 0;

  function coalesce(key, factory) {
    const existing = inflight.get(key);
    if (existing) return existing;
    const promise = Promise.resolve().then(factory).finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  }

  async function aiModule() {
    if (options.ai) return options.ai;
    try {
      return await import('./ai-analysis.mjs');
    } catch {
      return fallbackAi();
    }
  }

  async function aiStatus() {
    try {
      const mod = await aiModule();
      const status = mod.getAiStatus(options.env || process.env);
      if (!status || status.enabled !== true || typeof mod.handleAnalysis !== 'function') {
        return { enabled: false, reason: (status && status.reason) || 'disabled' };
      }
      return { enabled: true };
    } catch {
      return { enabled: false, reason: 'module_unavailable' };
    }
  }

  async function loadMembers() {
    if (memberCache && Date.now() < memberCacheExpires) return memberCache;
    return coalesce('members', async () => {
      if (memberCache && Date.now() < memberCacheExpires) return memberCache;
      const result = await query({ kind: 'members', server: config.server, database: config.database });
      if (!result.ok) {
        const error = new Error('members failed');
        error.code = result.code || 'source_unavailable';
        throw error;
      }
      memberCache = normalizeMembers(result);
      memberCacheExpires = Date.now() + 300_000;
      if (!memberCache.queriedAt) memberCache.queriedAt = currentIso(options.now);
      return memberCache;
    });
  }

  async function loadBundle(request) {
    const key = JSON.stringify(request);
    const cached = bundleCache.get(key);
    if (cached && Date.now() < cached.expiresAt) return cached.result;
    return coalesce('bundle:' + key, async () => {
      const cached = bundleCache.get(key);
      if (cached && Date.now() < cached.expiresAt) return cached.result;
      const result = await query(request);
      if (!result.ok) {
        const error = new Error('bundle failed');
        error.code = result.code || 'source_unavailable';
        throw error;
      }
      lruSet(bundleCache, key, {result, expiresAt: Date.now() + 30_000}, 64);
      return result;
    });
  }

  async function respondDashboard(res, pageId, filters, catalog) {
    const memberCheck = checkMembers(filters, catalog);
    if (!memberCheck.ok) {
      sendJson(res, 400, errorBody(memberCheck.error.code, memberCheck.error.message));
      return;
    }
    const requestId = randomUUID();
    if (!memberCheck.monthInCube) {
      sendJson(res, 200, buildNoData({
        pageId,
        filters,
        requestId,
        source: sourceEnvelope(config, catalog.queriedAt || currentIso(options.now))
      }));
      return;
    }
    const request = bundleRequest(filters, config);
    const raw = await loadBundle(request);
    const queriedAt = raw.queriedAt || currentIso(options.now);
    sendJson(res, 200, buildDashboard({
      pageId,
      filters,
      requestId,
      raw,
      catalog,
      source: sourceEnvelope(config, queriedAt)
    }));
  }

  async function respondDrilldown(res, groupBy, filters, catalog) {
    const memberCheck = checkMembers(filters, catalog);
    if (!memberCheck.ok) {
      sendJson(res, 400, errorBody(memberCheck.error.code, memberCheck.error.message));
      return;
    }
    const requestId = randomUUID();
    if (!memberCheck.monthInCube) {
      sendJson(res, 200, buildNoData({
        groupBy,
        filters,
        requestId,
        source: sourceEnvelope(config, catalog.queriedAt || currentIso(options.now))
      }));
      return;
    }
    const raw = await loadBundle(bundleRequest(filters, config));
    sendJson(res, 200, buildDrilldown({
      groupBy,
      filters,
      requestId,
      raw,
      catalog,
      source: sourceEnvelope(config, raw.queriedAt || currentIso(options.now))
    }));
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (res.headersSent) return;
      if (err && err.code === 'too_large') {
        sendJson(res, 400, errorBody('invalid_body', 'The request body is too large.'));
        return;
      }
      const mapped = sourceHttp(err && err.code);
      if (err && (err.code === 'source_timeout' || err.code === 'source_unavailable' || err.code === 'invalid_parameter')) {
        sendJson(res, mapped.status, errorBody(mapped.code, mapped.message));
        return;
      }
      sendJson(res, 500, errorBody('internal_error', 'The request failed.'));
    });
  });

  async function handle(req, res) {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { Allow: 'GET, POST, OPTIONS', 'X-Content-Type-Options': 'nosniff' });
      res.end();
      return;
    }

    if (url.pathname === '/api/health') {
      if (req.method !== 'GET') {
        sendJson(res, 405, errorBody('method_not_allowed', 'Method not allowed.'));
        return;
      }
      sendJson(res, 200, { status: 'ok', scope: 'process', service: 'sipbi-sales' });
      return;
    }

    if (url.pathname === '/api/source/status') {
      if (req.method !== 'GET') {
        sendJson(res, 405, errorBody('method_not_allowed', 'Method not allowed.'));
        return;
      }
      const result = await query({ kind: 'status', server: config.server, database: config.database });
      if (!result.ok) {
        const mapped = sourceHttp(result.code);
        sendJson(res, mapped.status, { ...errorBody(mapped.code, mapped.message), ready: false });
        return;
      }
      sendJson(res, 200, {
        status: 'ok',
        ready: true,
        probe: { salesLineCount: result.salesLineCount ?? null, orderCount: result.orderCount ?? null },
        source: sourceEnvelope(config, result.queriedAt || currentIso(options.now))
      });
      return;
    }

    if (url.pathname === '/api/metadata') {
      if (req.method !== 'GET') {
        sendJson(res, 405, errorBody('method_not_allowed', 'Method not allowed.'));
        return;
      }
      const [catalog, ai] = await Promise.all([loadMembers(), aiStatus()]);
      sendJson(res, 200, {
        status: 'ok',
        source: sourceEnvelope(config, catalog.queriedAt || currentIso(options.now)),
        months: catalog.months,
        members: catalog.members,
        pages: pagesFor(ai.enabled),
        ai: ai.enabled ? { enabled: true } : { enabled: false, reason: ai.reason || 'disabled' }
      });
      return;
    }

    const dashboardMatch = url.pathname.match(/^\/api\/dashboards\/([^/]+)$/);
    if (dashboardMatch) {
      if (req.method !== 'GET') {
        sendJson(res, 405, errorBody('method_not_allowed', 'Method not allowed.'));
        return;
      }
      const parsed = parseSearch(url.search, 'dashboard');
      if (!parsed.ok) {
        sendJson(res, 400, errorBody(parsed.error.code, parsed.error.message));
        return;
      }
      const ai = await aiStatus();
      const page = resolvePage(dashboardMatch[1], ai.enabled);
      if (!page.ok) {
        sendJson(res, 400, errorBody(page.error.code, page.error.message));
        return;
      }
      const catalog = await loadMembers();
      await respondDashboard(res, page.pageId, parsed.filters, catalog);
      return;
    }

    if (url.pathname === '/api/drilldown') {
      if (req.method !== 'GET') {
        sendJson(res, 405, errorBody('method_not_allowed', 'Method not allowed.'));
        return;
      }
      const parsed = parseSearch(url.search, 'drilldown');
      if (!parsed.ok) {
        sendJson(res, 400, errorBody(parsed.error.code, parsed.error.message));
        return;
      }
      const catalog = await loadMembers();
      await respondDrilldown(res, parsed.groupBy, parsed.filters, catalog);
      return;
    }

    if (url.pathname === '/api/analysis') {
      if (req.method !== 'POST') {
        sendJson(res, 405, errorBody('method_not_allowed', 'Method not allowed.'));
        return;
      }
      if (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host) {
        sendJson(res, 403, errorBody('origin_not_allowed', 'Cross-origin analysis is not allowed.'));
        return;
      }
      if (!(await aiStatus()).enabled) {
        sendJson(res, 503, errorBody('ai_disabled', 'AI analysis is not configured.'));
        return;
      }
      let payload;
      try {
        payload = JSON.parse(await readBody(req, 1_000_000) || '');
      } catch (err) {
        if (err && err.code === 'too_large') throw err;
        sendJson(res, 400, errorBody('invalid_body', 'The request body must be JSON.'));
        return;
      }
      if (!payload || typeof payload !== 'object' || typeof payload.question !== 'string' || !payload.context || typeof payload.context !== 'object') {
        sendJson(res, 400, errorBody('invalid_body', 'Analysis requires a question and a context object.'));
        return;
      }
      if (Object.keys(payload).some(key => !['question','context'].includes(key)) || payload.question.trim().length === 0 || payload.question.length > 2000) {
        sendJson(res, 400, errorBody('invalid_body', 'Invalid analysis request.'));
        return;
      }
      const contextFilters = payload.context.filters;
      if (!contextFilters || typeof contextFilters !== 'object') {
        sendJson(res, 400, errorBody('invalid_body', 'Analysis context requires filters.'));
        return;
      }
      if (Array.isArray(contextFilters) || Object.entries(contextFilters).some(([key,value]) => !['month','company','product','customer','salesperson','plant','costCenter'].includes(key) || typeof value !== 'string')) {
        sendJson(res, 400, errorBody('invalid_body', 'Invalid analysis filters.'));
        return;
      }
      const search = new URLSearchParams();
      for (const key of ['month', 'company', 'product', 'customer', 'salesperson', 'plant', 'costCenter']) {
        if (contextFilters[key] != null) search.set(key, String(contextFilters[key]));
      }
      const parsed = parseSearch(search.toString(), 'dashboard');
      if (!parsed.ok) {
        sendJson(res, 400, errorBody(parsed.error.code, parsed.error.message));
        return;
      }
      const ai = await aiStatus();
      const page = resolvePage(payload.context.pageId || 'D01', ai.enabled);
      if (!page.ok) {
        sendJson(res, 400, errorBody(page.error.code, page.error.message));
        return;
      }
      const catalog = await loadMembers();
      const memberCheck = checkMembers(parsed.filters, catalog);
      if (!memberCheck.ok) {
        sendJson(res, 400, errorBody(memberCheck.error.code, memberCheck.error.message));
        return;
      }
      let dashboard;
      if (!memberCheck.monthInCube) {
        dashboard = buildNoData({
          pageId: page.pageId,
          filters: parsed.filters,
          requestId: randomUUID(),
          source: sourceEnvelope(config, catalog.queriedAt || currentIso(options.now))
        });
      } else {
        const raw = await loadBundle(bundleRequest(parsed.filters, config));
        dashboard = buildDashboard({
          pageId: page.pageId,
          filters: parsed.filters,
          requestId: randomUUID(),
          raw,
          catalog,
          source: sourceEnvelope(config, raw.queriedAt || currentIso(options.now))
        });
      }
      const mod = await aiModule();
      let result;
      try {
        result = await mod.handleAnalysis({
          body: { question: payload.question, context: dashboard },
          ip: req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '',
          env: options.env || process.env,
          fetchImpl: options.fetchImpl || globalThis.fetch,
          now: options.now ? (() => {
            const value = options.now();
            return typeof value === 'number' ? value : Date.parse(value) || Date.now();
          })() : Date.now()
        });
      } catch {
        sendJson(res, 502, errorBody('upstream_error', 'AI analysis failed.'));
        return;
      }
      const statusCode = result && Number.isInteger(result.statusCode) ? result.statusCode : 502;
      sendJson(res, statusCode, sanitizeOutbound(result && result.body));
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      sendJson(res, 404, errorBody('not_found', 'Not found.'));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, errorBody('method_not_allowed', 'Method not allowed.'));
      return;
    }
    const located = resolveStatic(distDir, url.pathname === '/' ? '/index.html' : url.pathname);
    if (located.error) {
      sendJson(res, 400, errorBody('invalid_parameter', 'Invalid path.'));
      return;
    }
    let stat;
    try { stat = fs.statSync(located.full); } catch { stat = null; }
    if (!stat || !stat.isFile()) {
      sendJson(res, 404, errorBody('not_found', 'Not found.'));
      return;
    }
    const ext = path.extname(located.full).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Content-Length': stat.size
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(located.full).on('error', () => res.destroy()).pipe(res);
  }

  return server;
}

export function startSalesServer(options = {}) {
  const host = options.host || process.env.HOST || '0.0.0.0';
  const port = Number(options.port ?? process.env.PORT ?? 5150);
  const server = createSalesServer(options);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  startSalesServer().then((server) => {
    const address = server.address();
    console.log('sipbi-sales listening on ' + address.address + ':' + address.port);
  }).catch(() => {
    console.error('sipbi-sales failed to start');
    process.exitCode = 1;
  });
}

