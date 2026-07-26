# Maritime Trade Plugin Handoff

Owner contract: `public/shared/plugins/maritime-trade-global/plugin.json`

Profile contract: `public/data/application-profiles/maritime-trade-global-v1.json`

## Public simulation

The plugin models a seeded container voyage through an aggregate global corridor graph.
It is not a vessel tracker, carrier schedule, booking system, hydrographic navigator,
weather forecast, or operational ETA service.

The five checked-in scenarios now match their stated routes:

| Scenario | Modeled route | Governed distance |
| --- | --- | ---: |
| Asia-Europe mainline | Shanghai to Rotterdam through Suez | 10,500 NM |
| Transpacific eastbound | Shanghai to Los Angeles | 5,700 NM |
| Suez closure | Shanghai to Rotterdam around the Cape, with Suez and Panama excluded | 14,700 NM |
| North Atlantic cyclone | Rotterdam to New York/New Jersey | 3,400 NM |
| Panama restriction | Long Beach to New York/New Jersey through Panama | 5,200 NM |

`network-router.js` runs deterministic Dijkstra search over the governed, bidirectional
corridor graph. `voyage-scenarios-v1.json` owns route endpoints, required and blocked
canals, distance calibration, departure epoch, and uncertainty. The selected voyage
uses one vessel archetype and one declared speed policy.

`queue-engine.js` runs an FCFS multi-server discrete-event queue. Interarrival times
are exponential and service times are lognormal. The default run uses 32 independent,
named random streams and reports p05, p50, and p95 average wait.

`emissions-model.js` uses:

```text
propulsion load = reference load × (speed / service speed)^exponent
fuel = power × load × hours × specific fuel consumption
CO2e = fuel × fuel carbon factor
intensity = CO2e / (cargo TEU × distance NM)
```

The calculation includes sailing load and queue auxiliary load. A separate governed
calibration artifact runs declared joint low and high parameter cases over exponent,
reference load, engine power, SFOC, and queue auxiliary load. Those results are
deterministic engineering sensitivity, with null probability and confidence level.
They are not p05/p95, a prediction interval, or vessel-specific measurement error.

Queue p05/p50/p95 has a different meaning: it is the empirical distribution across
seeded discrete-event replicates with fixed model parameters. It covers simulation
randomness only. It does not cover queue parameter uncertainty, model-form error, or
the missing row-level calibration to observed port calls.

## Progressive state and events

`maritime-engine.js` emits `simulatte.simulationEvent.v4` rows ordered by the shared
deterministic scheduler:

```text
scenario configured
voyage departed
one leg-completed event per governed corridor
voyage arrived
queue entered
berth started
cargo discharged
container delivered
```

Every event includes a timestamp in hours since scenario start, causal parent IDs,
affected entity IDs, before and after state, evidence references, and independent
truth dimensions. `snapshots[n]` is the progressive state after `n` events. Container
records retain an ordered booked, loaded, discharged, delivered lineage.

The current World runner dispatches `scenario.run` once and requires a terminal result.
The plugin-local adapter therefore advances to the final snapshot when no phase is
provided. A v4 clock may call `scenario.run` with `phase: "start"` and repeated
`phase: "step"` values. No playback delay or plugin render loop is encoded.

## Semantic presentation

`presentation.js` first produces `simulatte.semanticPresentation.v4`. Its layers are:

| Layer | Semantic quantity |
| --- | --- |
| Maritime network | Active-route role for governed ports |
| Selected voyage | Cargo TEU, distance, speed, progress, disruption severity |
| Voyage actor | Progress, cargo, speed, event state |
| Destination queue | p05, p50, p95 wait and ensemble count |
| Emissions sensitivity | Low, baseline, and high CO2e deterministic parameter cases |

Each object has geometry, semantic quantities, truth dimensions, and evidence
references. The semantic contract contains no colors, final widths, label density,
LOD thresholds, camera commands, animation rates, DOM, or CSS.

The same file contains a temporary `adaptSemanticToV3` function. It maps semantic
objects into the current `pluginPresentation.v3` marker, path, actor, and camera-target
shape. This adapter is the only plugin location that chooses tones, radii, or line
width. Remove it after the shared compositor accepts semantic layers.

View intents request Overview while ready, Follow while sailing, and POV at the
destination queue and terminal. They never interrupt a manual override. The v3 camera
targets are compatibility targets, not immediate camera movement.

## Controls and comparison

The plugin declares controls for vessel archetype, slow/service/fast speed policy,
cargo TEU, and queue ensemble count. The current declarative UI can render these as
select and number fields.

