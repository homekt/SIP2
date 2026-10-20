# Independent peer review (static, read-only)

Scope: `app/frontend/src` vs `baseline/frontend/src`. In-scope: D00/D01/D02/D15, D04/D06/D11/D13, controllers `EChartsContainer`/`Header`/`SlicerBar`/`KpiCard`, `AiInsightCard`. Out of scope: Muse-authored four pages, types/contract, data math/backend (frozen). No shell, runtime, browser, or agent use. No runtime claim; browser behavior is for the controller, not this lane.

## Controllers

- `app/frontend/src/components/charts/EChartsContainer.tsx:19,41-46` — singleton `option.title` hidden in canvas and rendered as DOM `figcaption` with wrap, grid top adjustment, `confine`, aria description. In-scope pages no longer pass `option.title`; they use external headings, so layout is preserved. Array titles fall through unchanged. No defect.
- `app/frontend/src/components/charts/KpiCard.tsx:31` — `effectiveTrend = trend`; text-parsing heuristic removed. All in-scope pages pass explicit direction (e.g. `D00DecisionHome.tsx:302-310`, `D01ExecutiveOverview.tsx:311-319`, `D02SalesMomentum.tsx:365-373`, `D15RollingSales.tsx:211-219`; zero/null → neutral). Correct per instruction. Added keyboard/role/aria and footnote `title`; tone change is calm-surface styling only. No defect.
- `app/frontend/src/components/common/Header.tsx:220` — only layout delta vs baseline is `flex-wrap`/`min-h-16` for narrow screens; dashboard list, AI gating, zoom/lang/theme, evidence/units disclosure unchanged. No filtering loss. No defect.
- `app/frontend/src/components/common/SlicerBar.tsx:65,69,130,135,250,257` — adds `htmlFor`/`id`; filter set, custom YYYYMM, reset, summary labels identical to baseline. No defect.
- `app/frontend/src/components/ai/AiInsightCard.tsx:51-55,83-120,144-199` — allowlist navigation (`D07` gated by `aiEnabled`, else `AUTHORIZED_SALES_TABS`), limitations always visible, evidence receipt retained. Collapsible structural notes stay in DOM via `details`. Badge recolor only. No invented thresholds/causal claims in static text. No defect.

## Pages

- D00 (`app/.../D00DecisionHome.tsx:62-202,298-318,411-422,451-505,585-603,649-703`): monthly Net Sales + GP lines on single USD with `connectNulls:false`; company horizontal Net Sales + GP bars single USD; GM% ratio removed from money axis; pie with `?? 0` removed. Tooltip/click use `monthly[idx]` and `orderedCompanies[idx]` aligned to axis order. Export (`exportSalesRowsCsv` companies) and drill-downs retained. Full monthly table retained. No unit/denominator, null-gap, ordering, or loss defect.
- D01 (`D01ExecutiveOverview.tsx:75-147,150-214,217-270,385-472,496-560,562-604`): split monetary trend (USD lines) and GM% (independent %) replaces baseline USD+GM% dual axis; plant single-series USD ranking uses `orderedPlants[idx]`. Export, month/plant drill-downs, company table + `D02` navigation retained. No defect.
- D02 (`D02SalesMomentum.tsx:56-84,94-117,120-180,183-235,239-299,301-306,409-440,461-496,589-634`): same-complete-month prior-year alignment (`year-1 + MM`), null gaps for missing history, no extrapolation; YoY% signed bars with zero baseline; company Net Sales + GP single USD replaces baseline USD/KG and USD/ASP dual axes. Ordering via `orderedCompanies`; export/drill-down/table retained. No defect.
- D15 (`D15RollingSales.tsx:44-45,56-74,76-131,133-163,206-252,270-374,392-456,459-494`): four small multiples with independent USD scales replace baseline mixed Monthly/R3M vs YTD/R12M dual axes; `enrichMonthly` preserved; R3M/R12M/YTD gaps and Jan-reset documented; table now shows R3M/R12M/YTD; export + click-to-focus retained. No defect.
- D04 (`D04ProductMix.tsx:129-195,197-264,331-346,349-391,393-464,466-516`): category + Top-12 horizontal Net-Sales-only bars, zero baseline, explicit "GP/GM% not plotted, not added"; `inverse` keeps rank 1 top with `dataIndex` aligned via `pointIndex` + `markLine` guard; tooltip/table/CSV keep full `products.length`; category drill-down retained. Removes baseline pie-null-to-zero and USD/GM% dual axis. No defect.
- D06 (`D06CustomerContribution.tsx:128-232,298-340,343-422,424-474`): Top-15 Net Sales + GP side-by-side single USD, zero baseline, GM%/returns in tooltip/table/CSV; `customerChartRows[index]` aligned; table keeps all `customers.length`; CR5 `D11` drill-through retained. Removes baseline GM% second axis. No defect.
- D11 (`D11CustomerConcentration.tsx:111-136,165-247,249-313,347-358,360-390,392-458,461-530,532-569`): Top-10 amount panel separated from full-population cumulative-share panel; denominator is all-customer sum with `sharesOk` gating (any negative/null or total ≤ 0 → no curve, explicit placeholder); no 80%/BCG/target lines; CR5/HHI use `available` gating with `DASH`. Export, drill-downs, full rank table retained. Baseline used `kpis.netSalesUSD` denominator and top-20-truncated curve; new denominator matches stated "all customer" population. No defect in static scope.
- D13 (`D13SalespersonPerformance.tsx:121-224,289-331,333-408,410-455`): all-salespeople Net Sales + GP single USD, zero baseline, no target/attainment; GM% table-only; `salespeople[index]` aligned; table/CSV keep all reps; customer drill-down retained. Removes baseline GM% second axis. No defect.

## Verdict

- Material: none found in static scope.
- Medium: none found in static scope.
- Minor: none found in static scope.

No actionable concrete defects in the in-scope static diff. Desktop/mobile layout risk, filtering/drilling/export, ordering/`dataIndex`, ranking population, units/denominators, and null/comparison-window handling all check out statically. Runtime rendering and browser checks expressly not claimed here.
