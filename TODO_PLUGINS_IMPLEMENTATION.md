# TODO_PLUGINS Implementation Log

Companion to [TODO_PLUGINS.md](TODO_PLUGINS.md). This is the running ledger of what
has actually been built, file by file, as the program is implemented. It is written to
be honest about state: every entry says what is wired end-to-end versus what is a
governed offline / synthetic path, so no completion is fabricated.

The build follows the document's own **Final priority decision** ordering, not section
order:

1. Named deterministic RNG streams
2. Stable discrete-event scheduling
3. Event and state receipts
4. Worker-backed ensemble execution
5. Spatially/temporally queryable environment snapshots
6. Generic capability-based cross-plugin fields
7. National geospatial presentation

…and only then the `food-recall-us` application on top.

## Backward-compatibility stance

SDK v1 plugins (`cable-trader`, `safety-explorer`, `sun-walker`) keep working unchanged.
The platform is extended to **also** accept `sdkVersion: 2` manifests, which unlock the
new ports, permissions, presentation v3, and `applicationProfile.v3`. Nothing about the
v1 contract surface is removed.

---

## Layer A — Platform simulation substrate (SDK v2)

Status: **built and wired end-to-end.**

The five simulation-substrate ports the whole program depends on now exist, are
permission-gated, and are injected by the host. New host modules:

- `public/simulatte/platform/plugin-host/plugin-random.js` — named, splittable,
  deterministic RNG streams. Integer-only `cyrb128` seeding + `sfc32` generator (stable
  across browsers/Node). A stream's state is derived purely from its identity string
  (`rootSeedHash | algo | pluginId | scenarioId | streamName | entityId`), so order of
  evaluation never changes a sequence and two named streams never interfere. Provides
  `float/int/integer/bool/pick/weightedIndex/shuffle/normal/lognormal/exponential/`
  `poisson/binomial/multinomial`, `drawCount()`, splittable `stream(child)`, and a
  per-stream `receipt()` with identity hash + draw count. Permission `random.stream.v1`.
- `public/simulatte/platform/plugin-host/plugin-scheduler.js` — stable discrete-event
  scheduler. Binary min-heap ordered strictly by `(time, priority, sequence)`; immutable
  events; cancellation via supersession; monotonic clock that fails closed on time
  reversal; maximum-event budget that throws on exhaustion; `drain(handler)`, `trace()`,
  `receipt()`. Permission `simulation.schedule.v1`.
- `public/simulatte/platform/plugin-host/plugin-environment.js` — spatially/temporally
  queryable environment samples over **pinned** snapshots. Returns the
  `simulatte.environmentSample.v1` shape (values + quality + `sourceSnapshotIds`). With
  no gridded snapshot bundled it uses a deterministic analytic field explicitly labelled
  synthetic (`observed: false`) so it is never mistaken for observed weather. Permission
  `environment.read.v1`.
- `public/simulatte/platform/plugin-host/plugin-geography.js` — WGS84↔world-planar
  equirectangular projection anchored on the world's `coordinateSystem.projection`, plus
  haversine `distanceMeters`. Lets plugins present national geography by longitude/latitude
  without minting fake world node IDs. Permission `geography.project.v1`.
- `public/simulatte/platform/plugin-host/plugin-compute.js` — worker-backed ensemble
  execution with a deterministic cooperative-inline fallback (identical results either
  way because each replicate is keyed by its index, not by execution order). Reduces
  replicates into `count/mean/median/p05/p95/standardError`. Permission `compute.worker.v1`.

Contract + wiring edits (backward compatible — v1 plugins untouched):

- `platform/contracts/plugin-contracts.js` — accepts `sdkVersion` 1 **or** 2
  (`SUPPORTED_SDK_VERSIONS`); adds the six new permissions (incl. `ui.geospatial.v1`);
  adds **presentation v3** validation (`geoMarkers`, `geoPaths`, `geoAreas`,
  `choropleths`, `geoCameraTargets` with lng/lat bounds); adds **applicationProfile.v3**
  (scenario-owning, mission-free) validation.
