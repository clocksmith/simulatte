# Grid Resilience End-to-End Implementation

Status: implemented and registered as a native v4 experience.

Owner contract: `public/shared/plugins/grid-resilience-us/index.js`.

Profile: `grid-resilience-us-v1`.

Tier: `country`.

## Product boundary

Grid Resilience is an interface-constrained dispatch and restoration
experiment. It uses governed public operating snapshots and explicit modeled
assets to compare policies under identical disruptions.

It does not expose protected grid topology, run AC power flow, predict a real
blackout, represent utility control-room authority, or claim a region will
avoid an outage.

The first public claim is:

> Under the declared regional model and disturbance, this policy changed
> modeled unserved energy, reserve margin, storage use, and emissions.

## Files

```text
public/shared/plugins/grid-resilience-us/
  plugin.json
  config.schema.json
  default-config.json
  index.js
  operating-snapshot.js
  dispatch-model.js
  restoration-engine.js
  metrics.js
  presentation.js
  v4-contribution.js
  comparison-driver.js

public/data/grid-resilience-us/
  eia-balancing-authority-hourly-v1.json
  eia-generation-mix-hourly-v1.json
  noaa-weather-stations-v1.json
  noaa-weather-observations-v1.json
  regional-interface-scenarios-v1.json
  resource-archetypes-v1.json
  storage-archetypes-v1.json
  disturbance-scenarios-v1.json
  restoration-resources-v1.json
  model-governance-v1.json
  provenance-registry-v1.json
  dataset-manifest.json

public/data/application-profiles/
  grid-resilience-us-v1.json

tools/grid-resilience/
  fetch-eia-operating-data.mjs
  fetch-noaa-weather.mjs
  build-grid-resilience-data.mjs
  update-grid-manifest.mjs
  update-grid-plugin-manifest.mjs

tests/
  grid-resilience-us.test.cjs
```

## Governed data

The data builder uses pinned API queries and promotes static artifacts. EIA API
keys and NOAA tokens are build-time secrets and never enter browser assets.

| Dataset | Acquisition | Truth boundary |
| --- | --- | --- |
| BA demand and forecast | EIA API v2 `electricity/rto/region-data` or the current discoverable child route | Observed or agency-reported hourly aggregate with revision and missingness flags |
| BA net generation | EIA API v2 balancing-authority operating data | Observed or agency-reported aggregate |
| Interchange | EIA API v2 interchange route | Observed scheduled or reported aggregate, not physical line flow |
| Generation mix | EIA API v2 fuel-type route | Observed or derived aggregate |
| Weather stations | NOAA CDO `/stations` | Observed station metadata |
| Weather values | NOAA CDO `/data` with explicit dataset and datatype IDs | Observed historical values with flags and units |
| Region geometry | Public generalized BA boundary or authored aggregate regions | Observed identity plus modeled display geometry |
| Interfaces | Authored inter-region transfer limits | Scenario, not protected topology |
| Resource fleet | Aggregated supply blocks, ramps, minimum output, cost, emissions | Modeled unless source-specific |
| Storage and restoration | Aggregate capacities, efficiencies, crews, dependencies | Scenario |

Official acquisition contracts:

- `https://www.eia.gov/opendata/documentation.php`
- `https://api.eia.gov/v2/electricity/rto`
- `https://www.ncei.noaa.gov/cdo-web/api/v2/`

Every source row keeps the API route, normalized query, request hash, response
version, period, respondent ID, units, revision flags, retrieval instant,
transformation version, license identifier, and output row hash.

Missing or revised EIA rows remain missing or revised. The builder does not
interpolate them silently. A separate transformation may fill a gap only when
the output is classified `derived`, links all neighboring rows, and reports
uncertainty.

## Profile

Initial seeds:

| Seed ID | Disturbance | Comparison |
| --- | --- | --- |
| `heat-demand-peak` | Modeled temperature-linked demand uplift | Fixed reserves versus adaptive reserves |
| `generator-outage-cluster` | Seeded aggregate resource outages | Economic order versus resilience-weighted order |
| `renewable-forecast-error` | Same forecast error ensemble | Baseline storage versus reserve-preserving storage |
| `interface-loss` | One aggregate transfer interface unavailable | Uncoordinated versus coordinated regional dispatch |
| `restoration-sequence` | Same initial de-energized regions | Nearest-first versus dependency-aware restoration |

The profile selects `us-balancing-authority-regions-v1` and
`grid-resilience-us-config-v1`.

