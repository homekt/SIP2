import type { OperationsKind, OperationsResponse, OperationsDataset } from '../types/operations';

export async function fetchOperationsDashboard(kind: OperationsKind, month: string, signal?: AbortSignal): Promise<OperationsResponse> {
  const response = await fetch(`/api/operations/dashboard?${new URLSearchParams({ kind, month })}`, { signal, cache: 'no-store' });
  const body = await response.json();
  if (!response.ok && response.status !== 503) throw new Error(body.error?.message || 'Operations request failed.');
  if (!body || !['ok', 'no_data', 'unavailable'].includes(body.status) || !Array.isArray(body.datasets)) throw new Error('Invalid operations response.');
  return body;
}

export function exportOperationsDataset(dataset: OperationsDataset, response: OperationsResponse) {
  const fields = [...new Set(dataset.rows.flatMap(row => Object.keys(row)))];
  const quote = (value: string | number | null) => {
    if (value === null) return '';
    const text = typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  const evidenceFields = ['sourceDatabase', 'cube', 'currency', 'synthetic', 'dateRole', 'period', 'queryHash', 'requestId'];
  const evidenceValues = [response.source.database, response.source.cube, response.source.currency, 'true', dataset.dateRole, Array.isArray(dataset.period) ? dataset.period.join('|') : dataset.period, dataset.queryHash, response.evidence.requestId || ''];
  const lines = [[...fields, ...evidenceFields].map(quote).join(','), ...dataset.rows.map(row => [...fields.map(field => row[field]), ...evidenceValues].map(quote).join(','))];
  const href = URL.createObjectURL(new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = href; a.download = `operations-${response.kind}-${response.month}-${dataset.name}.csv`; a.click(); URL.revokeObjectURL(href);
}
