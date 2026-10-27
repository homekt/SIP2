import { createHash, randomUUID } from 'node:crypto';

export const OPERATIONS_SOURCE = Object.freeze({ server: 'localhost:25000', database: 'SI_Powered_BI', cube: 'SI Manufacturing BI', currency: 'CNY', synthetic: true, asOf: '2026-10-19', dataset: 'JDE_DEMO_V2' });
export const OPERATIONS_KINDS = ['production', 'fulfilment', 'budget'];
export function parseOperationsSearch(search, status = false) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search);
  const allowed = status ? [] : ['kind', 'month'];
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) throw new Error('Only one kind and month are supported; sales filters do not apply.');
  }
  if (status) return { mode: 'status' };
  const kind = params.get('kind');
  const month = params.get('month') || '202610';
  if (!OPERATIONS_KINDS.includes(kind)) throw new Error('kind must be production, fulfilment or budget.');
  if (!/^[1-9][0-9]{3}(0[1-9]|1[0-2])$/.test(month)) throw new Error('month must be YYYYMM.');
  return { mode: 'dashboard', kind, month };
}
export function operationsPowerShellArgs(script, request) {
  // Revalidate even when called outside HTTP. Never interpolate into -Command.
  if (request.mode !== 'status') parseOperationsSearch(new URLSearchParams({ kind: request.kind, month: request.month }));
  const args = ['-NoProfile', '-NonInteractive', '-File', script, '-Mode', request.mode === 'status' ? 'status' : 'dashboard'];
  if (request.mode !== 'status') args.push('-Kind', request.kind, '-Month', request.month);
  return args;
}
export function buildOperationsResponse(request, raw) {
  if (raw?.status !== 'ok' || !Array.isArray(raw.datasets)) throw new Error('Invalid operations source response.');
  const datasets = raw.datasets.map(dataset => {
    if (!dataset.name || !Array.isArray(dataset.rows) || !Array.isArray(dataset.measures) || !dataset.dateRole || !Array.isArray(dataset.grain) || typeof dataset.mdx !== 'string') throw new Error('Incomplete operations evidence.');
    const identities = new Set();
    for (const row of dataset.rows) {
      for (const axis of dataset.grain) {
        if (typeof row[`${axis}_key`] !== 'string' || !row[`${axis}_key`] || typeof row[`${axis}_label`] !== 'string') throw new Error('Native member identity is missing.');
      }
      const identity = JSON.stringify(dataset.grain.map(axis => row[`${axis}_key`]));
      if (identities.has(identity)) throw new Error('Duplicate operations grain.');
      identities.add(identity);
      for (const measure of dataset.measures) {
        if (!(measure in row) || (row[measure] !== null && (typeof row[measure] !== 'number' || !Number.isFinite(row[measure])))) throw new Error('Invalid operations numeric cell.');
      }
    }
    const { mdx, ...rest } = dataset;
    return { ...rest, queryHash: createHash('sha256').update(mdx, 'utf8').digest('hex'), query: mdx, status: dataset.rows.some(row => dataset.measures.some(name => row[name] !== null)) ? 'ok' : 'no_data' };
  });
  return {
    status: datasets.some(d => d.status === 'ok') ? 'ok' : 'no_data', kind: request.kind || null, month: request.month || null,
    source: OPERATIONS_SOURCE, datasets,
    evidence: { requestId: randomUUID(), queriedAt: raw.queriedAt, dateRoles: [...new Set(datasets.map(d => d.dateRole))], filters: request.mode === 'status' ? {} : { month: request.month }, unsupportedFilters: ['company', 'customer', 'product', 'salesperson', 'region', 'day'], nullPolicy: 'NULL is unavailable, never zero; ratios come from cube aggregate numerators/denominators.', snapshotPolicy: 'Backlog is fixed at 2026-10-19 and ignores the selected delivery month explicitly.' }
  };
}
