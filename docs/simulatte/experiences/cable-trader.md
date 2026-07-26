# Cable Trader

Owner contract: `public/shared/plugins/cable-trader/index.js`.

## Status

- Status: verified
- Tier and world: City, `nyc-core-autonomy-v1`
- Plugin ID: `cable-trader`
- Profile ID: `cable-trader-pickup-v1`
- Default scenario: `july-baseline`
- Contract version: plugin v4 contribution
- Last verified source: commit `a5713c1c13ab`, bound worktree receipt
- Evidence: 8/8 runs in `artifacts/profile-evidence/index.json`

## What is it?

Cable Trader is a deterministic synthetic exchange-network experiment. It asks
how four NYC hubs could redistribute selected cable families to serve modeled
demand while limiting transfer burden. It does not represent observed people,
inventory, exchanges, compatibility outcomes, or transport costs.

## What does it actually do?

1. Load four governed City nodes and connector-family standards context.
2. Generate seeded daily demand and return events for the selected families.
3. Initialize family-specific inventory at every hub.
4. Solve exact minimum-cost maximum-flow allocations over routed hub links.
5. Advance 30 daily snapshots with inventory, fulfillment, and transfers.
6. Execute the same inputs under a local-inventory-only baseline.
7. Settle run and ensemble receipts with service and burden distributions.

## What can the user control?

| Control | Default | Allowed values | Material effect |
|---|---:|---|---|
| Cable families | All ten | One or more governed family IDs | Rebuilds demand, inventory, flows, identities, comparison, and receipts |
| Duration | 30 days | 1 to 365 | Changes event timing, playback length, and settlement |
| Starting inventory | 8 per hub and family | 1 to 100,000 | Changes availability, transfers, depletion, and fulfillment |
| Scenario preset | July baseline | Four seeded demand patterns | Changes demand and return weights with a new governed seed |

## What does the user see?

- Initial view: A top-down City map framing Union Square, East Village, Greenpoint, and North Williamsburg.
- During playback: Daily hub inventory and bounded transfer flows update as modeled requests are allocated.
- Selection and inspection: A hub reveals family inventory and connector standards-coverage status.
- Comparison view: Optimized redistribution and local-only branches expose fulfillment and transfer differences.
- Final settlement: Fulfilled needs, ending inventory, transport burden, hub imbalance, and scenario variance.

## What is real, derived, modeled, or simulated?

| Item | Origin | Source | Time status | Uncertainty | Used for |
|---|---|---|---|---|---|
| City hub node identities | observed | Governed NYC world | snapshot | Source coverage limits | Hub placement |
| Five connector standards contexts | observed | Connector provenance registry | historical | Compatibility outcomes missing | Family evidence |
| Other connector-family identities | scenario | Plugin configuration | forecast | Empirical coverage missing | Demand categories |
| Demand and return events | simulated | Seeded weighted generator | forecast | Four-seed scenario variance | Inventory changes |
| Starting inventory | scenario | User control | forecast | Operational calibration missing | Initial state |
| Transfer route cost | modeled | City routing distance | forecast | Real transport burden missing | Flow objective |
| Allocations and settlement | simulated | Exact flow solver | forecast | Input-driven scenario variance | Reported outcomes |

## How does the simulation work?

- State: Inventory by hub and cable family plus cumulative demand, returns, fulfillment, and burden.
- Governing algorithm: Exact minimum-cost maximum-flow over the complete directed hub-transfer graph.
- Progression: Seeded inputs are grouped into daily causal events and 31 inventory snapshots.
- Randomness: Scenario identity and family selection derive deterministic seeds and configuration hashes.
- Invariants: Inventory remains nonnegative; every allocation references available stock and a declared demand event.
- Settlement: All days complete and branch metrics, obligations, provenance, and ensemble distributions close.

## How do comparison and playback work?

- Baseline branch: Each request can use local inventory only.
- Intervention branch: Inventory may transfer between hubs through routed links.
- Shared inputs: Families, demand, returns, starting inventory, seed, duration, and clock.
- Clock and replay: Start, pause, step, resume, replay, and reload reconstruct deterministic daily state.
- Invalid comparison: Mismatched configuration, seed, data identity, clock, or unsettled branch blocks polished deltas.

## What can and cannot be claimed?

Can claim:

- The solver finds the exact optimum within the declared network model.
- Selection changes the complete scenario and its receipts.
- Redistribution can be compared with local-only service on identical inputs.
- Ensemble ranges describe declared scenario variance.

Cannot claim:

- The events represent actual community demand or participants.
- Hub inventories or exchanges are observed.
- Standards evidence proves real compatibility outcomes.
- Modeled burden measures real travel, labor, or emissions.

## What is verified?

- Unit tests: passing in `tests/cable-trader.test.cjs`
- Deterministic replay: verified
- Comparison execution: verified as two settled branches
- Desktop browser: verified
- Mobile browser: verified
- Known unresolved failures: none in the bound evidence matrix

## Where is it implemented?

- [Plugin entry](../../../public/shared/plugins/cable-trader/index.js)
- [Configuration](../../../public/shared/plugins/cable-trader/default-config.json)
- [Network simulation](../../../public/shared/plugins/cable-trader/network-simulation.js)
- [v4 contribution](../../../public/shared/plugins/cable-trader/v4-contribution.js)
- [Profile](../../../public/data/application-profiles/cable-trader-pickup-v1.json)
- [Governed data](../../../public/data/cable-trader/cable-compatibility-priors-v1.json)
- [Focused tests](../../../tests/cable-trader.test.cjs)
- [Evidence index](../../../artifacts/profile-evidence/index.json)
