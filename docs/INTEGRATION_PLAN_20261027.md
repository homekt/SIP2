# AI and composition integration candidate

Base: `388ea05c89c0da8abcf05c7d1183d67f6d0990d7`. Original worktrees remain untouched.

1. Import the 51 non-build changed files from the AI worktree. Its paths include all 37 composition changes: 31 identical files and 6 additive differences (D08, D14, D16, product selection callbacks, server analysis routes and the test command).
2. Keep the independent operations implementation dormant by default. Server routes and UI navigation require explicit enablement. This candidate must query only `localhost:25000 / JDE_SALES_CUBE_20261020 / JDE Sales` during live verification. Do not enable or process another cube, call a cloud model, or modify data/services belonging to other workspaces.
3. Correct the existing test-only URL pathname conversion for a workspace containing spaces. Run the existing and integration regression tests, TypeScript/build, and real JDE API/SSAS checks. Fix only causally demonstrated integration defects.
4. Run a separate loopback candidate service, verify navigation, selection, interpretation, filtering, evidence and CSV in a real browser. Keep mocked unit evidence distinct from live runtime evidence.
5. Record provenance and verification limits, commit/push a candidate branch for review, and leave main unchanged. Human acceptance and merge are pending.

Review focus: hidden source access; stale snapshot interpretation after filter changes; selected product resets; nullable values and distinct order counts; conflicting changes in shared routing/components. No new dependencies or UI redesign.
