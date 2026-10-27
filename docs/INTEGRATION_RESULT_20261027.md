# SIP2 AI/composition integration candidate

Status: **DRAFT — not merged; Human Acceptance pending**.

## Scope and provenance

Base `388ea05c89c0da8abcf05c7d1183d67f6d0990d7`. The `sipbi-ai` and `sipbi-composition` worktrees were both detached at `6570ad0b917c379e7618d6eeb24a49e8cf202b75`. Their original files and Git state remain untouched.

Imported 51 non-build files from the AI worktree, containing all 37 composition paths. Of those 37 shared paths, 31 were byte-identical. Six differences were additive: D08/D14 explanation panels, D16 product selection and explanation, optional selection callbacks in productViews, server analysis routes, and the combined test command. No duplicate patch application or automatic merge was used. Source SHA256 bindings are preserved in the local integration evidence directory.

Candidate-only integration changes:

- Independent operations code remains available for future work but is disabled by default. Both API and navigation require `SIPBI_ENABLE_OPERATIONS=1`; live verification did not enable it or query its cube.
- The existing PowerShell plan test uses `fileURLToPath`, fixing an encoded-space pathname failure under the candidate's workspace path. Product query code is unchanged by that repair.
- Built preview assets accompany this candidate. Main and its existing preview service were not modified.

## Current verification

- Automated suite: **106 passed, 0 failed, 1 skipped**. The skipped test requires a different operations cube and was intentionally not enabled. Mocked unit/HTTP contract tests are not live source evidence.
- TypeScript and Vite build passed (647 modules). Existing large-bundle warning remains.
- Actual-TSX chart semantics: **26/26 passed** after adapting the D01 and D06/D13 assertions to the integrated contracts. The verifier retains full-population, null, signed-axis, weighted-ratio and waterfall-reconciliation checks.
- Real `localhost:25000 / JDE_SALES_CUBE_20261020 / JDE Sales` probe: 60,000 sales lines and 20,111 distinct orders.
- All twelve September API dashboards agree with independently executed MDX: net sales 16,234,174.4534 USD; gross profit 4,361,365.6966 USD; net quantity 5,564,253.57 KG; 811 distinct orders. Weighted margin is computed from aggregate numerator/denominator.
- Real company/month filtering, first-year comparison gaps, future no-data, D16 full-population reconciliation, server-owned selected-product explanations, stale snapshot rejection and missing-product rejection passed. No API interception or fabricated live responses were used.
- Desktop browser checks covered D01 aligned sales/margin panels, D14 selected-product explanation and source receipt, filter reset of selected product and prior explanation, D06 selection without implicit drill, explicit live drill into 31 product aggregates with weighted footer, native CSV download, and D16 contribution explanation.
- Native D06 CSV contains 238 customers. Stable keys and each row's sales, profit, quantity and distinct-order values were compared with the live API. No distinct-order sums were used.
- Bounded independent static review found no significant actionable findings in the source gate, analysis snapshots, selection reset and product composition. This was not a full repository/security audit. AGY's separate attempt timed out without a review result and is not PASS evidence.

Reproducible source checks and live receipts: `deliverables/SIPBI_CARD_LAYOUT_20261020/verification/integration-20261027/`. `verify-live.mjs` expects the candidate at `http://127.0.0.1:55274`; run `probe-jde.ps1` first and save its JSON output as `ssas-independent.json` beside the verifier. All commands are read-only against the specified JDE cube.

## Verifier migration and remaining acceptance

The initial legacy-verifier run failed after 13 checks because D01 required the old combined dual-axis chart. The checker now requires two separate, aligned monthly USD and margin panels, exact source values, independent color-matched axes and null gaps. D06/D13 checks now require click-to-highlight with zero drill calls, followed by an explicit action using the stable key; D06 also checks positive-quantity bubble eligibility. The complete adapted verifier then passed all 26 checks. These are authored-TSX tests with substituted hooks, separate from the live browser checks.

Cloud AI, other-cube runtime, full responsive coverage, formal independent verification and Human Acceptance were not performed. The preview uses empty optional-AI/operations configuration. No credentials, database deployment/import/process, firewall or permission changes were made. The withdrawn `wp05-golden-demo-path-r1` implementation and verification were not used.

Recommendation: review this single candidate and perform Human Acceptance before authorizing merge. Main remains unchanged.
