# Grid Resilience

Owner contract: `public/shared/plugins/grid-resilience-us/index.js`.

## Status

- Status: verified
- Tier and world: Country, `us-food-network-v1`
- Plugin ID: `grid-resilience-us`
- Profile ID: `grid-resilience-us-v1`
- Default scenario: `heat-demand-peak`
- Contract version: plugin v4 contribution
- Last verified source: commit `a5713c1c13ab`, bound worktree receipt
- Evidence: 10/10 runs in `artifacts/profile-evidence/index.json`

## What is it?

Grid Resilience is a national interface-constrained dispatch and restoration
experiment. Users apply demand response, reserves, storage, service priorities,
and restoration policies under compound disruptions. It compares policies on
identical inputs without claiming protected topology, AC power-flow realism,
operational forecasting, or a prediction that any region will avoid a blackout.

## What does it actually do?

1. Load governed historical EIA and NOAA rows plus modeled regional resources and interfaces.
2. Apply a selected demand, generation, renewable, interface, or restoration disturbance.
3. Dispatch available generation, storage, demand response, reserves, and shedding each hour.
4. Track energy balance, ramp limits, storage bounds, transfer constraints, emissions, and unserved energy.
5. Advance dependency-aware restoration with limited crews and failed attempts.
6. Execute economic baseline and resilience-policy branches on identical disturbances.
7. Settle system metrics and a declared-seed scenario ensemble.

## What can the user control?

| Control | Default | Allowed values | Material effect |
|---|---:|---|---|
| Disturbance | Heat demand peak | Five declared scenarios | Changes demand, assets, interfaces, or restoration state |
| Dispatch policy | Resilience weighted | Economic, resilience weighted | Changes resource order and objective |
| Reserve policy | Adaptive | Fixed, adaptive | Changes held reserve and available dispatch |
| Storage policy | Reserve preserving | Immediate, reserve preserving | Changes charging, discharge, and later feasibility |
| Restoration policy | Dependency aware | Nearest, dependency, service impact | Changes restoration queue |
| Maximum demand response | 0.08 | 0 to 0.20 | Changes flexible load reduction |
| Emissions price | USD 50/t | 0 to 250 | Changes dispatch cost ordering |
| Service-priority regions | All regions | Region multiselect | Changes shedding order |
| Restoration crews | 2 | 1 to governed crew count | Changes concurrent repair capacity |
| Ensemble runs | 4 | 1 to 6 | Changes scenario-variance sample count |

## What does the user see?

- Initial view: Regional demand, generation, reserves, storage, interfaces, emissions, and service status.
- During playback: Hourly dispatch, constrained transfers, storage trajectories, shedding, failures, and restoration events.
- Selection and inspection: Source demand row, adjusted demand, served load, unserved load, and reserve margin.
- Comparison view: Economic baseline and resilience policy remain synchronized while divergences are visible.
- Final settlement: Unserved energy, emissions, minimum reserve margin, feasibility violations, and restoration outcome.

## What is real, derived, modeled, or simulated?

| Item | Origin | Source | Time status | Uncertainty | Used for |
|---|---|---|---|---|---|
| Demand and generation rows | observed | EIA balancing-authority data | historical | Revisions and missing distributed generation | Operating snapshot |
| Weather rows and stations | observed | NOAA governed extracts | historical | Station coverage limits | Disturbance context |
| Regional aggregates | derived | Pinned source rows | snapshot | Aggregation and missingness retained | Regional state |
| Resource and storage fleets | modeled | Declared archetypes | forecast | Not an operational asset inventory | Dispatch |
| Aggregate interfaces | scenario | Authored topology | forecast | Protected topology excluded | Transfer constraints |
| Outages and policy choices | scenario | Disturbance and controls | forecast | Declared | Branch inputs |
| Dispatch and restoration outcomes | simulated | Seeded engine | forecast | Scenario ensemble | Metrics and events |

## How does the simulation work?

- State: Regional demand, available resources, storage charge, reserves, transfers, emissions, shedding, and restoration queue.
- Governing algorithm: Interface-constrained dispatch with capacity, ramp, storage, reserve, and prioritized-shedding constraints.
- Progression: Twenty-four hourly steps plus sequential restoration transitions.
- Randomness: Declared ensemble seeds vary scenario disturbances and restoration outcomes.
- Invariants: Energy balances, storage remains bounded, interfaces respect capacity, and unserved energy stays explicit.
- Settlement: Both branches reach terminal time with compatible metrics, feasibility receipts, and provenance closure.

## How do comparison and playback work?

- Baseline branch: Economic-order dispatch with the declared baseline policies.
- Intervention branch: Selected resilience, reserve, storage, demand-response, and restoration policies.
- Shared inputs: Historical rows, modeled assets, disturbance realization, seed, topology, and clock.
- Clock and replay: Branches advance hourly in lockstep and reload from deterministic receipts.
- Invalid comparison: Drift, hidden intervention-only inputs, incompatible assets or metrics, or unsettled restoration blocks deltas.

## What can and cannot be claimed?

Can claim:

- The engine enforces its declared energy, storage, ramp, reserve, and interface constraints.
- Policies can change modeled unserved energy and emissions on identical scenarios.
- Observed rows remain separate from modeled assets and scenario failures.
- Restoration decisions and failures are causally receipted.

Cannot claim:

- The model represents protected or exact national grid topology.
- It performs AC or security-constrained power flow.
- It forecasts an operational blackout.
- A modeled policy guarantees real service preservation.

## What is verified?

- Unit tests: passing in `tests/grid-resilience-us.test.cjs`
- Deterministic replay: verified
- Comparison execution: verified
- Desktop browser: verified
- Mobile browser: verified
- Known unresolved failures: operational topology and asset calibration are intentionally absent

## Where is it implemented?

- [Plugin entry](../../../public/shared/plugins/grid-resilience-us/index.js)
- [Configuration](../../../public/shared/plugins/grid-resilience-us/default-config.json)
- [Dispatch model](../../../public/shared/plugins/grid-resilience-us/dispatch-model.js)
- [Restoration engine](../../../public/shared/plugins/grid-resilience-us/restoration-engine.js)
- [v4 contribution](../../../public/shared/plugins/grid-resilience-us/v4-contribution.js)
- [Profile](../../../public/data/application-profiles/grid-resilience-us-v1.json)
- [Focused tests](../../../tests/grid-resilience-us.test.cjs)
- [Evidence index](../../../artifacts/profile-evidence/index.json)
