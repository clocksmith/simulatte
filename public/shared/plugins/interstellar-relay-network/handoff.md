# Interstellar Relay Network Handoff

Owner contract: `public/shared/plugins/interstellar-relay-network/index.js`.

## Completed domain surface

| Surface | Output |
|---|---|
| Data | Governed Gaia, hardware, scenario, and model datasets with immutable hashes |
| Models | Space motion, moving-target light time, optical photon budget, and deterministic store-forward scheduling |
| Events | Chronological causal events with before/after state and evidence |
| State | One-event progressive packet state and deterministic settlement |
| Presentation | Semantic stars, links, packet, quantities, truth axes, and true 3D spatial evidence |
| Controls | Epoch, packet size, processing delay, terminal, and scenario seeds |
| Comparison | Common-seed, synchronized direct baseline and relay intervention |
| Views | Declarative overview, follow, and evidence-derived 3D framing |
| Receipts | Data, model, scenario, run, packet, comparison, and settlement evidence |

## Omission coverage

The model catalog defines seven canonical omissions. Runtime validation rejects
unresolved omission references. Model receipts, events, metrics, semantic
objects, inspections, comparisons, and settlement expose the applicable rows.
Reliability outputs state that they are conditional on continuous contact and
hypothetical infrastructure.

## Core assumptions

- Core consumes `contributeV4()` and preserves the ICRS Cartesian three-vector.
- Core retains spatial transformation provenance through display projection.
- Core treats signed ICRS-z as physical depth, not draw order.
- Core arbitrates view intents and manual override.
- Core chooses visual styling, aggregation, labels, culling, and LOD.
- Core runs synchronized comparison branches.

## Temporary compatibility

`createV3CompatibilityPresentation()` maps semantic quantities to existing v3
marker, path, actor, and camera-target shapes. It preserves 3D coordinate arrays
but cannot carry the full omission, provenance, or spatial-evidence contract.
Remove it after all consumers use v4.

## Remaining limits

- There is no observed interstellar terminal or relay infrastructure.
- Continuous contact is assumed.
- Acquisition, maintenance, retries, plasma effects, and complete
  detector/background-noise physics are omitted.
- The link budget is an engineering scenario, not a calibrated operational model.
- Star motion uses linear propagation and does not load full Gaia covariance.
- Missing radial velocity is replaced by zero with explicit missing uncertainty.
- Focused tests prove contracts, causality, custody, and deterministic
  computation. They do not prove shared compositor pixels or browser camera
  behavior.
- Plugin-manifest hash changes require the integration owner to regenerate the
  shared plugin registry before browser evidence can be authoritative.
