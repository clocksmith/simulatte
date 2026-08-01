# NYC Development Atlas improvement ledger

Owner contract:
[NYC Development Atlas current experience](../nyc-development-atlas.md).

## Current state

| Field | State |
|---|---|
| Consistency baseline | 9/10 post-fix code audit; browser score pending |
| Interest baseline | 9/10 post-fix code audit; browser score pending |
| Runtime status | Implemented with a governed 262-neighborhood historical/forecast price surface, lazy detail shards, sparse refusal, sector-specific supply, shared executable comparison, and complete inspections |
| Current strength | Default overview now keeps the citywide heatmap visible while provenance, missing years, forecast limits, selected-region detail, replay, and comparison remain connected |
| Primary gap | Full mobile and human recognizability review, frame-performance budgets across every seed, and deployed screenshot-to-build binding remain open |
| Browser evidence | Targeted Greenpoint desktop evidence passed on the local WebGPU path; full 94-run evidence matrix is pending |
| Frontier review | Code, governed data, and targeted pixel review complete; full release matrix pending |

## Improvement sweeps

| Date | Sweep | Result | Evidence |
|---|---|---|---|
| 2026-07-27 | Governed NYC ingestion, annual replay, ensemble engine, causal controls, semantic buildings, receipts, and registration | Implemented; 8/8 Atlas tests, 78/78 focused tests, and 747/747 non-browser tests reported passing | Immutable source receipt, compile receipt, all-region execution, control sensitivity, deterministic replay, native v4 contribution |
| 2026-07-27 | Deep correctness and experience audit | Found shared comparison, sparse refusal, sector modeling, visual evidence, coverage, and loading gaps that existing tests do not exercise | `forecast-model.js`, `index.js`, `v4-contribution.js`, compiled dataset coverage, and application profile review |
| 2026-07-27 | Correctness and evidence closure sweep | Replaced capped monoliths with 262 hash-pinned shards; added refusal gates, tax-class rules, common draws, shared lockstep comparison, branch layers, complete inspections, milestone focus, and fail-closed validation | 263-output compile receipt, all-shard hash checks, sparse and sector tests, comparison receipt, V4 object-inspection closure |
| 2026-08-01 | Citywide price-surface and default-view correction | Added a compact 262-region governed surface, deterministic price-only forecasts, shared heat colors and range, citywide overview targets, adaptive wide-camera fog, inspections, schema gates, and focused browser proof | 264-output compile receipt, 3.1 MB surface, 5,749 sale rows, 262 inspected layers, focused tests, desktop WebGPU screenshot and pixel readback |

## Frontier improvements

The detailed paragraphs below preserve the findings at the start of the
correctness sweep. Their code and governed-data remedies are implemented; the
remaining authority is the browser and pixel evidence named in the final
acceptance gates.

NYC Development Atlas reaches 10/10 when a first-time user can move through a
recognizable neighborhood history, understand each recorded change, fork the
2026 state into credible policy scenarios, and explain why the branches
diverge. The map, timeline, metrics, and receipts must always describe the same
observations and simulations.

Correctness comes first. The declared comparison currently returns one
precomputed comparison object instead of the shared executable
`comparisonBranches` contract. The terminal contribution enters Compare mode
but contains no semantic layers with the comparison role. Baseline and selected
policies also seed random draws with different policy IDs, so their shocks and
candidate feasibility draws are not shared. Core must execute isolated
business-as-usual and intervention branches from one 2026 state, one governed
candidate population, and one exogenous draw set. It must expose branch drift,
settlement, and spatial deltas.

Sparse-data refusal must control output, not only label a diagnostic. Brooklyn
Navy Yard, for example, has no governed tax-class-2 price years and no retained
capacity sites, yet the model starts at a hard-coded $750,000 and publishes a
2030 interval. A selection without sufficient observed prices must refuse the
price forecast. A selection without capacity candidates must refuse the
development pipeline. Historical exploration can remain available with an
explicit coverage receipt.

Property class must change the development model. Tax-class-4 currently changes
the historical price series but still creates residential units, affordable
units, and residential-capacity projects. The SoHo commercial journey therefore
uses the wrong physical output. Add sector-specific capacity, floor-area,
occupancy, completion, and affordability rules, or disable unsupported future
sectors. Tax-class-1, tax-class-2, tax-class-4, and the all-class proxy must not
share one residential project generator.

