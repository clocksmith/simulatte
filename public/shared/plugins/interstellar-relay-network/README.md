# Interstellar Relay Network

Owner contract: `public/shared/plugins/interstellar-relay-network/index.js`.

This plugin simulates a hypothetical optical packet relay over governed Gaia DR3
astrometry. It does not assert that relay terminals, continuous contacts, or an
operating interstellar network exist.

## Truth boundary

| Quantity | Origin | Temporal status | Uncertainty |
|---|---|---|---|
| Gaia astrometry | observed | historical | Catalog standard errors; covariance is not loaded |
| Propagated stellar positions | derived | forecast | First-order distance interval; missing radial velocity is explicit |
| Terminal hardware | scenario | forecast | Declared efficiency and pointing intervals |
| Optical link budget | modeled | forecast | Rate interval from distance, efficiency, and pointing inputs |
| Packet and relay events | simulated | forecast | Deterministic order; infrastructure uncertainty remains missing |

The governed inputs are:

- `gaia-dr3-nearby-stars-v2.json`
- `relay-hardware-archetypes-v2.json`
- `interstellar-scenario-network-v2.json`
- `interstellar-relay-models-v1.json`

Each observed star carries its Gaia DR3 `source_id` as `sourceRowId`. The solar
origin is a scenario coordinate anchor, not a Gaia row.

## Models

| Model ID | Job | Main limitation |
|---|---|---|
| `linear-space-motion-v2` | Propagate catalog state to the experiment epoch | Constant velocity; zero radial velocity when missing |
| `finite-light-time-v2` | Solve interception of a moving target at exact light speed | No relativistic gravitational delay |
| `diffraction-photon-budget-v2` | Compute received photons, rate, margin, energy, and reliability proxy | Idealized aperture and noise model |
| `deterministic-store-forward-v2` | Order packet, transmission, receipt, processing, and delivery events | Continuous contact; no outage or retry process |

The optical reliability value is a model result, not an observed service-level
probability. Complete detector noise, acquisition failure, maintenance, plasma,
and infrastructure feasibility remain outside the model.

## Progressive state

`simulatte.interstellarProgressiveState.v1` records:

```js
{
  status,
  currentEventIndex,
  currentEventId,
  timestamp,
  elapsedSeconds,
  packetLocationId,
  activeHopIndex,
  deliveredHopCount,
  relayPath,
  evidenceReferences
}
```

Every `simulatte.simulationEvent.v4` includes a timestamp, causal parent IDs,
affected entities, before and after state, evidence references, and independent
truth axes. The plugin advances exactly one event for each `scenario.run` step.

## Semantic presentation

`simulatte.semanticPresentation.v4-draft` emits semantic layers for:

- stellar observations with magnitude, distance, relay membership, and RUWE;
- optical links with distance, light time, rate, margin, reliability, energy,
  and current event status;
- the packet with bytes, elapsed time, active hop, and event evidence.

The semantic contract does not set colors, widths, label density, or LOD
thresholds. `createV3CompatibilityPresentation` temporarily maps these values to
the current tier renderer. It uses a one-unit path width and bounded marker sizes
only because `pluginPresentation.v3` cannot carry semantic quantities.

## Controls and comparison

The plugin declares transmission epoch, astrometry epoch, relay processing time,
packet bytes, and scenario terminal controls. Scenario seeds select the relay
path. Comparison uses synchronized start epochs and common seeds to compare a
declared direct baseline with the selected intervention across latency, rate,
energy, and modeled packet success probability.

## Core integration handoff

Core should consume these plugin capabilities:

| Capability | Value |
|---|---|
| `simulation.interstellar-relay.v4` | Result, causal timeline, and progressive state |
| `presentation.semantic.v4` | Semantic layers and rendered evidence references |
| `view.intents.v1` | Overview or follow request tied to the current event |
| `comparison.interstellar-relay.v1` | Synchronized branch definition |

Current core gaps:

- No v4 semantic layer compositor.
- No view-intent arbitration.
- No shared branch runner for the comparison definition.
- No generic UI control metadata for constraints or parameter provenance.
- No core receipt browser joining rendered objects to source rows.

The plugin keeps these gaps behind declarative capabilities. It does not move the
camera, create DOM, own a render loop, fetch data, or declare playback delays.

The legacy shared `multi-tier-plugin-completion.test.cjs` caller invokes
`scheduleRelay` without `packetBits` or `linkBudgets`. The v2 scheduler now fails
closed on that incomplete input. The integration owner must update that shared
fixture to provide a governed link budget and packet size.
