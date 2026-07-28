# NYC Development Atlas

Owner contract:
`public/shared/plugins/nyc-real-estate/index.js`.

## Status

- Status: implemented
- Tier and world: City, New York City street and building world
- Plugin ID: `nyc-real-estate`
- Profile ID: `nyc-development-atlas-v1`
- Default scenario: `greenpoint-history-and-growth`
- Contract version: native plugin v4, application profile v2
- Last verified source: NYC Open Data snapshot compiled 2026-07-27
- Evidence: code and governed-data audit in progress; desktop and mobile
  browser evidence have not been captured

## What is it?

The user becomes a neighborhood planner exploring how recorded sales and
building activity changed, then tests conditional development futures. The
experience replays administrative milestones and visibly raises buildings
before forecasting price intervals and project pipelines. It never appraises a
property, predicts a permit, or presents scenario output as observed fact.

## What does it actually do?

1. Loads a 342 KiB index of 262 NYC Neighborhood Tabulation Areas, then
   hash-verifies and loads only the selected region shard containing annual
   sale aggregates, building filings, final occupancy milestones, current
   footprints, and PLUTO capacity candidates.
2. Selects one neighborhood, property tax class, historical range, future
   horizon, policy, and market assumptions.
3. Replays each calendar year, showing only governed sale observations and
   recorded administrative activity.
4. Interpolates visible construction stages between recorded milestones while
   preserving their modeled origin.
5. Refuses price forecasting when the selected tax class has fewer than four
   observed price years and refuses development generation when compatible
   capacity is absent.
6. Runs 31 deterministic future members that choose tax-class-compatible
   projects, advance construction, conserve units or floor area, and produce
   p10, p50, and p90 prices where supported.
7. Executes business-as-usual and selected-policy branches through the shared
   lockstep comparison engine with identical observations, candidates, seed,
   clock, and exogenous draws.
8. Settles interval ordering or explicit refusal, candidate conservation,
   playback completion, evidence closure, and truth-boundary receipts.

## What can the user control?

| Control | Default | Allowed values | Material effect |
|---|---:|---|---|
| Neighborhood area | Greenpoint | 262 NYC 2020 NTAs | Replaces polygons, sale history, sites, capacity, calibration, and forecast |
| Property tax class | Tax class 2 | Classes 1, 2, 4, or weighted proxy | Selects the price target and sector-correct development model; mixed-class development is refused |
| Historical replay begins | 2010 | 2010 to 2020 | Rebuilds timeline length, clock, events, and visible history |
| Scenario forecast ends | 2035 | 2030 to 2040 | Changes project time, compounding, intervals, and terminal settlement |
| Development policy | Business as usual | Five governed policies | Changes project starts, capacity, affordability context, and price growth |
| Development financing rate | 5.5% | 2% to 12% | Changes start capacity and annual price pressure |
| Annual demand growth | 1.5% | -3% to 6% | Changes project starts and price pressure |
| Construction cost index | 100 | 75 to 175 | Changes capital availability and price pressure |
| Zoning capacity multiplier | 1.0 | 0.5 to 2.0 | Changes modeled project unit and height capacity |
| Affordable housing share | 20% | 0% to 100%; tax class 2 only | Changes affordable units in multifamily modeled completions and is absent for inapplicable sectors |

## What does the user see?

- Initial view: The selected neighborhood boundary, earliest governed year, recorded buildings, current year, price status, and side metrics.
- During playback: Buildings rise through recorded or explicitly inferred stages while price, filings, pipeline, units, and narrative advance annually.
- Selection and inspection: Every visible historical building, capacity
  candidate, future project, and comparison project exposes source row IDs,
  geometry origin, sector output, stage origin, assumptions, and limitations.
- Comparison view: Executed business-as-usual and selected-policy regions and
  buildings appear side by side, sharing data, seed, sector, clock, and exact
  exogenous draws.
- Final settlement: The last year reports interval ordering or sparse refusal,
  conserved candidate states, completed sector output, comparison evidence
  closure, and the claim boundary.

## What is real, derived, modeled, or simulated?

