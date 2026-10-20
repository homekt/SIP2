# D15 Rolling Sales — Design Note (preview lane)

## Business question

For the currently filtered population, how do monthly net sales compare against
accumulated views (3-month rolling sum, 12-month rolling sum, year-to-date)?
Readers must be able to tell **monthly** performance apart from **accumulation**
semantics at a glance, without mixing incomparable scales.

## Before / current / new composition

- **Reference-before** (`reference-before/D15RollingSales.tsx`, design intent only):
  one overlaid chart with 4 series on 2 y-axes. Monthly bars shared an axis
  with R3M while YTD shared one with R12M, so very different magnitudes were
  visually comparable by accident. The YTD line connected December straight
  into January across the Jan reset, implying a collapse that never happened.
- **Current working copy** (before this change): four independent small-multiple
  line cards, each with its own USD scale. Monthly sales drawn as a line lost
  the monthly-vs-accumulation distinction, and four look-alike panels repeated
  the same 33-month timeline with a long rule banner above them.
- **New (this lane)**: ONE primary time-series workspace with accessible mode
  buttons — Monthly / R3M Sum / R12M Sum / YTD (default Monthly). Exactly one
  selected series on a single USD axis over the complete 33-month timeline
  (202401..202609). Monthly renders as bars; rolling modes render as unsmoothed
  lines with `connectNulls: false`. YTD renders as one series per calendar year
  (same colour, same legend entry) so December never connects to the January
  reset. The selected (focused) month is emphasised; January boundaries get
  subtle dashed guides. KPI strip keeps all 4 metrics; full 33-row
  monthly/rolling table, CSV export, and click-to-focus navigation are kept.

## Denominators and rules

- `enrichMonthly` is unchanged: strict consecutive full windows, otherwise null.
  R3M = sum of 3 complete months ending at the point; R12M = 12 complete
  months; YTD = Jan→month within the same calendar year (resets every January).
- Null stays null and renders as a gap (—); never 0, never connected,
  never averaged or extrapolated.
- Counts (orders/lines) are shown per month only, never summed across members.
  Percents come from the existing API response (weighted), not recomputed.
- No previous-year overlay: no exactly aligned comparison data is supplied, so
  none is drawn. No targets, forecasts, BCG, market share, or causality claims.

## Data limitations

- Synthetic invoice-month data, Invoice Date, USD / KG, 33 complete months
  202401..202609. Windows reaching outside coverage (early R3M/R12M cells,
  month=All analysis) are null by contract.
- Single-workspace preview: only one accumulation semantic is visible at a
  time; cross-check values in the full table below the chart.
