# Lane Result — D15 Rolling Sales preview revision

## Scope

- Owned page only: `frontend/src/screens/D15RollingSales.tsx` (rewritten).
- Supporting note: `DESIGN-NOTE.md` (this lane root).
- No shared components, services, types, math, CSS, routes, backend, or
  package changes. No data writes, deployment, or push.

## What changed

- Replaced the four independent small-multiple line cards with ONE primary
  time-series workspace plus accessible mode buttons
  (Monthly / R3M Sum / R12M Sum / YTD), default Monthly.
- Monthly mode renders bars; R3M / R12M render unsmoothed lines with
  `connectNulls: false`; YTD renders one trace per calendar year under a
  shared legend entry so December never connects into the January reset.
- Exactly one selected series on a single USD axis; full 33-month timeline
  (202401..202609); selected (focused) month emphasised via bar highlight +
  shaded markArea (+ pin in line modes); subtle dashed January guides.
- Mode state via unconditional `React.useState` keyed `'monthly' | 'r3' |
  'r12' | 'ytd'`, so it survives theme/language switches; click/keyboard
  handlers are `useCallback` with no stale closures; chart events memoised.
- Concise visible mode definition line (R3/R12 sums, YTD Jan reset, gaps for
  incomplete windows); concise bilingual title + Invoice-Date / coverage /
  company context; long rule banner removed.
- Kept unchanged: `enrichMonthly` call and null-gap semantics, real
  `useSalesDashboard('D15', …)` hook, 4-metric KPI strip, CSV export,
  click-to-focus navigation, full 33-row monthly/rolling table (rows now
  keyboard-operable via Enter/Space), `AiInsightCard` evidence receipt
  (limitations reworded to single-workspace), light/dark + zh-TW/en styling,
  existing Tailwind/`chart-panel` classes, 340px plot height, responsive
  `min-w-[680px]` horizontal scroll wrapper so categories are never silently
  cut at 390px.
- Tooltip escapes row labels, preserves null (—) and signed values via
  existing `fmtUSD`; no previous-year overlay (no aligned data supplied);
  no fake data, targets, or forecasts.

## What remains unverified (not run in this lane)

- No compilation, type-check, lint, unit test, or browser check was run here
  (lane forbids shell; controller handles compilation and browser).
- Visual readability at 1440px/390px, ECharts per-year YTD splitting,
  markArea/markLine/markPoint rendering, legend single-entry behaviour, and
  theme/language switching are implemented but not observed.
- CSV export contents and drilldown navigation paths are preserved by code
  inspection only, not executed.