## Configuration

```js
{
  id,
  operatingSnapshotId,
  disturbanceScenarioId,
  dispatchPolicyId,
  reservePolicyId,
  storagePolicyId,
  restorationPolicyId,
  demandResponse: {
    maximumFraction,
    activationCostUsdPerMwh,
    reboundFraction
  },
  emissionsPriceUsdPerTon,
  sheddingPriorities,
  solver: {
    feasibilityToleranceMwh,
    relativeTolerance,
    maximumIterations
  },
  ensembleSeeds,
  startInstant,
  durationHours,
  stepMinutes
}
```

Controls cannot create undeclared assets or topology. Every selected policy,
priority, disturbance, seed, and dataset hash participates in starting
identity.

## State

```js
{
  schema: "simulatte.gridResilienceState.v1",
  scenarioIdentity,
  simulationTimeMs,
  status,
  regions: [{
    id,
    demandMw,
    servedMw,
    unservedMw,
    generationMwByResource,
    availableCapacityMw,
    reserveMw,
    storageMw,
    storageMwh,
    emissionsTons,
    restorationState
  }],
  interfaces: [{
    id,
    fromRegionId,
    toRegionId,
    transferMw,
    limitMw,
    status
  }],
  resourceBlocks: [],
  restorationTasks: [],
  metrics,
  eventIds
}
```

## Dispatch equations

For every region `r` and time step `t`:

```text
generation[r,t]
+ imports[r,t]
+ storage_discharge[r,t]
+ unserved[r,t]
= demand[r,t]
+ exports[r,t]
+ storage_charge[r,t]
```

Resource constraints:

```text
0 <= generation[g,t] <= available_capacity[g,t]
-ramp_down[g] <= generation[g,t] - generation[g,t-1] <= ramp_up[g]
reserve[r,t] >= reserve_requirement[r,t]
0 <= demand_response[r,t] <= declared_limit[r,t]
```

Storage constraints:

```text
soc[t+1] = soc[t]
  + charge[t] * eta_charge * delta_hours
  - discharge[t] / eta_discharge * delta_hours
0 <= soc[t] <= energy_capacity
0 <= charge[t] <= charge_power
0 <= discharge[t] <= discharge_power
```

Interface constraints:

```text
-reverse_limit[e] <= flow[e,t] <= forward_limit[e]
```

These are aggregate transfer constraints. Do not call them transmission
security constraints.

## Dispatch objective

Use lexicographic optimization:

1. Minimize weighted unserved energy.
2. Minimize reserve shortfall.
3. Minimize operating, demand-response, and storage-degradation cost.
4. Minimize emissions cost.
5. Minimize stable deterministic tie-break rank.

Lexicographic stages prevent a financial weight from trading away required
service silently. Each stage fixes the previous optimum within declared
tolerance.

Use deterministic two-phase simplex for the linear program. The receipt
records matrix identity, constraint count, variable count, pivot count,
objective by stage, primal residual, balance residual, storage residual,
reserve residual, and termination reason.

An independent balance verifier recomputes each equation from settled state.
Any energy, ramp, storage, reserve, or interface violation blocks settlement.

## Disturbance model

Disturbances are explicit scenario rows:

- resource availability loss;
- demand multiplier;
- renewable output error;
- interface capacity reduction;
- fuel constraint;
- storage outage;
- restoration task creation.

Observed weather does not directly change demand. A declared transformation
such as `temperature-demand-uplift-v1` maps selected station rows into a
modeled demand multiplier with parameters, fit period, validation period,
units, residual distribution, and parent evidence. Without that artifact,
weather is context only.

Ensembles preserve each individual disturbance timeline and report
distributions. They are labeled scenario variance unless calibrated against
held-out operational periods.

## Restoration engine

Restoration runs after dispatch marks a region or resource de-energized:

```text
pending
  -> inspection
  -> ready
  -> energizing
  -> restored | attempt-failed
```

Each task declares dependencies, required crew type, travel duration,
inspection duration, energization duration, black-start requirement, retry
policy, and seeded failure draw. Policy observations exclude future attempt
outcomes.

Restoration is not nationally realistic until asset, crew, dependency, and
failure parameters are calibrated. The UI labels it modeled sequencing.

## Causal events