| Item | Origin | Source | Time status | Uncertainty | Used for |
|---|---|---|---|---|---|
| NTA boundaries and names | observed | NYC 2020 NTA | snapshot | Boundary revisions possible | Selection and region geometry |
| Annual sale count and median | observed | NYC annualized sales | historical | Composition and recording bias | Historical price series |
| All-class price proxy | derived | Tax-class annual medians | historical | Not a true combined median | Optional overview |
| Filing and permit milestones | observed | DOB job applications | historical | Missing and revised fields | Replay events |
| Final occupancy milestone | observed | DOB certificates of occupancy | historical | Administrative lag | Recorded completion |
| Current building footprint | observed | NYC Building | snapshot | Current geometry is not historical geometry | Visible footprint |
| Intermediate building stage | modeled | Recorded milestone interval | historical | Timing is not observed | Construction animation |
| Capacity candidate | observed | PLUTO zoning and lot fields | snapshot | FAR does not prove feasibility | Scenario candidate set |
| Future project start and completion | simulated | Conditional development model | forecast | Seeded scenario variation | Future pipeline |
| Future neighborhood price interval | simulated | 31-member conditional ensemble | forecast | Not calibrated parcel probability | p10, p50, p90 comparison |

## How does the simulation work?

- State: Calendar year, selected region and sector, recorded site stages, future candidate states, price interval, filings, units, and playback cursor.
- Governing algorithm: Weighted observed series, milestone interpolation, ranked capacity candidates, bounded starts, construction durations, and conditional price recursion.
- Progression: One deterministic step advances one year from the chosen historical start through the chosen forecast horizon.
- Randomness: Thirty-one seeded members vary feasibility, capital cycles,
  durations, and price shocks. Baseline and intervention consume the same
  site and annual draws; policy identity never changes the exogenous stream.
- Invariants: Candidates partition into unstarted, active, or completed;
  tax-class-1 projects never exceed three units; tax-class-4 projects have
  zero residential or affordable units; p10 never exceeds p50 or p90.
- Settlement: Terminal playback, index and loaded-shard identities, accepted
  controls, executable comparison branches, conservation, and limitations
  enter receipts. Validation fails closed instead of reporting MAPE or interval
  coverage because historical capacity, financing, and construction-cost
  states cannot reconstruct the complete pipeline.

## How do comparison and playback work?

- Baseline branch: Business as usual with shared neighborhood, tax class,
  governed data, seed, clock, financing, demand, cost assumptions, and exact
  exogenous draws.
- Intervention branch: The selected policy, zoning multiplier, and affordable share alter the same candidate population and conditional model.
- Shared inputs: Historical observations and candidates are immutable; both
  branches start from the same final recorded price and 2026 capacity
  snapshot, and a shared draw identity is verified before execution.
- Clock and replay: Start rebuilds the run, Step advances one calendar year, and replay restores the accepted parameters and deterministic seed.
- Invalid comparison: Unknown policies, regions, sectors, out-of-range controls, unordered intervals, or unconserved candidates fail instead of producing a result.

## What can and cannot be claimed?

- Can claim: The experience replays governed annual sale aggregates for a selected NTA and tax class.
- Can claim: Recorded filing, permit, occupancy, and construction-year evidence controls historical visibility.
- Can claim: Every future result is conditional on visible controls, governed candidates, and a recorded deterministic seed.
- Can claim: The runtime reports conservation, sparse-data refusal, and the
  current inability to validate the complete forecast pipeline honestly.
- Cannot claim: A future parcel will be entitled, financed, built, occupied, or sold.
- Cannot claim: The modeled interval is an appraisal, repeat-sales index, rent forecast, or investment recommendation.
- Cannot claim: A policy caused historical price movement or will cause the simulated effect.
- Cannot claim: Interpolated construction stages or PLUTO capacity are observed construction activity.

## What is verified?

- Unit tests: Current validation results are recorded after the active audit
  closes; stale pre-audit counts are not release evidence
- Deterministic replay: focused model and registered-runtime coverage exists
- Comparison execution: shared lockstep engine, common-draw identity, clock
  synchronization, and evidence closure have focused coverage
- Desktop browser: not tested
- Mobile browser: not tested
- Known unresolved failures: current screenshots, pixel recognizability, and production deployment are not verified

## Where is it implemented?

- [Plugin entry](../../../public/shared/plugins/nyc-real-estate/index.js)
- [Forecast model](../../../public/shared/plugins/nyc-real-estate/forecast-model.js)
- [Sector model](../../../public/shared/plugins/nyc-real-estate/sector-model.js)
- [Comparison driver](../../../public/shared/plugins/nyc-real-estate/comparison-driver.js)
- [Semantic presentation](../../../public/shared/plugins/nyc-real-estate/v4-contribution.js)
- [Region and shard index](../../../public/data/nyc-real-estate/region-index-v1.json)
- [Model governance](../../../public/data/nyc-real-estate/model-governance-v1.json)
- [Governed compiler](../../../tools/nyc-real-estate/compile-history.mjs)
