# Subsea Network End-to-End Implementation

Status: implemented and registered as the eighth native v4 experience.

Owner contract: `public/shared/plugins/subsea-network-global/index.js`.

Profile: `subsea-network-global-v1`.

Tier: `world`.

## Product boundary

Subsea Network compares communications allocation and repair policies over a
governed cable and landing-point graph. It does not reproduce current internet
traffic, private terrestrial routing, authoritative cable capacities,
commercial contracts, cybersecurity behavior, or operational repair
readiness.

The first public claim is:

> Given the declared topology, modeled demands, failures, capacities, and
> repair resources, the selected policy changed the simulated distribution of
> service.

The release blocks `current traffic`, `live capacity`, `authoritative outage`,
and `actual restoration time` unless separately governed evidence supports the
exact field.

## Files

```text
public/shared/plugins/subsea-network-global/
  plugin.json
  config.schema.json
  default-config.json
  index.js
  network-model.js
  demand-model.js
  path-catalog.js
  allocation-solver.js
  repair-engine.js
  metrics.js
  presentation.js
  v4-contribution.js

public/data/subsea-network-global/
  fcc-cable-license-register-2025-v1.json
  landing-points-governed-v1.json
  cable-corridors-modeled-v1.json
  demand-scenarios-v1.json
  capacity-scenarios-v1.json
  repair-resources-v1.json
  model-governance-v1.json
  provenance-registry-v1.json
  dataset-manifest.json

public/data/application-profiles/
  subsea-network-global-v1.json

tools/subsea-network/
  fetch-fcc-license-register.mjs
  build-subsea-network-data.mjs
  update-subsea-manifest.mjs

tests/
  subsea-network-global.test.cjs
```

## Governed data

| Dataset | Source and transformation | Truth boundary |
| --- | --- | --- |
| FCC license register | Pin the official FCC year-end cable-license document, extract license number and cable name, retain document page and row coordinates | Observed regulatory identity only |
| Landing points | Extract only landing points explicitly named in official filings or current FCC capacity tables; retain filing ID and source text coordinates | Observed named locations, not station capability |
| Cable corridors | Author simplified great-circle or waypoint corridors between governed landing identities | Modeled geometry |
| Capacity scenarios | Versioned capacities by directed cable edge | Scenario, never current capacity |
| Demand scenarios | Versioned commodities by origin, destination, category, volume, priority | Scenario, never current traffic |
| Repair resources | Vessel start positions, transit speed, inventory, service duration, failure probability | Scenario |
| Model governance | Equations, solver tolerances, omissions, validation cases | Modeled |

The acquisition script records source URL, retrieval date, document hash,
license identifier, extraction version, row identity, transformation chain,
and output hash. The current official regulatory anchors are:

- `https://docs.fcc.gov/public/attachments/DA-26-197A3.pdf`
- `https://docs.fcc.gov/public/attachments/DA-25-1072A2.pdf`

The browser loads only promoted static JSON. It never calls FCC or a commercial
cable service at runtime.

## Profile

The profile selects the shared `earth-global-topology-v1` World substrate and
one plugin. Cable nodes, corridors, capacities, demand, failures, and repair
resources remain plugin-owned governed data.

```json
{
  "schema": "simulatte.applicationProfile.v3",
  "id": "subsea-network-global-v1",
  "tier": "world",
  "worldModelId": "earth-global-topology-v1",
  "interaction": {
    "mode": "simulation",
    "simulationOwnerPluginId": "subsea-network-global",
    "missionRequired": false,
    "startLabel": "Run allocation",
    "shuffleLabel": "Change disruption"
  },
  "defaultSeedId": "atlantic-single-cut",
  "seeds": [],
  "plugins": [{
    "id": "subsea-network-global",
    "configId": "subsea-network-global-config-v1"
  }]
}
```

Initial governed seeds:

| Seed ID | Failure | Comparison |
| --- | --- | --- |
| `atlantic-single-cut` | One modeled Atlantic cable cut | Throughput versus proportional fairness |
| `landing-station-loss` | One landing point unavailable | Throughput versus essential-service priority |
| `dual-regional-disruption` | Two correlated cable failures | Proportional fairness versus geographic equity |
| `repair-priority` | Same failures, two repair queues | Nearest-first versus unmet-demand-first repair |

