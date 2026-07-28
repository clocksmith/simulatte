# Cable Trader

Owner contract: `public/shared/plugins/cable-trader/index.js`.

## Status

- Status: implemented
- Tier and world: City, `nyc-core-autonomy-v1`
- Plugin ID: `cable-trader`
- Profile ID: `cable-trader-pickup-v1`
- Default scenario: `backbone-shortage`
- Contract version: plugin v4 contribution
- Last verified source: focused tests and targeted current-worktree browser audits on 2026-07-27
- Evidence: desktop settled Compare and 390×844 mid-run intervention audits passed and were visually reviewed

## What is it?

Cable Trader is a deterministic cable-restoration experiment. Named projects
need specific cable families and lengths while four depots hold individually
identified reels. Users choose the operating policy and watch stock leave a
reel, travel through the City, and advance a project only when it arrives.

## What does it actually do?

1. Load four City depot nodes and six project-site nodes.
2. Create stable reels with family, conductor, length, cost, and remnant rules.
3. Release seeded projects with family, meter, priority, and deadline needs.
4. Apply reserve, compatibility, transfer-capacity, and disruption constraints.
5. Solve exact policy-scored feasible flow from reels to projects.
6. Dispatch identified transfers and decrement the source reel immediately.
7. Move transfers for one or more days and credit projects only on arrival.
8. Settle reel conservation, project completion, cost, and policy comparisons.

## What can the user control?

| Control | Default | Allowed values | Material effect |
|---|---:|---|---|
| Cable families | All five | One or more family IDs | Rebuilds reels, demand, feasible substitutions, and receipts |
| Demand priority | Critical first | Critical, deadline, or balanced | Changes which contested project is served first |
| Compatible substitutes | On | On or off | Adds or removes feasible family substitutions |
| Depot reserve | One reel | None, one reel, or 20% | Changes dispatchable stock and remaining resilience |
| Daily transfer capacity | 900 m | 50 to 10,000 m | Limits cable dispatched per modeled day |
| Allocation objective | Cheapest | Cheapest, fastest, or fairness first | Changes the exact edge score and resulting transfers |
| Fairness weighting | 3 | 0 to 5 | Changes underserved-project preference |
| Staged disruption | Road closure | None, closure, damage, surprise, or conflict | Changes delays, stock, demand, or contention |
| Starting reels | 2 | 1 to 12 per depot and family | Changes feasible supply and shortages |
| Crisis preset | Backbone shortage | Four governed seeds | Changes demand mix, sites, priorities, and identity |

## What does the user see?

- Initial view: An overview of four depots and six named repair sites.
- During playback: Family-colored cable paths and vehicles tied to real transfer IDs.
- Inventory and consequences: Depots report usable reels and remaining meters; projects report delivered, in-transit, and short meters.
- Selection: A transfer explains its reel, family, quantity, policy reason, rejected alternatives, and downstream consequence.
- Comparison and settlement: Both policy comparisons use common inputs, then close completion, shortage, cost, damage, remnant, and conservation evidence.

## What is real, derived, modeled, or simulated?

| Item | Origin | Source | Time status | Uncertainty | Used for |
|---|---|---|---|---|---|
| City node and route geometry | observed/derived | Governed NYC world | snapshot | Coverage limits | Depot, site, and transfer placement |
| Cable-family standards context | derived | TIA, IEC, and SCTE catalog metadata | historical | Full standards separately licensed | Family identity only |
| Reel length, cost, and substitution | scenario | Plugin catalog | forecast | Operations calibration missing | Feasible supply and cost |
| Depot inventory and project demand | scenario | Seeded crisis configuration | forecast | Four-seed scenario variance | Starting state |
| Disruptions and delivery delays | simulated | Declared disruption model | forecast | Uncalibrated | Playback events |
| Allocations and outcomes | simulated | Exact feasible-flow solver | forecast | Input-driven variance | Transfers and settlement |

## How does the simulation work?

- State: Individual reels, project demand, in-transit transfers, arrivals, damage, remnants, and cost.
- Governing algorithm: Exact minimum-cost maximum-flow over every feasible reel-to-project edge, using the selected policy score.
- Progression: Fourteen daily states release demand, apply disruptions, dispatch stock, move vehicles, and record arrivals.
- Randomness: The crisis seed and every public control enter scenario identity and configuration hashing.
- Invariants: Meter balance equals remaining plus damaged plus unusable remnant plus dispatched cable.
- Settlement: Playback must finish and reel conservation must pass.

## How do comparison and playback work?

- Policies: Cheapest completion, fastest restoration, and fairness first.
- Shared inputs: Reels, projects, routes, disruption realization, seed, and clock.
- Executed comparisons: Cheapest versus fastest and cheapest versus fairness first.
- Clock and replay: Start, pause, step, resume, seek, replay, and reload reconstruct deterministic daily state.
- Invalid comparison: Mismatched inputs, hidden truth, metrics, clock, or terminal state blocks settlement.

## What can and cannot be claimed?

Can claim:

- Each displayed transfer is backed by the same transfer identity in state and receipts.
- Dispatch decrements its source reel; arrival advances its destination project.
- The solver is exact over the declared feasible graph and policy score.
- Controls rebuild scenario identity and materially alter causal inputs or outcomes.

Cannot claim:

- Depot inventory, projects, costs, vehicles, disruptions, or delivery times are observed.
- Standards-family context validates a specific installation.
- Modeled policy results predict real restoration operations.
- Targeted browser audits prove the reviewed paths, not the complete release evidence matrix.

## What is verified?

- Focused tests: 16/16 passing in `tests/cable-trader.test.cjs`
- Deterministic replay and reel conservation: covered
- Three policy executions and two synchronized comparisons: covered
- Desktop browser: settled Compare audit passed with three policy traces
- Mobile browser: 390×844 mid-run intervention audit passed
- Remaining browser boundary: complete profile evidence and release matrix not run

## Where is it implemented?

- [Plugin entry](../../../public/shared/plugins/cable-trader/index.js)
- [Logistics engine](../../../public/shared/plugins/cable-trader/logistics-engine.js)
- [Presentation adapter](../../../public/shared/plugins/cable-trader/logistics-presentation.js)
- [Configuration](../../../public/shared/plugins/cable-trader/default-config.json)
- [v4 contribution](../../../public/shared/plugins/cable-trader/v4-contribution.js)
- [Profile](../../../public/data/application-profiles/cable-trader-pickup-v1.json)
- [Governed catalog](../../../public/data/cable-trader/cable-logistics-catalog-v1.json)
- [Focused tests](../../../tests/cable-trader.test.cjs)