The historical journey needs more visible evidence. The compiled browser data
retains at most 20 historical sites and 24 capacity candidates per NTA. Thirty-two
NTAs have no retained historical sites and 77 have no retained capacity
candidates. The UI must disclose those caps and show per-selection coverage
before Start. A 262-option select is not enough. Add borough grouping, search,
map selection, coverage indicators, and a refusal state for selections that
cannot support the chosen experiment.

Playback should behave like an urban time machine rather than an annual counter.
Show sale volume and price history as a persistent chart, then stage filing,
permit, construction, signoff, and occupancy events on the map. Pause on
consequential milestones. Preserve an identified building through every stage.
Observed milestones, modeled interpolation, current capacity, and simulated
future construction need distinct forms, not only provenance fields. Avoid
instant annual height jumps when the story depends on construction progression.

Selection must close the evidence loop. Historical volumes currently lack
object-level inspections, while future inspection is capped at twelve projects.
Every visible project should expose source job, BBL, source-row IDs, milestone
dates, footprint origin, proposed area, stage origin, and any modeled
interpolation. A sale aggregate should expose year, tax class, sale count,
transferred units, nominal-price basis, and missing-year status.

The camera should direct attention without taking control. Overview frames the
selected NTA and persistent context. During playback, event intents briefly
frame the filing, construction, or occupancy site responsible for the current
story. Top view supports block comparison. Free view preserves manual
navigation. Compare view shows both policy skylines, candidate choices,
completion timing, affordable units, and price intervals with stable branch
identity.

Validation must test the model that makes the forecast. The current holdout
uses a short momentum predictor, while the public forecast adds policy,
financing, demand, construction cost, supply, capacity selection, and seeded
shocks. Evaluate the actual forecasting pipeline over rolling origin periods.
Report error, interval calibration, selection stability, and results by
borough, NTA coverage, and tax class. Do not promote a small descriptive MAPE
as validation of the forward policy model.

Performance must preserve evidence. The Atlas eagerly loads about 13 MB of
compiled history and capacity for all 262 NTAs even though one NTA is visible.
Split immutable indexes from borough and NTA payloads. Load selected geometry,
sales, milestones, footprints, and candidates on demand. Record transferred
bytes, parse time, retained layers, compositor suppression, frame time, and
mobile memory without dropping consequential sites silently.

## Acceptance gates

- [x] Shared comparison executes two isolated branches with identical
      observations, candidates, exogenous draws, seed, and clock.
- [x] Compare mode renders business-as-usual and intervention buildings,
      project choices, units, affordability, and prices as distinguishable
      spatial evidence.
- [x] Missing price history refuses price forecasting instead of using the
      hard-coded fallback value.
- [x] Missing capacity refuses the future project pipeline while preserving
      honest historical exploration.
- [x] Each supported property class uses sector-correct capacity, units,
      occupancy, price, and policy equations.
- [x] Every NTA reports retained sales, historical sites, capacity candidates,
      sampling caps, and unavailable experiment features before playback.
- [x] Every visible historical or future building exposes source identity,
      footprint origin, milestones, stage origin, assumptions, and limitations.
- [x] Historical price, filings, permits, construction, signoff, and occupancy
      remain visually and temporally distinguishable.
- [x] Rolling holdouts evaluate the actual public forecast pipeline and fail
      closed when calibration or sample coverage is insufficient.
- [ ] Borough and NTA data load on demand with receipt-bound byte, parse,
      memory, layer-budget, and frame-time evidence.
- [ ] Neighborhood selection adds borough grouping, text search, and direct
      map selection while retaining pre-playback coverage and refusal labels.
- [ ] Historical parcel-capacity, financing, and construction-cost snapshots
      support rolling-origin evaluation of the exact published pipeline rather
      than the current honest validation refusal.
- [ ] Desktop and mobile human review proves neighborhood, building-stage,
      branch, uncertainty, and metric recognizability.
- [ ] Screenshots, pixel evidence, runtime receipts, dataset hashes, and build
      identity bind to the same executed browser path.
- [x] Default and settled views frame all governed NYC neighborhoods as a
      recognizable price surface instead of isolating the selected project.
- [x] Historical observations, the missing 2026 snapshot, forecast intervals,
      and sparse-region refusals remain visibly and semantically distinct.