## Configuration

`config.schema.json` requires:

```js
{
  id,
  topologyDatasetId,
  demandScenarioId,
  capacityScenarioId,
  repairScenarioId,
  allocationPolicyId,
  repairPolicyId,
  pathLimitPerCommodity,
  solver: {
    relativeTolerance,
    absoluteTolerance,
    maximumIterations,
    regularizationEpsilon
  },
  ensembleSeeds,
  startInstant,
  durationHours,
  stepMinutes
}
```

Every behavior-changing field participates in
`configurationHash`. `scenarioIdentity` binds the profile, world, selected
datasets, their hashes, configuration hash, seed, and model receipt IDs.

## Network state

```js
{
  schema: "simulatte.subseaNetworkState.v1",
  scenarioIdentity,
  simulationTimeMs,
  status,
  edges: [{
    id,
    cableId,
    fromLandingId,
    toLandingId,
    capacityGbps,
    availableGbps,
    failureState,
    repairState
  }],
  demands: [{
    id,
    originLandingId,
    destinationLandingId,
    categoryId,
    requestedGbps,
    deliveredGbps,
    droppedGbps,
    latencyMs,
    pathAllocations
  }],
  repairs: [],
  metrics,
  eventIds
}
```

State reducers are pure. They receive prior state plus one ordered domain event.
They never read the wall clock, DOM, camera, or network.

## Allocation engine

### Path generation

1. Remove failed edges and inadmissible jurisdictions.
2. Generate up to `pathLimitPerCommodity` loop-free candidate paths with
   deterministic Yen k-shortest paths.
3. Cost each path from propagation latency, configured policy penalty, and
   stable path ID.
4. Retain rejected paths and rejection reasons in the solver receipt.

### Throughput policy

Solve:

```text
maximize sum(demand_weight[k] * delivered[k])
subject to
  sum(path_flow[k,p] for paths using edge e) <= available_capacity[e]
  sum(path_flow[k,p]) = delivered[k]
  0 <= delivered[k] <= requested[k]
```

Use a deterministic two-phase simplex implementation with Bland tie-breaking.
The solver receipt records the matrix hash, variable ordering, pivot count,
objective value, primal residual, dual residual, termination reason, and
rejected basis states. Nonconvergence blocks settlement.

### Proportional-fair policy

Solve:

```text
maximize sum(weight[k] * log(delivered[k] + epsilon))
```

over the same capacity and demand constraints. Use deterministic primal-dual
interior point updates with declared tolerance and iteration cap. Report KKT
residuals. Do not label the result proportional-fair unless feasibility and KKT
gates pass.

### Verification

An independent verifier recomputes:

```text
requested = delivered + dropped
edge_load <= edge_capacity
path endpoints = demand endpoints
all path edges are available and contiguous
all flows are finite and nonnegative
```

Any failure produces `subsea_allocation_invalid` and prevents polished
comparison output.

## Repair engine

Repair is a deterministic discrete-event queue:

1. `repair.requested`
2. `repair.resource-assigned`
3. `repair.transit-started`
4. `repair.site-reached`
5. `repair.attempt-started`
6. `repair.attempt-failed` or `repair.capacity-restored`
7. `repair.completed`

Weather accessibility is a scenario input unless a governed weather dataset is
added. Repair randomness derives only from the declared seed stream. Inventory
is conserved across spare cable, splice kits, and consumed resources.

## Causal event sequence

| Event | Required causes |
| --- | --- |
| `scenario.initialized` | None |
| `demand.window-opened` | Initialization |
| `failure.applied` | Initialization and scenario failure row |
| `allocation.paths-built` | Demand window and active topology |
| `allocation.solved` | Path catalog and policy decision |
| `capacity.bottlenecked` | Allocation result |
| `demand.partially-served` | Allocation result |
| `repair.*` | Failure plus preceding repair event |
| `allocation.recomputed` | Capacity, demand, policy, or repair change |
| `scenario.terminal` | Final demand window and repair queue state |

