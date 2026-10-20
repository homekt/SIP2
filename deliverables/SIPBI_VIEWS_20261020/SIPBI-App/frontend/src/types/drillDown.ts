import type { Filters, SalesRow, Evidence } from './sales';
import type { DrilldownGroupBy } from '../services/salesApi';

export interface DrillDownRow {
  id: string | number;
  label: string;
  subLabel?: string;
  metric1Label: string;
  metric1Value: string | number;
  metric2Label?: string;
  metric2Value?: string | number;
  statusBadge?: {
    label: string;
    tone: 'success' | 'warning' | 'danger' | 'info' | 'default';
  };
  actionLabel?: string;
  actionTargetTab?: string;
  actionSlicer?: Partial<Filters>;
  rawRow?: SalesRow;
}

export interface DrillDownData {
  title: string;
  subtitle?: string;
  dimensionName: string;
  dimensionValue: string;
  sourceDashboard: string;
  groupBy?: DrilldownGroupBy;
  filterOverrides?: Partial<Filters>;
  salesRows?: SalesRow[];
  evidence?: Evidence;
  summaryMetrics?: Array<{
    label: string;
    value: string | number;
    tone?: 'default' | 'success' | 'warning' | 'danger';
  }>;
  rows: DrillDownRow[];
  suggestedDrillThrough?: Array<{
    targetTab: string;
    label: string;
    description: string;
    slicerUpdates?: Partial<Filters>;
  }>;
}

export interface NavigationRecord {
  tab: string;
  title: string;
  slicer: Filters;
  timestamp: number;
}
