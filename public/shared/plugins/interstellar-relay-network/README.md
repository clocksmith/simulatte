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
- `gaia-dr3-source-response-v1.csv`
- `relay-hardware-archetypes-v2.json`
- `interstellar-scenario-network-v2.json`
- `interstellar-relay-models-v1.json`

Each observed star carries its Gaia DR3 `source_id` as `sourceRowId`. The solar
origin is a scenario coordinate anchor, not a Gaia row. The checked-in CSV is the
exact six-row Gaia response used by the governed star catalog. Its immutable
SHA-256 is recorded in the catalog and dataset manifest. Every runtime
DataReceipt carries the content version, retrieval date, license, coverage,
source rows, governed-output hash, and immutable source-artifact hashes.

## Models and omissions

| Model ID | Job | Main limitation |
|---|---|---|
| `linear-space-motion-v2` | Propagate catalog state to the experiment epoch | Constant velocity; zero radial velocity when missing |
| `finite-light-time-v2` | Solve interception of a moving target at exact light speed | No plasma propagation effect |
| `diffraction-photon-budget-v2` | Compute photons, rate, margin, energy, and reliability proxy | No acquisition, maintenance, plasma, complete noise model, or observed infrastructure |
| `deterministic-store-forward-v2` | Order packet, transmission, receipt, processing, and delivery events | Continuous contact; no outage or retry process |

The optical reliability value is a conditional model result, not an observed
service-level probability.

| Omission ID | Meaning |
|---|---|
| `acquisition-not-modeled` | No pointing acquisition or reacquisition process |
| `maintenance-not-modeled` | No maintenance outage or degradation process |
| `plasma-not-modeled` | No plasma-induced optical propagation effect |
| `detector-background-noise-incomplete` | Detector and background noise are incomplete |
| `retries-not-modeled` | Failed packets are not retransmitted |
| `infrastructure-not-observed` | Terminals and relay infrastructure are hypothetical |
| `continuous-contact-assumed` | Every scheduled hop is available for its full duration |

These rows are attached to model receipts, events, metrics, semantic objects,
inspections, comparisons, settlement evidence, and settlement losses.

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

`simulatte.semanticPresentation.v4-draft` emits semantic stars, optical links,
and a temporal packet. The spatial contract is true 3D ICRS Cartesian space in
parsecs. Every object retains three coordinates, Euclidean distance, signed
ICRS-z depth, and evidence references. View intents frame an evidence-derived 3D
bounding sphere and require depth and true distance to survive display
projection. The v4 contribution records this transform as provenance and
targets evidence-bearing layers.

The semantic contract does not set colors, widths, label density, or LOD
thresholds. `createV3CompatibilityPresentation` maps these values to the current
tier renderer. It preserves true coordinate arrays but only exposes a reduced
visual shape because `pluginPresentation.v3` cannot carry the complete semantic
contract.

## Controls and comparison

The plugin declares transmission epoch, astrometry epoch, relay processing time,
packet bytes, and scenario terminal controls. Scenario seeds select the relay
path. Comparison uses synchronized start epochs and common seeds to compare a
declared direct baseline with the intervention across latency, rate, energy, and
conditional packet success. Both branches carry the omission catalog and
reliability scope.

## Core integration handoff

| Capability | Value |
|---|---|
| `simulation.interstellar-relay.v4` | Result, causal timeline, and progressive state |
| `presentation.semantic.v4` | Semantic layers and rendered evidence references |
| `view.intents.v1` | Overview or follow request tied to the current event |
| `comparison.interstellar-relay.v1` | Synchronized branch definition |

Core must retain the v4 spatial transformation, evidence references, and
semantic quantities through display projection. Core owns styling, aggregation,
camera arbitration, and branch orchestration. The plugin does not move the
camera, create DOM, own a render loop, fetch data, or declare playback delays.