Events use `simulatte.pluginEvent.v4`, monotonic sequence numbers, simulation
milliseconds, correlation IDs, causation IDs, and canonical provenance.

## Comparison execution

The first comparison is a lockstep execution:

- Baseline policy: `weighted-throughput`.
- Intervention policy: `proportional-fair`.
- Shared identity: topology, capacities, demands, failures, repair resources,
  seed, start time, and model hashes.
- Different field: `allocationPolicyId` only.
- Hidden truth: future failure and repair-attempt draws.
- Policy observation: current topology, current demand, prior events, and
  current resource state only.

Each branch driver implements `startingIdentity`, `observe`, `advance`, and
`settle`. Settlement requires terminal branches, identical metric schemas,
zero conservation violations, zero clock drift, and complete evidence closure.

## Controls

| ID | Kind | Effect |
| --- | --- | --- |
| `allocation-policy` | select | Rebuilds branch policy and configuration hash |
| `repair-policy` | select | Changes repair queue ordering |
| `failure-set` | multiselect | Changes failed edge IDs and scenario identity |
| `essential-service-weight` | range | Changes category weight |
| `jurisdiction-exclusions` | multiselect | Removes admissible paths |
| `repair-vessel-count` | number | Changes modeled resources |
| `playback-rate` | range | Delegates to the core clock only |

Controls never mutate render state directly.

## Semantic presentation

| Layer | Geometry | Quantity | Aggregation |
| --- | --- | --- | --- |
| Landing points | point | requested or delivered Gbps | region |
| Cable corridors | polyline | utilization ratio | cable system |
| Dropped demand | point | dropped Gbps | destination region |
| Active repairs | actor | remaining repair hours | repair queue |
| Service regions | area | delivered fraction | region |
| Failure events | point | unavailable capacity | failure correlation |

The plugin supplies no final colors, line widths, radii, or opacity. Overview
frames the affected connected component. Compare frames the same geography for
both branches. Follow targets the selected repair. Manual navigation remains
authoritative.

## Inspections and receipts

Selection exposes:

- source license or modeled identity;
- capacity classification;
- current edge load and competing demands;
- admitted and rejected paths;
- allocation rationale;
- repair queue and inventory state;
- truth origin, temporal status, uncertainty, and parent evidence.

Required receipt schemas:

```text
simulatte.plugin.subseaScenarioReceipt.v1
simulatte.plugin.subseaPathCatalogReceipt.v1
simulatte.plugin.subseaAllocationReceipt.v1
simulatte.plugin.subseaRepairReceipt.v1
simulatte.plugin.subseaConservationReceipt.v1
simulatte.plugin.subseaSettlementReceipt.v1
simulatte.comparisonExecutionReceipt.v4
```

## Tests

Unit tests prove:

- deterministic path ordering and solver output;
- demand and capacity conservation;
- disconnected demand is explicitly dropped;
- failed or excluded edges carry no flow;
- throughput and proportional-fair policies produce distinct inspectable
  allocations;
- KKT or simplex failure blocks settlement;
- repair queues preserve inventory and event causality;
- hidden future failures are absent from policy observations;
- every state, event, metric, semantic object, inspection, and settlement
  closes provenance.

Browser tests run desktop and `390x844` and exercise:

1. Select `atlantic-single-cut`.
2. Start the synchronized comparison.
3. Step to the failure.
4. Inspect one bottleneck and one dropped demand.
5. Pause and reload.
6. Restore both branch receipts at the same cursor.
7. Complete repair and settlement.
8. Switch policy and verify a new configuration hash.
9. Confirm labels, corridors, and controls do not overlap.
10. Capture compositor, View Director, console, performance, screenshot, and
    pixel-readback evidence.

## Release gate

Registration is allowed only after:

- all dataset and manifest hashes validate after browser activation;
- both allocation solvers pass independent feasibility checks;
- one full comparison settles on desktop and mobile;
- reload reconstructs both branches from receipts;
- no compatibility adapter supplies release evidence;
- the claim inventory contains no current-operations implication;
- missing or stale evidence fails the profile evidence run.