`selected-vs-undisrupted` defines a synchronized baseline/intervention comparison with
a common seed. It compares transit days, queue wait, fuel, and CO2e. The comparison
reports queue stochastic quantiles and branch-specific emissions parameter-sensitivity
envelopes as separate structures; its composite receipt intentionally has no single
uncertainty distribution. Until the shared
branch runtime consumes the definition, `counterfactual.compare` runs the baseline
synchronously inside the plugin and stores both immutable results.

## Provenance and truth boundary

`public/data/maritime-trade-global/provenance-registry-v1.json` records source,
retrieval date, source version/document identity, license-verification status,
canonical source-identity hash, source-content-hash availability, row identity,
coverage, resolution, artifact hash, transformations, field truth, and uncertainty.
`calibration-artifacts-v1.json` makes the unresolved queue calibration and declared
emissions sensitivity machine-readable.

Source identity hashes are SHA-256 hashes of canonical source identity strings
(publisher, version/document identifier, and official URL). They are not represented
as source-content hashes. `sourceContentSha256` remains null because no immutable raw
WPI, UN/LOCODE, CPPI, IBTrACS, or IMO source snapshot is checked in.

| Input | Truth boundary |
| --- | --- |
| Port identity, UN/LOCODE, country, coordinate | Pinned observed public reference |
| Berth count and harbor archetype | Modeled |
| Corridors, distances, speeds, cargo, departure | Modeled or scenario |
| CPPI-shaped port service values | Modeled priors, not copied observations |
| IBTrACS-shaped cyclone tracks | Scenario, not observed storm or forecast |
| Vessel power and consumption | Modeled archetype |
| Queue arrivals and service | Simulated |
| Container identities and lineage | Simulated representative records |
| Fuel, CO2e, intensity, transit | Modeled or derived |

Remaining data limitations:

- No licensed or public AIS snapshot is activated.
- No observed carrier schedule, port call, cargo manifest, or container lineage is
  activated.
- The corridor graph is sparse and uses aggregate port-to-port geometry.
- Port service priors need a documented row-level calibration to a pinned CPPI
  release before they may be called observed.
- The current queue ensemble quantifies stochastic simulation variability only; it
  does not quantify calibration or model-form uncertainty.
- Emissions low/high cases are declared joint parameter scenarios, not probabilities,
  confidence intervals, or one-at-a-time parameter attribution.
- Upstream source-content hashes remain unavailable until licensed/allowed raw source
  snapshots are pinned; canonical source-identity hashes do not substitute for them.
- Dataset-specific licenses for WPI and UN/LOCODE were not verified, and rights for
  CPPI underlying third-party operational data are not asserted.
- Canal service parameters are declared models without a pinned source-row
  calibration.
- Cyclone tracks are climatology-shaped synthetic scenarios.
- Weather resistance, currents, waves, hull condition, draught, and auxiliary
  machinery are not vessel-specific.

## Core integration requirements

The plugin does not modify shared runtime files. Integration owns these deltas:

1. Regenerate `public/simulatte/platform/plugin-host/generated-plugin-registry.js`
   from `plugin.json`. The checked-in shared registry still embeds Maritime v1 and
   its old dataset declarations.
2. Keep the World script inventory limited to the active Maritime resources.
   Import-graph and manifest tests prove that the removed `routing.js`,
   `emissions.js`, `ports.js`, and `vessels.js` compatibility modules are not part
   of the runtime or deployment package.
3. Drive `phase: "start"` and `phase: "step"` from the shared simulation clock.
4. Consume `contributeV4()` as `simulatte.pluginContribution.v4` through the shared
   runtime and compositor, then remove `adaptSemanticToV3`.
5. Consume `viewIntent.v4` through the View Director and remove v3 camera targets.
6. Move common-seed baseline execution to the synchronized branch runtime.
7. Store and expose the causal timeline through the shared replay and scrubber.

The tier browser audit is intentionally deferred until item 1. Running it before
registry regeneration would validate the stale embedded manifest, not this plugin
contract.

## Focused proof

```bash
node --test tests/maritime-trade-global.test.cjs
```

The focused suite verifies all five route intents, deterministic replay, chronological
causal events, progressive state, container conservation, truth and evidence coverage,
semantic presentation purity, v3 adapter validation, queue quantiles, explicit
separation of queue stochastic uncertainty from emissions parameter sensitivity,
calibration/source metadata, completion receipts, settlement obligations, progressive
and terminal playback paths, common-seed comparison, and every plugin/data integrity
hash.
