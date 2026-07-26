# Neighborhood Bulk Pool

Owner contract: `public/shared/plugins/neighborhood-bulk-pool/index.js`.

## Status

- Status: verified
- Tier and world: City, `nyc-core-autonomy-v1`
- Plugin ID: `neighborhood-bulk-pool`
- Profile ID: `neighborhood-bulk-pool-v1`
- Default scenario: `weekend-baseline`
- Contract version: plugin v4 contribution
- Last verified source: commit `a5713c1c13ab`, bound worktree receipt
- Evidence: 8/8 runs in `artifacts/profile-evidence/index.json`

## What is it?

Neighborhood Bulk Pool models households combining bulk purchases and assigning
hypothetical pickup or delivery handoffs. It compares policy choices for cost,
waste, fulfillment, incremental driving, freshness, and compensation without
claiming live warehouse inventory, real residents, exact delivery streets, or a
legally ready marketplace.

## What does it actually do?

1. Load four official warehouse identities and an incomplete scenario catalog.
2. Generate deterministic household demand for selected product categories.
3. Screen packages, warehouse offers, availability rules, and freshness limits.
4. Form purchase groups under the selected pooling policy.
5. Assign coarse handoff stops and modeled driver trips.
6. Compare independent shopping, bulk-only, existing-trip, and pickup-hub policies.
7. Settle allocations, household costs, package waste, driving, and compensation.

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
- During playback: Package formation, trip assignments, handoff stops, and unserved demand appear progressively.
- Selection and inspection: Catalog coverage, warehouse offers, group allocation, trips, and compensation settlements.
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
| Freshness timing | modeled | Declared transit limits | forecast | No measured cold chain | Assignment screening |
| Costs, waste, and reputation | simulated | Pool solver and settlement | forecast | Uncalibrated | Policy comparison |

## How does the simulation work?

- State: Demand, package groups, offers, assignments, trips, handoffs, fulfillment, cost, waste, and compensation.
- Governing algorithm: Deterministic bounded catalog screening, pooling, capacity checks, and policy-specific assignment.
- Progression: Causal snapshots move from demand through purchase, handoff, delivery, and settlement.
- Randomness: Profile presets provide governed seeds; identical controls reproduce identical outputs.
- Invariants: Purchased units cover allocations, capacity and stop limits hold, and unserved demand remains explicit.
- Settlement: Every group, trip, household allocation, and compensation obligation reaches a terminal status.

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
- Official warehouse identities remain traceable.
- Unknown availability can be included only through an explicit scenario control.

Cannot claim:

- Catalog rows describe live inventory or prices.
- Modeled households and drivers are real people.
- Coarse corridors are exact street routes.
- The experiment proves legal, commercial, or operational readiness.

## What is verified?

- Unit tests: passing in plugin and platform suites
- Deterministic replay: verified
- Comparison execution: verified across declared policies
- Desktop browser: verified
- Mobile browser: verified
- Known unresolved failures: none in the bound evidence matrix

## Where is it implemented?

- [Plugin entry](../../../public/shared/plugins/neighborhood-bulk-pool/index.js)
- [Configuration](../../../public/shared/plugins/neighborhood-bulk-pool/default-config.json)
- [Pool solver](../../../public/shared/plugins/neighborhood-bulk-pool/pool-solver.js)
- [v4 contribution](../../../public/shared/plugins/neighborhood-bulk-pool/v4-contribution.js)
- [Profile](../../../public/data/application-profiles/neighborhood-bulk-pool-v1.json)
- [Plugin manifest](../../../public/shared/plugins/neighborhood-bulk-pool/plugin.json)
- [Claim inventory](../../../public/data/application-profiles/profile-claim-inventory-v1.json)
- [Evidence index](../../../artifacts/profile-evidence/index.json)
