# Lane result — D04 / D06 / D11 / D13 chart refinement

## Files changed

- `EVALUATION.md`
- `frontend/src/screens/D04ProductMix.tsx`
- `frontend/src/screens/D06CustomerContribution.tsx`
- `frontend/src/screens/D11CustomerConcentration.tsx`
- `frontend/src/screens/D13SalespersonPerformance.tsx`
- `LANE_RESULT.md`

No other files were edited. No shared component, helper module, stylesheet, contract, type, service, or package file was changed.

## What the pages do now

- D04: all categories as horizontal net-sales bars; top 12 of N products as horizontal net-sales bars. Gross profit is not stacked or plotted. Full product table and CSV remain. Product click uses `productChartRows[dataIndex]`.
- D06: top 15 of N customers, horizontal grouped bars for net sales and gross profit (not stacked, not totaled). Return quantity is in the table, tooltip, and drill summary. Full customer table and CSV remain. Click uses `customerChartRows[dataIndex]`.
- D11: horizontal top 10 of N net-sales ranking, plus a separate unsmoothed cumulative-share line over every customer when concentration is available. Denominator is the sum of all customer net sales. CR5 and HHI still come from `analysis`. Invalid or empty populations show a written unavailable state and no percent axis. No 80% mark. Top-10 click uses `topRankRows[dataIndex]`; the share line uses `rankedShares[dataIndex]` and the original customer key.
- D13: every salesperson in the slice, horizontal grouped bars for actual net sales and gross profit. No margin axis, target, or attainment. Margin stays in the table. Full CSV and customer drill remain. Click uses `salespeople[dataIndex]`.
- On all four pages, `AiInsightCard` is below the charts and the full table. Level KPIs use `trend="neutral"`. Horizontal axes use `yAxis.inverse` so rank 1 is at the top without reversing the array that click handlers index. Chart heights are clamped to 360–500px. Tooltips show key, label, and unrounded amounts. Nulls are passed through as null.

## Checks actually done

- Read `contract/CONTRACT.md` and the four screens before editing.
- Re-read the edited screens for dual axes, stacked sales/GP, pie/Pareto, static `trend="up"`, `?? 0` on chart values, and click-index alignment.
- No terminal commands, package installs, unit tests, typecheck, server, or browser pass were run. This lane was limited to native read/edit tools.

## Remaining concerns

- Layout, dark-mode contrast, tooltip HTML, and click targets are not visually verified. In particular, `#b45309` on a dark background may be dim; the share line is dashed and named.
- Twenty grouped salesperson bars, or a long category list, stay inside a 500px chart. Labels truncate at 220px. Nothing is dropped from the table or CSV.
- Tables still use the shared formatters (`fmtUSD` with 0 decimals, `fmtPercent` with 1 decimal). Tooltips show more digits. CSV still exports the raw fields.
- Rank order is the API order (`netSalesUSD` descending, tie `key`). These pages do not sort again.
- If `concentrationStatus` is `available` but a customer net sales value is null, negative, or the customer total is not above zero, the share line is withheld while CR5/HHI still follow the API flag. That split should not occur when the API contract holds.
- `.sales-dashboard` and `.chart-panel` are class hooks only. No shared CSS was added.
