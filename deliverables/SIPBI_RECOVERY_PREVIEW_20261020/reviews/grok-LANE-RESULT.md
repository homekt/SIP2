# D11 lane result

Preview only. No deployment, push, database, or shared-module edits.

## Files written

- `DESIGN-NOTE.md`
- `frontend/src/screens/D11CustomerConcentration.tsx`
- `LANE-RESULT.md`

## What changed

`D11CustomerConcentration.tsx` is one Pareto again. Default is Top 20 customers, ranked from a sorted copy (finite `netSalesUSD` descending, then `key` ascending). Bars use the left USD axis, including signed values and a zero baseline. When `concentrationStatus` is `available` and every selected customer net sales value is finite and nonnegative with total > 0, a cumulative-share line uses the right axis fixed at 0–100%. The denominator is the sum of all selected customers, not the Top 20 window and not the KPI. The line is not clamped to 100% and there is no 80% mark. Otherwise the line and percent axis are omitted and the subtitle states why.

Native buttons switch Top 20 and All customers. All customers keeps the same shares and browses with dataZoom (slider, plus Shift+wheel). Tooltips escape the customer label and key and show USD, individual share, cumulative share, and rank over the full population. Bar and line clicks resolve `customerKey` on the sorted window. CR5 and HHI still come from the API. The table lists every ranked customer. CSV still exports `datasets.customers` with the existing columns. Drilldown still filters on the stable customer key. Light/dark and zh-TW/en stay. Hooks stay above `StateGuard`.

## Unverified

No compile, test, or browser run in this lane. The controller still needs to compile and check 1440px and 390px.

Not visually confirmed: legend versus dataZoom spacing, 12px axis labels, Top 20 horizontal scroll on a narrow viewport (the percent axis sits at the end of the `36rem` canvas), or click behavior after dataZoom filters categories. Duplicate customer keys would resolve to the first ranked match.
