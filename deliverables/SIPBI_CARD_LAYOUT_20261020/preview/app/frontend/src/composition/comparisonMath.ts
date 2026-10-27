export function trailingAverage(rows: { key: string; value: number | null }[], window: number): (number | null)[] {
  const ordinal = (key: string) => /^\d{4}(0[1-9]|1[0-2])$/.test(key) ? Number(key.slice(0, 4)) * 12 + Number(key.slice(4)) - 1 : NaN;
  return rows.map((_, index) => {
    if (!Number.isInteger(window) || window < 1 || index < window - 1) return null;
    const slice = rows.slice(index - window + 1, index + 1);
    if (slice.some((row, i) => row.value === null || !Number.isFinite(row.value) || !Number.isFinite(ordinal(row.key)) || (i > 0 && ordinal(row.key) !== ordinal(slice[i - 1].key) + 1))) return null;
    return slice.reduce((sum, row) => sum + row.value!, 0) / window;
  });
}

export function comparisonMonths(series: { key: string }[][], limit = 12): string[] {
  return [...new Set(series.flatMap(rows => rows.map(row => row.key)).filter(key => /^\d{4}(0[1-9]|1[0-2])$/.test(key)))].sort().slice(-Math.max(1, limit));
}

export function rankComparison(values: (number | null)[]): (number | null)[] {
  if (values.some(value => value === null || !Number.isFinite(value))) return values.map(() => null);
  return values.map(value => 1 + values.filter(other => other! > value!).length);
}

export async function loadBounded<T, R>(items: T[], mapper: (item: T) => Promise<R>, concurrency = 2, signal?: AbortSignal): Promise<R[]> {
  const result: R[] = new Array(items.length);
  let cursor = 0;
  let failed = false;
  const check = () => { if (signal?.aborted) throw new DOMException('Comparison cancelled', 'AbortError'); };
  const worker = async () => {
    while (cursor < items.length && !failed) {
      check();
      const index = cursor++;
      try { result[index] = await mapper(items[index]); check(); }
      catch (error) { failed = true; throw error; }
    }
  };
  check();
  await Promise.all(Array.from({ length: Math.max(1, Math.min(items.length, concurrency)) }, worker));
  return result;
}
