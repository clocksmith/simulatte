# Subsea Network

Owner contract: `public/shared/plugins/subsea-network-global/index.js`.

## Status

- Status: implemented
- Tier and world: World, `earth-global-topology-v1`
- Plugin ID: `subsea-network-global`
- Profile ID: `subsea-network-global-v1`
- Default scenario: `atlantic-single-cut`
- Contract version: plugin v4 contribution
- Last verified source: prior browser proof at commit `a5713c1c13ab`
- Evidence: current worktree browser proof not rerun; prior index contains 8/8 runs

## What is it?

Subsea Network is a communications-resilience experiment. It keeps FCC
regulatory cable identities separate from modeled corridors, capacities,
traffic, gateways, failures, and repairs. Users compare allocation and repair
policies under identical disruptions to inspect who receives service, who
loses it, and why. It does not show current internet operations.

## What does it actually do?

1. Load governed regulatory identities, modeled landings, corridors, capacities, demand, and repair resources.
2. Apply selected cable, landing, or regional failures and jurisdiction exclusions.
3. Generate conserved service demands across the scenario topology.
4. Allocate capacity using throughput, fairness, essential-service, or equity objectives.
5. Record delivered, partial, delayed, and dropped demand without silent disappearance.
6. Advance repair resources through travel, queue, repair, and restoration events.
7. Compare weighted throughput with proportional fairness on identical inputs.

## What can the user control?

| Control | Default | Allowed values | Material effect |
|---|---:|---|---|
| Allocation policy | Weighted throughput | Throughput, fairness, essential service, equity | Changes capacity allocation |
| Repair policy | Nearest resource | Nearest, unserved demand first | Changes restoration order |
| Demand and disruption | Atlantic single cut | Four declared scenarios | Changes traffic and failures |
| Modeled failures | Scenario-specific | Cable, landing, or resource multiselect | Removes capacity or connectivity |
| Essential-service weight | Configured value | 1 to 20 | Changes priority objective |
| Excluded regions | None | Landing-region multiselect | Changes admissible paths |
| Repair resources | Configured value | 1 to governed resource count | Changes concurrent repair capacity |
| Ensemble runs | Configured value | 1 to declared seed count | Changes scenario-variance sample count |

## What does the user see?

- Initial view: Bundled global cable corridors, landing clusters, modeled demand, and selected failures.
- During playback: Allocation, congestion, dropped demand, repair travel, queue, repair, and restoration.
- Selection and inspection: Capacity class, competing demands, allocation rationale, utilization, fairness, and repair state.
- Comparison view: Weighted-throughput and proportional-fair branches expose synchronized service-distribution differences.
- Final settlement: Delivered and unmet Gbps, latency stretch, utilization, fairness, bottlenecks, and restored resources.

## What is real, derived, modeled, or simulated?

| Item | Origin | Source | Time status | Uncertainty | Used for |
|---|---|---|---|---|---|
| FCC cable license identities | observed | Governed FCC register artifact | historical | Incomplete operational coverage | Regulatory evidence |
| Named landing countries | observed | Governed filings | historical | Filing coverage limits | Identity context |
| Landing points and corridors | modeled | Governed scenario geometry | forecast | Not authoritative physical paths | Topology |
| Capacities and traffic matrix | scenario | Capacity and demand packs | forecast | Uncalibrated | Flow constraints |
| Failures and exclusions | scenario | Controls and preset | forecast | Authored | Available graph |
| Allocation and service loss | simulated | Capacity-constrained solver | forecast | Scenario ensemble | Outcomes |
| Repair timing and success | simulated | Resource and repair engine | forecast | Scenario assumptions | Restoration |

## How does the simulation work?

- State: Topology availability, demand, allocated flows, unmet demand, utilization, repair resources, and restored edges.
- Governing algorithm: Capacity-constrained multicommodity flow with inspectable policy objectives and demand conservation.
- Progression: Configure, fail, allocate, dispatch repair, travel, queue, repair, restore, and settle.
- Randomness: Declared seed sets drive demand and repair scenario variance.
- Invariants: Edge capacity and demand conservation hold; every demand unit is served, partial, delayed, or dropped.
- Settlement: Both branches terminate with compatible service, fairness, repair, and provenance receipts.

## How do comparison and playback work?

- Baseline branch: Weighted-throughput allocation.
- Intervention branch: Proportional-fair allocation.
- Shared inputs: Topology, demand realization, failures, exclusions, repairs, seed, and clock.
- Clock and replay: Branches advance deterministically and restore from scenario, parameters, data hashes, and seed.
- Invalid comparison: Different demand, topology, failures, hidden outcomes, metrics, or unsettled repairs blocks deltas.

## What can and cannot be claimed?

Can claim:

- The solver conserves declared demand and enforces modeled capacities.
- Allocation policies produce inspectable service-distribution tradeoffs.
- Repair order materially changes modeled restoration.
- FCC identities remain distinguishable from scenario network behavior.

Cannot claim:

- Capacities, traffic, routes, or outages are current.
- The page models cybersecurity or terrestrial networks.
- Repair resources represent operational readiness.
- Policy results predict real regional internet availability.

## What is verified?

- Unit tests: passing in `tests/subsea-network-global.test.cjs`
- Deterministic replay: verified
- Comparison execution: verified
- Desktop browser: not rerun for the current worktree
- Mobile browser: not rerun for the current worktree
- Known unresolved failures: current traffic, capacity, and repair calibration are absent

## Where is it implemented?

- [Plugin entry](../../../public/shared/plugins/subsea-network-global/index.js)
- [Configuration](../../../public/shared/plugins/subsea-network-global/default-config.json)
- [Allocation solver](../../../public/shared/plugins/subsea-network-global/allocation-solver.js)
- [Repair engine](../../../public/shared/plugins/subsea-network-global/repair-engine.js)
- [v4 contribution](../../../public/shared/plugins/subsea-network-global/v4-contribution.js)
- [Profile](../../../public/data/application-profiles/subsea-network-global-v1.json)
- [FCC data](../../../public/data/subsea-network-global/fcc-cable-license-register-2025-v1.json)
- [Focused tests](../../../tests/subsea-network-global.test.cjs)
