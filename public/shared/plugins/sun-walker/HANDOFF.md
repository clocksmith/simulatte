# Sun Walker v4 handoff

Owner contract: `public/shared/plugins/sun-walker/plugin.json`

## Domain result

Sun Walker compares governed route alternatives using deterministic clear-sky
building-shadow exposure at each simulated sample arrival time. It no longer treats
one segment-midpoint solar position as the state for every point on that segment.

The route objective is:

```text
generalizedCost =
  travelSeconds
  + directSunSeconds * directSunWeight
  + unknownSeconds * unknownWeight
```

The selected alternative must also satisfy:

```text
addedTravelSeconds <=
  min(maximumAddedTimeSeconds, fastestTravelSeconds * maximumAddedRatio)
```

The simulation samples each route polyline at bounded spatial intervals. Sample time
is derived from route distance and configured walking speed. Solar position is
recomputed for every sample. A sunward ray is tested against the indexed retained
building prisms. Missing building height propagates `unknown`; it does not become
shade or direct sun.

## Truth and evidence

The implementation uses independent truth axes:

```js
{
  origin: "observed | derived | modeled | simulated | scenario",
  temporalStatus: "historical | snapshot | forecast | live",
  uncertainty: {
    kind: "interval | distribution | confidence | missing",
    value: {}
  }
}
```

`DataReceipt` references the verified active world-building hash, every retained
building row ID, the governed model registry hash, and transformation IDs.
`ModelReceipt` records equations, citations, parameters, seed, calibration status,
validation checks, and missing uncertainty inputs. Samples, events, state,
comparisons, metrics, and semantic layers reference those receipts.

The governed model registry is:

`public/data/sun-walker/sun-walker-model-governance-v1.json`

It cites the NOAA fractional-year solar equations and the NYC public building
footprint description. The active world receipt remains authoritative for the exact
frozen building rows and hash.

## Event and state shapes

`simulatte.simulationEvent.v4` rows are chronological and form a single causal chain:

```text
walk-initialized
  -> exposure-direct | exposure-shade | exposure-unknown | exposure-night
  -> walk-completed
```

Each event carries timestamp, causal parents, affected route/segment/building
entities, before/after state, semantic quantities, evidence references, and truth.

`simulatte.progressiveSimulationState.v4` snapshots track:

- status and progress;
- current segment;
- completed and total samples;
- accumulated direct-sun, shade, unknown, and night seconds.

## Presentation, controls, and views

`semanticPresentation()` returns `simulatte.presentationLayerSet.v4` with semantic
route exposure, comparison baseline, progressive exposure samples, and causally
linked shadow evidence. These layers declare quantities and evidence, not final
colors, line widths, label density, LOD thresholds, or animation rates.

Declarative view intents request:

- overview after route alternatives are ready;
- follow while samples advance;
- POV at exposure-state transitions;
- compare after completion;
- free camera on user request.

All intents preserve manual override.

Control definitions include departure instant, detour constraints, direct-sun
weight, and walking speed. Tree-canopy and weather controls are explicitly disabled
until governed datasets exist. The comparison model synchronizes fastest and
shade-selected routes by elapsed walk progress.

## Temporary compatibility adapter

`compatibility-adapter.js` converts semantic state to
`simulatte.pluginPresentation.v2` for the current renderer. This is the only
Sun Walker module with legacy tones, widths, or renderer camera targets.

The adapter:

- bounds route widths to 3 world meters;
- emits at most 64 shadow areas;
- emits only buildings that causally occluded a visible route sample;
- issues no camera command;
- owns no timer, render loop, or playback delay.

Remove this adapter after core consumes semantic presentation v4.

## Core integration needed

The owning integrator must:

1. Add `truth.js`, `sun-route-simulation.js`, `presentation.js`, and
   `compatibility-adapter.js` before `index.js` in the shared runtime script
   inventory.
2. Regenerate the plugin registry from `plugin.json`; do not hand-edit it.
3. Let the shared simulation clock call `scenario.run` start/step without taking a
   delay from the plugin.
4. Consume `semanticPresentation`, `eventTimeline`, `simulationState`,
   `controlModel`, and `comparisonModel` through the v4 adapter.
5. Let the View Director arbitrate view intents and manual camera override.
6. Replace the compatibility projection when the compositor accepts the semantic
   layer set.

The current route profile remains v2 for compatibility. It can select the accurate
route immediately, but progressive playback needs the shared scenario runner to
dispatch the plugin action lifecycle.

## Claim boundary

Sun Walker models clear-sky direct-sun occlusion by retained building footprints and
available heights. It does not currently model clouds, diffuse or reflected
radiation, street trees, canopy seasonality, awnings, detailed facades, terrain
slope, surface temperature, humidity, wind, or physiological thermal comfort.
Unknown building height propagates uncertainty. The result is a deterministic
modeled forecast, not observed street shade.