- `platform/plugin-host/plugin-sdk.js` — maps the five new ports to permissions and
  binds any port exposing `forPlugin(pluginId)` per plugin.
- `platform/plugin-host/plugin-runtime.js` — rejects a v3 geospatial presentation from a
  plugin lacking `ui.geospatial.v1`.
- `app/plugin-presentation.js` — projects v3 geo primitives into planar world metres via
  the geography projection derived from the active world.
- `app/main.js` + `index.html` — construct and inject the five ports as `corePorts`;
  load the five new module scripts before the presentation compiler and app.

Note: migrating Cable Trader's private xorshift onto `sdk.random` is done as part of its
v3 upgrade (Layer E) so the v1 contract stays intact until then; the substrate itself is
exercised end-to-end by `food-recall-us` (Layer D), which is an SDK v2 plugin using all
five ports.

## Layer B — National world + geospatial presentation

Status: **built.** The dedicated national world artifact and the geospatial rendering
path exist and are internally consistent (projection roundtrip verified: a hub's WGS84
coordinate projects to the exact planar `{x, y}` stored in the world node, and back).

- `tools/food-recall-us/geo-reference.mjs` — pinned public reference geography (50 states
  + DC centroids, 12 distribution-hub cities, 14 aggregate freight corridors) and the
  shared equirectangular projection + haversine helpers.
- `tools/food-recall-us/build-national-world.mjs` → generates
  `public/data/simulatte/worlds/us-food-network-v1.json` (`simulatte.autonomyWorld.v1`):
  63 nodes (state centroids + hubs), 28 freight-corridor segments, national camera
  bounds, `coordinateSystem.projection` for the geography port, and a synthetic claim
  boundary. Content-hashed.
- Geospatial rendering: presentation v3's `geoMarkers/geoPaths/geoAreas/choropleths/`
  `geoCameraTargets` are projected by `app/plugin-presentation.js` using the projection
  derived from the active world (Layer A). A plugin presents national geography by
  longitude/latitude with no fake world node IDs.

## Layer C — Governed data ingestion

Status: **built.** Federal fetchers are real and endpoint-accurate but are not run in a
normal flow (live network only at build time); the runtime datasets are generated
synthetic/aggregate, deterministic, and content-hashed.

- `tools/food-recall-us/ingest-lib.mjs` — shared fetch→normalize→hash→pin-snapshot with
  full provenance (sourceId, retrievedAt, query, contentSha256, recordCount, claim
  boundary).
- Nine federal fetchers: `fetch-openfda-enforcement`, `fetch-fsis-recalls`,
  `fetch-fda-core`, `fetch-fda-rfr`, `fetch-cdc-nors`, `fetch-usda-nass`, `fetch-faf5`,
  `fetch-noaa-snapshot`, `fetch-census-consumer-zones` — each pins a governed snapshot
  with the source's documented limitation as its claim boundary.
- `normalize-recall-events.mjs` — merges openFDA + FSIS snapshots into one historical
  artifact, preserving the regulator distinction and observed/reconstructed labels; fails
  loudly (no fabrication) when snapshots are absent.
- `build-food-data.mjs` — deterministic synthetic generator (seeded via the Layer-A RNG)
  producing the seven governed runtime datasets under `public/data/food-recall-us/`:
  facilities, freight corridors, commodity profiles, hazard-model registry (growth,
  thermal D/z, stratified dose-response, surveillance-stage timings), consumer zones,
  historical recalls, environment snapshot. Emits `dataset-manifest.json` with real
  sha256s. (`build-synthetic-facility-network.mjs` / `build-freight-corridors.mjs` are
  entrypoints into this generator.)
- `build-scenario-packs.mjs` — the four declared scenarios (leafy-green baseline, egg
  cold-chain, listeria RTE, undeclared allergen) with contamination seeding, detection
  profile, and default intervention.
- `validate-food-artifacts.mjs` — schema-id + content-hash cross-check (passes: 7/7).
- `write-food-manifest.mjs` — authoritatively rewrites the plugin manifest `datasets`
  block from the generated dataset manifest so references never drift.