| Event | Cause |
| --- | --- |
| `scenario.initialized` | Governed starting identity |
| `operating-snapshot.applied` | Source rows and transformations |
| `disturbance.applied` | Scenario row |
| `dispatch.solved` | Current observable state and policy |
| `constraint.infeasible` | Solver verification |
| `load.shed` | Dispatch decision |
| `storage.charged` or `storage.discharged` | Dispatch decision |
| `interface.constrained` | Capacity and solved flow |
| `restoration.*` | Prior restoration event and policy decision |
| `scenario.terminal` | Final dispatch and restoration states |

The first infeasible constraint is preserved and becomes a View Director
reason event.

## Comparison and policy blindness

The comparison runtime receives:

- shared observed snapshot;
- shared modeled fleet and interfaces;
- shared hidden disturbance draws;
- shared initial storage and restoration resources;
- baseline and intervention configurations;
- identical metric schemas.

Policy context exposes current and historical observations only. Forbidden
keys and future disturbances never enter policy observations. Tests inject
canary hidden fields and require contract rejection.

Lockstep is used for dispatch comparisons. Event-time is used for restoration
when branch event times differ. Settlement rejects clock drift, mismatched
datasets, mismatched initial SOC, unresolved infeasibility, incompatible
metrics, or open restoration obligations.

## Controls

| ID | Kind | Effect |
| --- | --- | --- |
| `disturbance` | select | Selects governed scenario |
| `reserve-policy` | select | Changes reserve constraint |
| `storage-policy` | select | Changes intertemporal objective |
| `demand-response-limit` | range | Changes maximum response |
| `emissions-price` | range | Changes fourth objective stage |
| `shedding-priorities` | multiselect | Changes service weights |
| `restoration-policy` | select | Changes observable task ordering |
| `ensemble-size` | select | Selects declared seed subset |

## Semantic presentation

| Layer | Geometry | Quantity |
| --- | --- | --- |
| Regions | polygon | reserve margin or unserved MW |
| Interfaces | polyline | utilization ratio |
| Generation stack anchors | point | available and dispatched MW |
| Storage | point | SOC fraction |
| Disturbance | area or point | unavailable MW |
| Restoration tasks | actor | remaining modeled hours |

The default view is national overview. Selection opens one region's demand,
dispatch stack, reserve, storage trajectory, evidence, and restoration queue.
Compare mode uses the same camera and quantity domain for both branches.
Manual navigation remains authoritative.

## Receipts

```text
simulatte.plugin.gridScenarioReceipt.v1
simulatte.plugin.gridOperatingSnapshotReceipt.v1
simulatte.plugin.gridDisturbanceReceipt.v1
simulatte.plugin.gridDispatchReceipt.v1
simulatte.plugin.gridEnergyBalanceReceipt.v1
simulatte.plugin.gridStorageReceipt.v1
simulatte.plugin.gridRestorationReceipt.v1
simulatte.plugin.gridEnsembleReceipt.v1
simulatte.plugin.gridSettlementReceipt.v1
simulatte.comparisonExecutionReceipt.v4
```

Every metric distinguishes observed snapshot values, derived transformations,
modeled assets, scenario disturbances, policy decisions, and simulated
outcomes.

## Tests

Unit tests cover:

- exact energy balance and interface conservation;
- capacity, ramp, reserve, and storage bounds;
- deterministic simplex ordering and replay;
- lexicographic objective priority;
- identical starting identities for both branches;
- hidden disturbance exclusion from policy observations;
- distinct outcomes when only storage, reserve, demand response, or shedding
  priority changes;
- restoration dependencies, resource conservation, retries, and terminal
  status;
- missing and revised source rows remain visible;
- provenance closure for every state and rendered layer.

Browser tests cover:

1. Load each seed with zero failed source or manifest requests.
2. Start comparison and step to the first disturbance.
3. Inspect the first infeasible constraint.
4. Change storage and reserve controls and verify identity changes.
5. Pause, reload, and restore both branches.
6. Complete and settle.
7. Compare region and national metrics.
8. Verify observed, modeled, scenario, and unknown styling remains distinct.
9. Audit desktop and `390x844` labels, panels, toolbar, and controls.

## Release gate

The registered profile remains blocked from public release until:

- API response versions, query hashes, rows, units, revisions, and licenses are
  present;
- dispatch and restoration receipts pass independent verification;
- policy code cannot read hidden future disturbances;
- all public screenshots come from settled current-runtime paths;
- no UI or documentation says security-constrained dispatch, AC power flow,
  protected topology, forecast, or blackout prevention;
- desktop and mobile evidence resolve every claim selector.
