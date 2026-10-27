# Operations implementation evidence

Historical source-lane receipt from 2026-10-21. It is not current integration verification. The 2026-10-27 integration candidate disables this independent cube by default and did not rerun its live test. See `docs/INTEGRATION_RESULT_20261027.md` for the current scope and results.

2026-10-21. Baseline `6570ad0b917c379e7618d6eeb24a49e8cf202b75` verified with `git rev-parse HEAD`.

## Implemented boundary

Owned changes are `scripts/operations-domain.mjs`, `scripts/operations-query.ps1`, `scripts/operations-http.mjs`, `tests/operations-*.test.mjs`, `frontend/src/types/operations.ts`, `frontend/src/services/operationsApi.ts`, `frontend/src/screens/OperationsDashboard.tsx`, and this receipt. Sales server, routing, navigation and shared components are the parent integrator's lane.

`handleOperationsRequest(req,res,{url,runQuery})` returns `false` for unrelated paths and handles GET `/api/operations/status` or `/api/operations/dashboard?kind=production|fulfilment|budget&month=YYYYMM`. Only one kind and month are allowed; unknown, duplicate, customer/company/day/region and other sales filters return 400 before any source query. Non-GET requests return 405. Production, fulfilment and budget do not inherit the sales filter keyspace.

Default source execution uses `execFile('powershell.exe', ['-NoProfile','-NonInteractive','-File',…])`, named validated arguments, hidden window, bounded runtime and output. The script fixes server/catalog/cube and accepts no MDX argument. Source failure or invalid numeric/member evidence returns sanitized 503 `unavailable`, empty datasets and no fallback values. All responses disable caching. Script output is numeric or null; no ordinal cell indexing, caption parsing, sum of ratios or null-to-zero conversion is used.

Source: `localhost:25000` / `SI_Powered_BI` / `SI Manufacturing BI`, dataset `JDE_DEMO_V2`, CNY, synthetic as-of `2026-10-19`. It is independent of USD InvoiceDate sales. Read-only source contract/model consulted at `C:\Users\user\Documents\SI-Powered-BI`; no source files, DB or cube were changed.

Response datasets expose `name`, `status`, `dateRole`, native-key `grain`, `measures`, `period`, `rows`, exact `query`, SHA256 `queryHash`; top level includes status/kind/month/source/evidence with request ID and source query timestamp. Native company+machine keys include e.g. `00020|MC01`. Query-local metadata measures call native `KEY` / `MEMBER_CAPTION`; only public business measures are queried. `NONEMPTY` evaluates public business measures, preventing metadata strings from manufacturing phantom rows.

Screen provides separate month, source/date notes, production machine trellis and prior/current OEE dumbbell with pp table, downtime Pareto, delivery rate trend, fixed-snapshot company aging stacks, full/to-date budget basis, actual/plan markers, signed gap waterfall, company history, full numeric tables, CSV and query receipts. Null monthly observations stay gaps; missing baseline comparisons remain unavailable. CSV has source/date/hash/request identity and formula-safe string cells. Budget gaps are actual minus the selected legal plan measure. Snapshot queries use explicit `Day.Date` 20261019 and are never relabeled as selected month-end.

## Commands and observed results

1. Initial sandbox OleDb connection returned Windows SSPI `0x8009030E`. Repeating the same read-only probe with the normal user token connected successfully. This was an environment identity failure, not an absent cube.
2. `powershell.exe -NoProfile -NonInteractive -File scripts/operations-query.ps1 -Kind production -Month 202610` with normal user permissions: PASS, native keys and downtime-reason exposure verified.
3. `node --test --experimental-test-isolation=none tests/operations-domain.test.mjs tests/operations-http.test.mjs`: **13/13 PASS**. Includes validation-before-query, interpreter argument boundary, null versus zero, bad numeric cells, missing/duplicate identities, exact query hash, GET-only, pass-through, sanitized unavailable handling and snapshot/native-key script guard checks.
4. `$env:SIPBI_OPERATIONS_LIVE='1'; node --test --experimental-test-isolation=none tests/operations-live.test.mjs` with normal user permissions: **1/1 PASS**, five read-only dashboard invocations (October all three domains, September fulfilment, future production). The live test is skipped unless explicitly enabled.
5. `npm --prefix frontend run build`: TypeScript passed; sandbox Vite hit `spawn EPERM`. Same command with normal user permissions: **PASS** (640 modules). Existing large-chunk warning remains. Later source/UI refinements passed `node frontend/node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit`; parent owns the final integrated bundle/browser run.

Live counts: production summary 1 / machines 20 / machine×months 120 / downtime reasons 2; budget summary 1 / companies 5 / company×months 30; fulfilment summary 1 / delivery months 6 / backlog summary 1 / company×aging rows 7. Omitted company×aging tuples remain missing/null, not invented zero rows.

Live reconciliations (currency/quantity/minute tolerance 0.02; ratio tolerance 0.000001):

- Production input 304,185.74 KG, good 296,700 KG, scrap 7,485.74 KG. OEE 0.7445679799925816 equals summed Good Ideal Minutes / summed Planned Minutes (10,156.607141 / 13,640.94). Scrap rate 0.02460910889511126 equals summed scrap / input. Machine additive totals reconcile. Two reason-minute groups total 849.34, equal Operation Downtime Minutes.
- Budget actual 6,896,054.42 CNY; full plan 11,540,404.12; elapsed plan 6,819,329.68. Full gap -4,644,349.70; to-date gap +76,724.74. Company additive sums, both gap formulas, and aggregate achievement reconcile; ratios are never averaged.
- Delivery: 139 on-time / 190 shipped lines = 0.7315789473684211. October trend row agrees with October summary.
- Fixed backlog: 4,039,970.01 CNY / 193,725 KG / 114 lines / 2 overdue lines. Company-aging sums reconcile. All backlog rows and summary are identical between selected months September and October, because both explicitly query the October 19 snapshot.
- Future 203001 production returns `no_data`, all-null summary cells, no invented zeros.

## Remaining integration boundary

This lane did not start/stop services, make model network calls, modify/deploy/process DB/cube, add dependencies, push or commit. Parent wires HTTP and navigation and runs browser/responsive/light-dark verification. Source tests and TypeScript/build evidence do not constitute browser or Human Acceptance.
