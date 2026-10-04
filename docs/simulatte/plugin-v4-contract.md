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
renderer state. Optional `selectionGroup` on select controls declares an ordered
permutation of one shared option set. The host swaps the displaced selection
before applying the complete parameter snapshot, and restores the group if the
change fails. The plugin still validates the resulting order. Label prefixes
separated by `:` or `·` form collapsible presentation groups; they confer no
simulation authority.

## Selected objects and prepared alternatives

The optional `objects` array extends the existing contribution envelope. Each
object declares `id` (a presentation layer ID), `label`, `description`, `hit`,
and `actions`. Optional `inSelector: false` keeps secondary links or sampled
segments out of the default menu; they remain directly pickable and available
through All. Object labels name stable identities; changing state belongs in
inspection fields. Layers without an object declaration are explanatory overlays.
`hit` declares `shape` (`point`, `path`, `polygon`, or `bounds`), `radiusPx`,
`priority`, and an optional `layerId` for a separate surface. The renderer supplies
projected geometry and depth; cabinet bounds use the same dimensions as drawing.
Region footprints support interior clicks. Equal overlapping paths ask for an
explicit choice in the accessible selector. Selection never implies Focus.

Each action declares `id`, `label`, `targetId`, `available`, `execution`
(`preview`, `continue`, or `restart`), `command`, `values`, and `proposedChange`.
Plugins own these meanings and validate their commands. The shared inspector
renders and dispatches them through session operations. Global policies must be
identified as global, even when accessed from a selected object.

Preview commands return presentation layers, inspection fields, object actions,
accepted-control values, and an identified candidate without publishing a new
accepted run. A `prepared` restart action carries the candidate token; the plugin
validates that its accepted base still matches and consumes the candidate once.
`afterApplyTargetId` optionally restores selection to an accepted object. The
controller promotes the prepared result instead of resetting and searching again.
A scenario change or replay invalidates host previews through session generation.
The plugin independently rejects stale or previously consumed candidate tokens.

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