## Layer D — food-recall-us plugin

Status: **built and integration-verified** through the real plugin runtime (activation,
views, presentation, actions, capabilities, settlement, scenario switch all exercised).

Bundle `public/shared/plugins/food-recall-us/` (SDK v2):

- `food-engine.js` — the deterministic discrete-event engine. Real science:
  - **Lot ledger** with strict mass + organism-load balance on every transformation
    (`massIn = massOut + waste`; `loadOut = (loadIn + envTransfer)·10^-R`); lot **split**
    partitions load multinomially at low counts, proportionally at high counts.
  - **Predictive microbiology**: Ratkowsky √ growth integrated over each transit
    time–temperature interval, capped at N_max; thermal inactivation `D(T)=Dref·10^((Tref−T)/z)`.
  - **Cold chain**: first-order cargo-temperature response toward setpoint/ambient with a
    hazard-rate reefer failure (or scenario-forced failure) and repair window.
  - **Consumer exposure**: `dose = C·serving·fractionConsumed·10^-Rprep` over stochastic
    preparation profiles.
  - **Dose-response**: beta-Poisson / exponential from the registry, stratified by
    pathogen + food category + population.
  - **Surveillance**: observed cases are a binomial subset of true illnesses; staged
    detection delays (incubation→care→specimen→sequence→cluster→traceback).
  - **Traceback**: candidate-lot scoring over the lot-lineage descendant closure,
    penalised by record missingness; reports the true-source rank.
  - **Recall**: descendant-closure of target lots, notification success by depth,
    inventory removal, and metrics — sensitivity, precision, safe-food waste, cases
    averted (common random numbers vs baseline).
  - Fully deterministic (same seed ⇒ same result, verified) using the Layer-A RNG streams
    and the scheduler for stable event ordering. A real lineage bug found and fixed during
    build: split child lots weren't recorded in the lineage graph, which orphaned every
    downstream lot from its contaminated ancestor and zeroed recall sensitivity — now the
    split is a first-class lineage event.
- `food-presentation.js` — national geospatial presentation (v3) + inspector/HUD views.
  Facilities as `geoMarkers`, corridors as `geoPaths`, per-zone estimated illnesses as
  `choropleths`; **confirmed** contamination (red) is never the same tone as **simulated**
  risk (amber). Provenance panel exposes scenario kind, dataset hashes, engine/RNG
  versions, and the claim boundary.
- `index.js` — lifecycle: `activate` (require+compile datasets, sample pinned environment,
  run baseline, register state, append scenario receipt), `setScenario` (re-seed),
  `contributeRequest` (idempotent preflight; obligation post-mission), `handleAction`
  (`recall.issue`, `counterfactual.compare`, `ensemble.run` via `sdk.compute`), `settle`
  (source-rank / lineage / containment / honest-uncertainty obligations — reports `unmet`
  truthfully rather than fabricating containment), `present`, `view`, and capabilities
  `simulation.food-recall.v2` / `traceability.lookup.v1` / `field.food-contamination.v1`
  (nearest-facility lookup via `sdk.geography`). Uses all five SDK v2 ports.
- `plugin.json` / `config.schema.json` / `default-config.json` — SDK v2 manifest with the
  seven governed dataset references (real sha256), the four scenarios, and receipt
  schemas. `plugins:sync` + `plugins:check` both pass (registry verified, boundary clean).
- `public/data/application-profiles/food-recall-us-v1.json` — `applicationProfile.v3`
  (scenario mode, mission-free), registered in `autonomy-manifest.json` and labelled in
  `main.js`.

Integration smoke (through the real runtime, all four scenarios): recall sensitivity
0.35–0.52, precision 1.0, cases averted 2–53; ensemble of 24 replicates summarised with
p05/p95; capability + settlement + scenario-switch all functional.

