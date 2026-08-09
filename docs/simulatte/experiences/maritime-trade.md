# Maritime Trade

Owner contract: `public/shared/plugins/maritime-trade-global/index.js`.

## Status

- Status: implemented
- Tier and world: World, `earth-global-topology-v1`
- Plugin ID: `maritime-trade-global`
- Profile ID: `maritime-trade-global-v1`
- Default scenario: `suez-closure-cape-reroute`
- Contract version: plugin v4 contribution
- Last verified source: prior browser proof at commit `a5713c1c13ab`
- Evidence: current worktree browser proof not rerun; prior index contains 10/10 runs

## What is it?

Maritime Trade is a modeled global-voyage experiment. It routes a container
shipment through governed geographic identities and authored corridors, then
simulates transit, canal constraints, weather disruption, queues, emissions,
and container lineage. It compares configured and undisrupted voyages without
claiming current operations, actual cargo, or an ETA.

## What does it actually do?

1. Load governed port identities, corridors, chokepoints, scenarios, and model artifacts.
2. Build a route that respects required and blocked canals.
3. Create vessel, cargo, weather, queue, and service-state scenario inputs.
4. Advance depart, leg, arrive, queue, berth, discharge, and delivery events.
5. Preserve container custody and voyage state through every transition.
6. Compute separate queue distributions and emissions parameter sensitivity.
7. Compare the configured voyage with an undisrupted baseline.

## What can the user control?

| Control | Default | Allowed values | Material effect |
|---|---:|---|---|
| Vessel archetype | Scenario-specific | Governed modeled classes | Changes capacity, power, speed, and emissions |
| Speed policy | Scenario-specific | Declared operating policies | Changes transit time, fuel, and emissions |
| Scenario cargo | Scenario-specific | 100 to 24,000 TEU | Changes cargo state and capacity use |
| Queue ensemble runs | Configured value | 2 to 512 | Changes empirical waiting-time distribution |
| Voyage preset | Shanghai to Rotterdam | Five route and disruption scenarios | Changes endpoints, canals, weather, and restrictions |

## What does the user see?

- Initial view: Global ports, selected corridor, cargo flow, vessel actor, and disruption context.
- During playback: A vessel follows authored ocean corridor geometry, pauses at chokepoints and arrival events, and exposes modeled destination queue pressure before berth, discharge, and delivery.
- Selection and inspection: Route distance, queue quantiles, emissions sensitivity, custody state, and claim boundary.
- Comparison view: Configured disruption and undisrupted baseline advance on synchronized voyage clocks.
- Final settlement: Transit, waiting, delivery, cargo lineage, emissions, and disruption differences.

## What is real, derived, modeled, or simulated?

| Item | Origin | Source | Time status | Uncertainty | Used for |
|---|---|---|---|---|---|
| Port identities and coordinates | observed | Governed WPI and UN/LOCODE rows | historical | Source coverage limits | Geographic anchors |
| Calibration artifacts | observed or derived | Pinned AIS, port, weather, canal, and performance extracts | historical | Coverage varies by artifact | Model governance |
| Shipping corridors | modeled | Governed corridor dataset | forecast | Not current routes | Path generation |
| Vessel, cargo, and restrictions | scenario | Profile and controls | forecast | Not current operations | Voyage inputs |
| Queue waiting time | simulated | Arrival and service ensemble | forecast | Empirical scenario distribution | Delay |
| Emissions | modeled | Power, speed, fuel, auxiliary, and carbon factors | forecast | Parameter sensitivity | Environmental metric |
| Arrival and delivery | simulated | Voyage event engine | forecast | Scenario assumptions | Settlement |

## How does the simulation work?

- State: Route, vessel, cargo ledger, weather, queue, berth, service, emissions, and delivery status.
- Governing algorithm: Deterministic corridor routing, service-state transitions, seeded queue sampling, and emissions equations.
- Progression: Chronological events cover configuration through final delivery.
- Randomness: Queue ensembles and disruption scenarios use declared seeds; emissions sensitivity is separate.
- Invariants: Route constraints hold, container custody is continuous, and queue and emissions uncertainty never merge.
- Settlement: Cargo reaches delivery or an explicit failure with compatible baseline and intervention metrics.

## How do comparison and playback work?

- Baseline branch: The same voyage without the selected disruption.
- Intervention branch: The configured route, restriction, weather, or service disruption.
- Shared inputs: Ports, vessel, cargo, model hashes, seed, and starting state.
- Clock and replay: Branches synchronize by event time and reconstruct from deterministic receipts.
- Invalid comparison: Different cargo, datasets, vessel identity, metrics, or unsettled custody blocks deltas.

## What can and cannot be claimed?

Can claim:

- Routing respects the declared corridor and canal constraints.
- Queue uncertainty and emissions sensitivity are reported independently.
- Container lineage survives the complete simulated voyage.
- Disruptions can be compared on identical scenario inputs.

Cannot claim:

- Routes, queues, vessels, cargo, or arrivals are current operations.
- A displayed arrival is an ETA.
- Emissions represent a measured vessel voyage.
- Calibration artifacts provide universal operational validity.

## What is verified?

- Unit tests: passing in `tests/maritime-trade-global.test.cjs`
- Deterministic replay: verified
- Comparison execution: verified
- Desktop browser: not rerun for the current worktree
- Mobile browser: not rerun for the current worktree
- Known unresolved failures: current operations and broad held-out calibration are not claimed

## Where is it implemented?

- [Plugin entry](../../../public/shared/plugins/maritime-trade-global/index.js)
- [Configuration](../../../public/shared/plugins/maritime-trade-global/default-config.json)
- [Voyage engine](../../../public/shared/plugins/maritime-trade-global/maritime-engine.js)
- [v4 contribution](../../../public/shared/plugins/maritime-trade-global/v4-contribution.js)
- [Profile](../../../public/data/application-profiles/maritime-trade-global-v1.json)
- [Calibration artifacts](../../../public/data/maritime-trade-global/calibration-artifacts-v1.json)
- [Focused tests](../../../tests/maritime-trade-global.test.cjs)
- Evidence output: `artifacts/profile-evidence/index.json`
