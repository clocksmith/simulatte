# Simulatte Plugin Contract v4

V4 makes plugin output semantic and evidence-bearing. Plugins describe domain
state, causal events, quantities, controls, inspections, and desired views.
Core owns playback, replay, camera arbitration, clustering, label placement,
screen-space styling, and final rendering.

The executable validators are:

- `public/simulatte/platform/contracts/plugin-v4-contracts.js`
- `public/simulatte/platform/contracts/plugin-v4-adapters.js`

The first file is authoritative when this document and runtime behavior differ.

## Contribution envelope

Every plugin produces one exact envelope:

```js
{
  schema: "simulatte.pluginContribution.v4",
  pluginId,
  presentation,
  events,
  controls,
  state,
  inspections,
  provenanceRecords
}
```

`presentation`, `events`, controls, progressive state, and inspection fields
carry provenance. Every evidence reference must resolve to one record in
`provenanceRecords`.

## Truth and provenance

Truth metadata uses independent axes:

```js
{
  schema: "simulatte.provenance.v4",
  axes: {
    origin: "observed | derived | modeled | simulated | scenario",
    temporalStatus: "historical | snapshot | forecast | live",
    uncertainty: null | {
      kind: "interval | distribution | confidence | missing",
      value: {}
    }
  },
  evidenceRefs: [{
    id,
    datasetId,
    rowId,
    contentHash,
    transformationId,
    modelReceiptId
  }]
}
```

A simulated value may depend on observed inputs. A derived value may remain
uncertain. Neither fact is lost by flattening both into one label.

Provenance records have kind `dataset`, `row`, `transformation`, or `model`.
Rendered objects should reference source-row records when the source exposes
row identity. Model records identify algorithms, equations, calibration limits,
and validation evidence in metadata.

## Events and time

Domain events use `simulatte.pluginEvent.v4`. They include a plugin-local
monotonic sequence, simulation time in milliseconds, causal event IDs, one
correlation ID, payload, and provenance.

Core builds the causal timeline and owns:

- playback rate;
- pause, seek, step, and replay;
- deterministic event delivery;
- synchronized comparisons;
- branch creation from a replay position.

Plugins must not use presentation delay as the simulation clock.

## Presentation

`simulatte.pluginPresentation.v4` contains semantic layers and view intents.
Layer geometry is one of:

- `node`
- `node-path`
- `segments`
- `point`
- `polyline`
- `polygon`

Layer kinds are `point`, `path`, `area`, `actor`, `field`, or `label`.
Plugins provide a quantity, semantic role, importance, aggregation key,
temporal extent, and provenance.

Plugins do not provide final colors, line widths, point radii, opacity, label
placement, or clustering. Core derives these from quantity, truth origin,
uncertainty, role, density, viewport, and selection state.

## Views and controls

View intents use `overview`, `follow`, `pov`, `compare`, or `free`. A view
intent names semantic target IDs, a causal reason event, priority, and
transition preference. Core arbitrates intents. Manual camera input remains
authoritative until the user releases it.

Controls use a consistent host-rendered definition. Comparison definitions
name baseline and variant scenario IDs and declare whether clocks synchronize.
Controls describe scenario parameters. They do not directly mutate camera or
renderer state.

## Compatibility

V1 through v3 presentations, UI fields, and events pass through the backward
adapter. The adapter deliberately discards plugin-owned final visual styling.
This keeps old plugins operational while making their missing provenance
visible as a migration gap.

Direct v4 plugins expose `contributeV4()` and return the exact contribution
envelope. Draft schemas are not v4 and fall back to the compatibility path.

## Profile boundary

The public audit covers twelve connected profiles:

1. Asteroid Defense
2. Cable Trader
3. Food Recall
4. 256-GPU AI Supercluster
5. Grid Resilience
6. Interstellar Relay Network
7. Maritime Trade
8. Neighborhood Bulk Pool
9. NYC Development Atlas
10. Orbital Transfer Planner
11. Subsea Network
12. Sun Walker

City is shared world data and simulation substrate, not another experience.
Blank is a separate product and has its own audit.
Safety Explorer source and historical documentation remain in the repository,
but it is not connected to the public profile or plugin registries.
