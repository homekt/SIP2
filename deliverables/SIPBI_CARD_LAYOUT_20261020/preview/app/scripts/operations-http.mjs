import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { OPERATIONS_SOURCE, parseOperationsSearch, operationsPowerShellArgs, buildOperationsResponse } from './operations-domain.mjs';

export function runOperationsQuery(request) {
  const script = fileURLToPath(new URL('./operations-query.ps1', import.meta.url));
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', operationsPowerShellArgs(script, request), { windowsHide: true, timeout: 150000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }, (error, stdout) => {
      if (error) return reject(new Error('Operations source query failed or timed out.'));
      try { resolve(JSON.parse(stdout.replace(/^\uFEFF/, '').trim())); } catch { reject(new Error('Operations source returned an invalid response.')); }
    });
  });
}
export async function handleOperationsRequest(req, res, { url = new URL(req.url, 'http://localhost'), runQuery = runOperationsQuery } = {}) {
  if (!['/api/operations/status', '/api/operations/dashboard'].includes(url.pathname)) return false;
  const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); };
  if (req.method !== 'GET') { send(405, { status: 'unavailable', error: { code: 'method_not_allowed', message: 'GET required.' } }); return true; }
  let request;
  try { request = parseOperationsSearch(url.searchParams, url.pathname.endsWith('/status')); }
  catch (error) { send(400, { status: 'unavailable', error: { code: 'invalid_parameter', message: error.message } }); return true; }
  try { send(200, buildOperationsResponse(request, await runQuery(request))); }
  catch { send(503, { status: 'unavailable', kind: request.kind || null, month: request.month || null, source: OPERATIONS_SOURCE, datasets: [], evidence: { filters: request.month ? { month: request.month } : {} }, error: { code: 'source_unavailable', message: 'Manufacturing source is unavailable. Retry after checking SSAS and Windows authentication.' } }); }
  return true;
}
