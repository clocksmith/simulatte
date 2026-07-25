# Cable Trader integration handoff

Owner: `public/shared/plugins/cable-trader/`

## Domain truth

Cable Trader is a deterministic, calibrated-synthetic exchange-network scenario. It is
not connected to operating hub inventory or observed exchange events.

The governed compatibility catalog is
`public/data/cable-trader/cable-compatibility-priors-v1.json`. It identifies five
connector families from official standards bodies and records exact source URLs,
retrieval time, coverage, and missing fields. It does not calibrate demand weights.

The four hubs, demand weights, event counts, starting inventory, and scenario modifiers
remain authored scenario inputs. The profile labels now have material effects:

| Scenario | Modeled change |
| --- | --- |
| July baseline | Base categorical weights |
| Campus return wave | More Manhattan demand and returns |
| Display-cable surge | Higher HDMI and DisplayPort-family demand |
| Brooklyn rebalancing | More Brooklyn demand with more Manhattan returns |

## Model

`network-simulation.js` generates seeded needs, returns, and journey-cost events. Each
day and cable family is solved using successive shortest residual paths over the
complete directed hub graph. The implementation uses Bellman-Ford relaxation because
reverse residual edges may have negative cost. Every one of the 300 day-family
allocations records an optimality result.

The route cost is modeled as governed NYC route distance in kilometers plus a seeded
journey penalty. It is not observed travel time, money, emissions, or inconvenience.
The simulation has one seeded realization and no calibrated interval. The v4 draft
contribution records this as distribution uncertainty with `ensembleSize: 1`.

## Events and state

The domain simulation emits:

- 31 immutable progressive snapshots, from day 0 through day 30;
- 30 chronological `simulatte.SimulationEvent.v4-draft` daily allocation events;
- causal parent IDs linking each day to the prior day;
- before and after inventory/service summaries;
- affected hub and cable-type IDs;
- data and model evidence references.

`scenario.run` supports `values.phase = "start"` and `"step"` without selecting a
playback delay. Calling `scenario.run` without a phase is the temporary eager adapter
for v1-v3 hosts.

## Semantic contribution

`v4-contribution.js` exposes `contributeV4()` through the shared v4 builder with:

- `simulatte.pluginContribution.v4`, `pluginPresentation.v4`,
  `pluginEvent.v4`, and `progressiveState.v4`;
- dataset, source-row, and model provenance records with closed evidence references;
- the complete event timeline and current progressive state;
- one semantic point per inventory hub and one semantic path per active transfer;
- raw quantity, node, and route-segment fields without final styles;
- duration and starting-inventory controls plus hub inventory inspection models;
- a synchronized optimized-versus-local-only comparison definition;
- advisory Overview and dominant-flow Follow ViewIntent rows.

The current `present()` method remains a v1 compatibility projection. Its tones,
world-space widths, actors, and `camera.focus` UI actions are not the intended v4
authority boundary.

## Required core integration

- Load `v4-contribution.js` after `plugin-v4-builder.js` as a selected plugin resource.
- Let the shared clock call `scenario.run` start and step phases.
- Map flow quantity to bounded screen-space styling in the compositor.
- Replace compatibility `camera.focus` actions with ViewIntent arbitration.
- Run the declared comparison through synchronized deterministic branches.
- Add the compatibility-prior dataset to the shared provenance registry.
- Regenerate the global plugin registry after all four parallel lanes settle.
- Add a final multi-select control shape before exposing selected cable families; the
  current shared v4 contract does not yet support multi-select.

Until that integration lands, the current City v2 host still treats Play as a route
journey and cannot provide truthful progressive browser evidence for this plugin.

## Remaining data limitations

- No observed hub inventories, exchanges, reservations, participant counts, or demand.
- No calibrated arrival, return, abandonment, compatibility, failure, or lifetime model.
- Five cable categories lack standards provenance in the current compatibility catalog.
- No hub capacity, delayed transfer, inventory condition, or item aging state.
- No ensemble service-level interval.
