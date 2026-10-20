import type { Filters, Evidence, Source, SalesRow } from './sales';

export type DashboardState =
  | 'LOADING'
  | 'READY'
  | 'NO_DATA'
  | 'ERROR';

export type SlicerState = Filters;

export type DashboardId =
  | 'D00'
  | 'D01'
  | 'D02'
  | 'D04'
  | 'D06'
  | 'D07'
  | 'D08'
  | 'D11'
  | 'D13'
  | 'D14'
  | 'D15'
  | 'D16'
  | 'D18';

export interface GrainGuardError {
  code: string;
  reason: string;
}

export interface CubeEvidence {
  modelHash: string;
  currency: 'USD';
  requestId?: string;
  dateRole?: 'Invoice Date';
  grain?: string;
  queriedAt?: string;
}

export interface CubeApiResponse<TSummary = any, TRow = SalesRow> {
  queryId: string;
  cube: string;
  dataset: string;
  asOf: string;
  dateRole: string;
  slicer: SlicerState;
  grain: string[];
  measures: string[];
  state: DashboardState;
  error: GrainGuardError | null;
  summary: TSummary | null;
  rows: TRow[];
  evidence: CubeEvidence;
  rawEvidence?: Evidence;
  source?: Source;
  notes?: string[];
}
