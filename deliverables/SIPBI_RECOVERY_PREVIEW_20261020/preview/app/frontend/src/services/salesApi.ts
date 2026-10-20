import { useEffect, useRef, useState } from 'react';
import type { DashboardResponse, DrilldownResponse, Filters, Metadata } from '../types/sales';
import { DEFAULT_FILTERS } from '../utils/salesFormat';

export type DrilldownGroupBy =
  | 'product'
  | 'customer'
  | 'salesperson'
  | 'company'
  | 'plant'
  | 'costCenter'
  | 'category'
  | 'month';

export type UiPhase = 'pending' | 'ok' | 'no_data' | 'error';

export interface ApiErrorInfo {
  code: string;
  message: string;
  httpStatus?: number;
}

export class SalesApiError extends Error {
  code: string;
  httpStatus?: number;

  constructor(code: string, message: string, httpStatus?: number) {
    super(message);
    this.name = 'SalesApiError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function normalizeFilters(filters?: Partial<Filters> | null): Filters {
  return {
    month: filters?.month ? String(filters.month) : DEFAULT_FILTERS.month,
    company: filters?.company ? String(filters.company) : DEFAULT_FILTERS.company,
    product: filters?.product ? String(filters.product) : DEFAULT_FILTERS.product,
    customer: filters?.customer ? String(filters.customer) : DEFAULT_FILTERS.customer,
    salesperson: filters?.salesperson ? String(filters.salesperson) : DEFAULT_FILTERS.salesperson,
    plant: filters?.plant ? String(filters.plant) : DEFAULT_FILTERS.plant,
    costCenter: filters?.costCenter ? String(filters.costCenter) : DEFAULT_FILTERS.costCenter,
  };
}

export function buildFilterParams(filters?: Partial<Filters> | null, extra?: Record<string, string>): URLSearchParams {
  const f = normalizeFilters(filters);
  const params = new URLSearchParams();
  if (extra) {
    Object.entries(extra).forEach(([k, v]) => {
      if (v !== undefined && v !== null) params.set(k, String(v));
    });
  }
  params.set('month', f.month);
  params.set('company', f.company);
  params.set('product', f.product);
  params.set('customer', f.customer);
  params.set('salesperson', f.salesperson);
  params.set('plant', f.plant);
  params.set('costCenter', f.costCenter);
  return params;
}

async function parseJsonOrThrow(res: Response): Promise<any> {
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    throw new SalesApiError(
      `HTTP_${res.status}`,
      `Invalid JSON response (HTTP ${res.status})`,
      res.status
    );
  }
  if (!res.ok || body?.status === 'error') {
    const code = body?.error?.code || `HTTP_${res.status}`;
    const msg = body?.error?.message || body?.message || `Request failed with HTTP ${res.status}`;
    throw new SalesApiError(code, msg, res.status);
  }
  return body;
}

export async function fetchMetadata(signal?: AbortSignal): Promise<Metadata> {
  const res = await fetch('/api/metadata', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  const data = await parseJsonOrThrow(res);
  return data as Metadata;
}

export async function fetchSalesDashboard(
  pageId: string,
  filters: Partial<Filters>,
  signal?: AbortSignal
): Promise<DashboardResponse> {
  const params = buildFilterParams(filters);
  const res = await fetch(`/api/dashboards/${encodeURIComponent(pageId)}?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  const data = await parseJsonOrThrow(res);
  return data as DashboardResponse;
}

export async function fetchSalesDrilldown(
  groupBy: DrilldownGroupBy,
  filters: Partial<Filters>,
  signal?: AbortSignal
): Promise<DrilldownResponse> {
  const params = buildFilterParams(filters, { groupBy });
  const res = await fetch(`/api/drilldown?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  const data = await parseJsonOrThrow(res);
  return data as DrilldownResponse;
}

export interface UseSalesDashboardResult {
  phase: UiPhase;
  data: DashboardResponse | null;
  error: ApiErrorInfo | null;
  reload: () => void;
}

export function useSalesDashboard(
  pageId: string,
  filters: Filters,
  onContextLoaded?: (ctx: DashboardResponse) => void
): UseSalesDashboardResult {
  const [phase, setPhase] = useState<UiPhase>('pending');
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<ApiErrorInfo | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const onContextRef = useRef(onContextLoaded);
  onContextRef.current = onContextLoaded;

  useEffect(() => {
    const seq = seqRef.current + 1;
    seqRef.current = seq;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPhase('pending');
    setData(null);
    setError(null);

    fetchSalesDashboard(pageId, filters, controller.signal)
      .then((res) => {
        if (seq !== seqRef.current || controller.signal.aborted) return;
        setData(res);
        setPhase(res.status === 'no_data' ? 'no_data' : 'ok');
        setError(null);
        onContextRef.current?.(res);
      })
      .catch((err: unknown) => {
        if (seq !== seqRef.current || controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setData(null);
        setPhase('error');
        if (err instanceof SalesApiError) {
          setError({ code: err.code, message: err.message, httpStatus: err.httpStatus });
        } else if (err instanceof Error) {
          setError({ code: 'NETWORK_ERROR', message: err.message });
        } else {
          setError({ code: 'UNKNOWN_ERROR', message: 'Failed to load dashboard data.' });
        }
      });

    return () => {
      controller.abort();
    };
  }, [
    pageId,
    filters.month,
    filters.company,
    filters.product,
    filters.customer,
    filters.salesperson,
    filters.plant,
    filters.costCenter,
    reloadTick,
  ]);

  const reload = () => setReloadTick((t) => t + 1);

  return { phase, data, error, reload };
}
