export type OperationsKind = 'production' | 'fulfilment' | 'budget';
export type OperationsRow = Record<string, string | number | null>;
export interface OperationsDataset {
  name: string;
  dateRole: string;
  grain: string[];
  measures: string[];
  period: string | string[];
  rows: OperationsRow[];
  status: 'ok' | 'no_data';
  queryHash: string;
  query: string;
}
export interface OperationsResponse {
  status: 'ok' | 'no_data' | 'unavailable';
  kind: OperationsKind;
  month: string;
  source: { server: string; database: string; cube: string; currency: 'CNY'; synthetic: true; asOf: string; dataset: string };
  datasets: OperationsDataset[];
  evidence: { requestId?: string; queriedAt?: string; dateRoles?: string[]; filters: Record<string, string>; nullPolicy?: string; snapshotPolicy?: string };
  error?: { code: string; message: string };
}
