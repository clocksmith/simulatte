# Neighborhood Bulk Pool

Owner contract: `public/shared/plugins/neighborhood-bulk-pool/index.js`.

## Status

- Status: implemented
- Tier and world: City, `nyc-core-autonomy-v1`
- Plugin ID: `neighborhood-bulk-pool`
- Profile ID: `neighborhood-bulk-pool-v1`
- Default scenario: `weekend-baseline`
- Contract version: plugin v4 contribution
- Last verified source: prior browser proof at commit `a5713c1c13ab`
- Evidence: current disruption and settlement changes have focused code proof only; browser proof has not been rerun

## What is it?

Neighborhood Bulk Pool models households combining bulk purchases and assigning
hypothetical pickup or delivery handoffs. It compares policy choices for cost,
waste, fulfillment, incremental driving, freshness, and compensation without
claiming live warehouse inventory, real residents, exact delivery streets, or a
legally ready marketplace.

## What does it actually do?

1. Load four official warehouse identities and an incomplete scenario catalog.
2. Generate deterministic household demand for selected product categories.
3. Screen fractional shares, whole packages, warehouse offers, availability rules, vehicle cold capacity, and freshness limits.
4. Form purchase groups under the selected pooling policy.
5. Assign coarse handoff stops and modeled driver trips.
6. Compare independent shopping, bulk-only, existing-trip, and pickup-hub policies.
7. Recompute the pool after a governed stockout, driver cancellation, or corridor detour action, then settle exact supported line items.

## What can the user control?

| Control | Default | Allowed values | Material effect |
|---|---:|---|---|
| Pooling and handoff policy | Existing trip | Four declared policies | Changes grouping, delivery, cost, and driving |
| Warehouses | Scenario selection | One or more official identities | Changes available modeled offers and routes |
| Catalog categories | Scenario selection | One or more categories | Changes demand and package candidates |
| Driver compensation | Scenario selection | Pro bono, expenses, fee | Changes settlement and household cost |
| Maximum trip detour | Configured value | 0.5 to 8 km | Rejects or admits delivery assignments |
| Maximum handoff stops | Configured value | 1 to 12 | Caps route assignment |
| Minimum pool savings | Configured value | USD 0 to 20 | Rejects uneconomic pools |
| Cold-item transit limit | Configured value | 30 to 240 minutes | Screens freshness-sensitive handoffs |
| Unknown inventory | Disabled by scenario | On or off | Includes or excludes uncertain offers |

## What does the user see?

- Initial view: Warehouse identities and coarse neighborhood demand envelopes on the City map.
- During playback: Pseudonymous baskets form fractional shares of whole packages, driver cars travel to warehouses and handoffs, package actors move with assigned trips, and rejections remain visible.
- Selection and inspection: Catalog coverage, warehouse offers, group allocation, temperature custody, trip capacity, disruption receipts, and participant settlement.
- Comparison view: Four policy outcomes expose changes in cost, waste, service, and incremental driving.
- Final settlement: Requested and fulfilled units, packages purchased, waste, household cost, and scenario kilometers.

## What is real, derived, modeled, or simulated?

| Item | Origin | Source | Time status | Uncertainty | Used for |
|---|---|---|---|---|---|
| Warehouse identities and addresses | observed | Official warehouse records | historical | Coverage limited to four rows | Map anchors |
| Product catalog and prices | scenario | Bootstrap catalog | snapshot | Explicitly incomplete | Package candidates |
| Availability | scenario | Authored offers | snapshot | Unknown values retained | Purchase screening |
| Household demand | simulated | Seeded demand generator | forecast | Scenario variance | Pool formation |
| Corridors and detours | modeled | Coarse geospatial model | forecast | Exact streets absent | Trip feasibility |
| Freshness timing | modeled | Declared product and vehicle limits | forecast | No measured cold chain | Cold-capacity and transit screening |
| Costs, waste, and compensation | simulated | Scenario price and compensation totals | forecast | Taxes, deposits, tolls, and mileage splits unavailable | Exact supported-line reconciliation |

## How does the simulation work?

- State: Demand, fractional shares, whole packages, offers, assignments, cold custody, disruptions, trips, handoffs, cost, waste, and compensation.
- Governing algorithm: Deterministic bounded catalog screening, pooling, whole-package allocation, cold-capacity checks, policy-specific assignment, and disruption re-solving.
- Progression: Causal snapshots move from demand through purchase, handoff, delivery, and settlement.
- Randomness: Profile presets provide governed seeds; identical controls reproduce identical outputs.
- Invariants: Demand, whole-package units, vehicle capacity, cold capacity, and supported receipt line items reconcile exactly.
- Settlement: Every group, trip, household allocation, expense reimbursement, fee, and unsupported cost component reaches an explicit terminal status.

## How do comparison and playback work?

- Baseline branch: Independent household shopping.
- Intervention branch: The selected pooling and handoff policy.
- Shared inputs: Demand, catalog, warehouse selection, seed, categories, and constraints.
- Clock and replay: Both branches use deterministic event timelines and reloadable state.
- Invalid comparison: Different demand, catalog identity, seed, or unsettled obligations blocks outcome deltas.

## What can and cannot be claimed?

Can claim:

- Declared policies produce different modeled service, cost, waste, and driving outcomes.
- Constraints materially change which pools and handoffs are accepted.
- Unknown availability can be included only through an explicit scenario control.
- A receipted disruption action deterministically rebuilds the allocation from the same governed scenario inputs.

Cannot claim:

- Catalog rows describe live inventory or prices.
- Modeled households and drivers are real people.
- Coarse corridors are exact street routes.
- Zero-valued tax, deposit, toll, or mileage fields prove those costs were observed; unavailable component splits remain zero and explicit.

## What is verified?

- Unit tests: 13/13 focused subtests pass for the current worktree
- Deterministic replay: verified
- Comparison execution: verified across declared policies; disruption healing verifies distinct before and after scenario identities
- Desktop browser: not rerun for the current worktree
- Mobile browser: not rerun for the current worktree
- Known unresolved failures: the core UI does not yet expose the plugin disruption action as a public mid-run control

## Where is it implemented?

- [Plugin entry](../../../public/shared/plugins/neighborhood-bulk-pool/index.js)
- [Configuration](../../../public/shared/plugins/neighborhood-bulk-pool/default-config.json)
- [Pool solver](../../../public/shared/plugins/neighborhood-bulk-pool/pool-solver.js)
- [v4 contribution](../../../public/shared/plugins/neighborhood-bulk-pool/v4-contribution.js)
- [Profile](../../../public/data/application-profiles/neighborhood-bulk-pool-v1.json)
- [Plugin manifest](../../../public/shared/plugins/neighborhood-bulk-pool/plugin.json)
- [Claim inventory](../../../public/data/application-profiles/profile-claim-inventory-v1.json)
- Evidence output: `artifacts/profile-evidence/index.json`
