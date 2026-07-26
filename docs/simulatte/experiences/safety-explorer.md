# Safety Explorer

Owner contract: `public/shared/plugins/safety-explorer/index.js`.

## Status

- Status: verified
- Tier and world: City, `nyc-core-autonomy-v1`
- Plugin ID: `safety-explorer`
- Profile ID: `safety-explorer-v1`
- Default scenario: `union-mccarren`
- Contract version: plugin v4 contribution
- Last verified source: commit `a5713c1c13ab`, bound worktree receipt
- Evidence: 8/8 runs in `artifacts/profile-evidence/index.json`

## What is it?

Safety Explorer overlays governed NYC reported-collision history on selected
routes. It preserves crash, injury, fatality, time-period, join, and unmatched
evidence while applying a fixed sparse-count shrinkage score. It helps inspect
historical evidence and parameter sensitivity. It never identifies a safest
route.

## What does it actually do?

1. Load a selected route and governed collision-history index.
2. Join reported collision rows to physical route segments within declared distances.
3. Preserve raw crashes, injuries, fatalities, periods, and match status.
4. Mark unmatched and zero-observation segments as unknown exposure.
5. Compute fixed sparse-count shrinkage from K, corpus mean, and severity weights.
6. Compare the configured K with a sensitivity value.
7. Render neutral observed, derived, and unknown evidence for inspection.

## What can the user control?

| Control | Default | Allowed values | Material effect |
|---|---:|---|---|
| Shrinkage K | 4 | 0 to 64 | Changes stabilization toward the fixed corpus mean |
| Crash weight | Configured | 0 to 100 | Changes each reported crash contribution |
| Injury weight | Configured | 0 to 100 | Changes each reported injury contribution |
| Fatality weight | Configured | 0 to 100 | Changes each reported fatality contribution |
| Corridor preset | Union Square to McCarren | Four governed routes | Changes route segments and joined evidence |

## What does the user see?

- Initial view: The selected route with neutral segment styling and explicit unknown-evidence segments.
- During playback: Historical segment evidence is revealed without converting missing exposure into safety.
- Selection and inspection: Source collision IDs, counts, periods, join distance, match status, formula, and parameters.
- Comparison view: Baseline K and sensitivity K scores remain linked to unchanged observed rows.
- Final settlement: Reported totals, fixed estimate, unmatched rows, unknown segments, and the no-safest-route warning.

## What is real, derived, modeled, or simulated?

| Item | Origin | Source | Time status | Uncertainty | Used for |
|---|---|---|---|---|---|
| Collision reports | observed | Governed NYC source rows | historical | Reporting and coverage limitations | Raw counts |
| Injuries and fatalities | observed | Preserved collision fields | historical | Reporting limitations | Severity totals |
| Route geometry | observed | Governed NYC world segments | snapshot | Physical deduplication limits | Spatial join |
| Collision-to-segment join | derived | Fixed-radius transformation | historical | Join distance and unmatched status | Segment evidence |
| Corpus mean | derived | Governed collision index | historical | Exposure denominator missing | Shrinkage target |
| Sparse-count estimate | derived | Fixed formula and controls | snapshot | Not calibrated as risk | Sensitivity display |
| Zero-observation exposure | unknown | Missing denominator | historical | Explicitly missing | Neutral warning |

## How does the simulation work?

- State: Selected route, joined rows, unmatched rows, segment evidence, parameters, and derived scores.
- Governing algorithm: Fixed sparse-count shrinkage using declared K, corpus mean, and severity weights.
- Progression: Route evidence and its inspection state are exposed through deterministic plugin events.
- Randomness: Corridor presets are deterministic; the method does not infer missing exposure.
- Invariants: Raw source observations never change when parameters change; unknown never becomes zero risk.
- Settlement: Every route segment is classified as matched or unknown and every derived score references parent rows.

## How do comparison and playback work?

- Baseline branch: The configured K value, normally K=4.
- Intervention branch: A declared sensitivity K over identical observations.
- Shared inputs: Route, source rows, joins, corpus mean, and severity fields.
- Clock and replay: Both branches reconstruct the same evidence before recomputing the derived score.
- Invalid comparison: Changed observations, joins, route identity, or missing lineage blocks the comparison.

## What can and cannot be claimed?

Can claim:

- The page shows governed reported-collision history for joined route segments.
- Raw observations remain separate from derived estimates.
- Parameter changes produce inspectable score sensitivity.
- Unknown and unmatched evidence is explicitly preserved.

Cannot claim:

- The fixed method is empirical Bayes.
- A zero-observation segment is safe or low risk.
- The score measures exposure-adjusted crash probability.
- Any preset identifies the safest route.

## What is verified?

- Unit tests: passing in `tests/safety-explorer-truth.test.cjs`
- Deterministic replay: verified
- Comparison execution: verified for K sensitivity
- Desktop browser: verified
- Mobile browser: verified
- Known unresolved failures: no exposure denominator exists by design

## Where is it implemented?

- [Plugin entry](../../../public/shared/plugins/safety-explorer/index.js)
- [Configuration](../../../public/shared/plugins/safety-explorer/default-config.json)
- [Shrinkage model](../../../public/shared/plugins/safety-explorer/fixed-sparse-count-shrinkage.js)
- [v4 contribution](../../../public/shared/plugins/safety-explorer/v4-contribution.js)
- [Profile](../../../public/data/application-profiles/safety-explorer-v1.json)
- [Focused tests](../../../tests/safety-explorer-truth.test.cjs)
- [Claim inventory](../../../public/data/application-profiles/profile-claim-inventory-v1.json)
- [Evidence index](../../../artifacts/profile-evidence/index.json)