Not verified (needs a browser + can't run here): full app boot of the national-world
**tier**. The plugin, datasets, world artifact, profile, and geospatial projection are all
in place and mutually consistent; wiring the `country` world-tier selector to swap
`manifest.world` to `us-food-network` is the one remaining boot step (the geo layers
already project correctly because the geography port's default projection is the national
one).

## Layer E — Sibling plugin upgrades

Status: **built and verified** (all four plugins `plugins:sync` + `plugins:check` clean).

- **Cable Trader v3** (`cable-trader`, now SDK v2): migrated its private xorshift generator
  onto `sdk.random` — `simulateNetwork` takes a host-provided named stream keyed by the
  scenario seed, so its randomness participates in platform receipts and is independent of
  other plugins' draws (verified: `sdk.random`-driven run is deterministic and fulfils
  4096/4096 needs). Falls back to the private generator for standalone use. Added the
  neutral `field.logistics-service.v1` capability (transit-delay + availability prior from
  the current allocation) — the exact one-way provider Food Recall consumes, so plugins
  share fields instead of reaching into each other's state.
- **Safety Explorer v2** (`safety-explorer`, stays SDK v1): added **severity separation**
  (fatal ≫ injury ≫ property-only), **empirical shrinkage** (a lone crash on a low-volume
  segment is pulled toward the corpus mean so it can't dominate a route), and **evidence
  coverage** so a score is never shown as more certain than its count. New
  `routing.dimension.historical-observation.v2` cost dimension and neutral
  `field.mobility-risk.v1` capability, preserving the observed-vs-simulated distinction.
- **Sun Walker v2** (`sun-walker`, now SDK v2): separated direct-sun routing from thermal
  comfort instead of relabelling one as the other. New `field.thermal-comfort.v1`
  capability combines the pinned `sdk.environment` sample (air temperature + solar
  elevation) into a clear-sky mean-radiant-temperature proxy plus a thermal dose from the
  selected route's direct-sun seconds, with new
  `routing.dimension.mean-radiant-temperature-dose.v1`.

## Cross-plugin field graph (§18)

The neutral, versioned field contracts now exist and flow one-way:

```
host time + environment + random + scheduler
        Sun Walker (field.thermal-comfort.v1)
        Safety Explorer (field.mobility-risk.v1)
        Cable Trader (field.logistics-service.v1)  ──▶  Food Recall (consumes logistics)
Food Recall provides: simulation.food-recall.v2, traceability.lookup.v1, field.food-contamination.v1
```

No provider depends back on Food Recall; the capability graph stays acyclic (enforced by
`resolveCapabilityGraph`).

---

## How to regenerate / run

```bash
node tools/food-recall-us/build-national-world.mjs      # national world artifact
node tools/food-recall-us/build-food-data.mjs           # governed synthetic datasets
node tools/food-recall-us/build-scenario-packs.mjs      # scenario packs
node tools/food-recall-us/validate-food-artifacts.mjs   # schema + hash cross-check
node tools/food-recall-us/write-food-manifest.mjs       # plugin dataset references
npm run plugins:sync && npm run plugins:check           # integrity + boundary
# Federal snapshots (build-time, network required, optional):
node tools/food-recall-us/fetch-openfda-enforcement.mjs
node tools/food-recall-us/normalize-recall-events.mjs
```

## What is verified vs. not

- **Verified in Node** (my own new code, not the project test suite, per the request to
  not run tests): projection roundtrip; deterministic same-seed engine output; the full
  plugin activating through the real runtime with all five SDK v2 ports; presentation v3
  projecting geo→planar; recall / ensemble / capability / settlement / scenario-switch;
  Cable Trader's `sdk.random` migration; `plugins:sync` + `plugins:check` for all four
  plugins.
- **Not run** (per request): `npm test`, `npm run check:simulatte`, and any browser boot.
- **Needs a browser to confirm** (single remaining wiring step): binding the `country`
  world-tier selector so `manifest.world` swaps to `us-food-network` behind the
  `food-recall-us-v1` profile. The plugin, datasets, world, profile, geospatial projection,
  and profile registration are all in place and mutually consistent; the geo layers already
  project correctly because the geography port's default projection is the national one.
