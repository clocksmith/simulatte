# Proposed Experience Implementation Program

Status: Subsea Network, Grid Resilience, and Asteroid Defense are implemented
and registered as native v4 experiences. Exoplanet Survey remains proposed
and is excluded from the current implementation program.

Owner contracts:

- `public/simulatte/platform/contracts/plugin-v4-contracts.js`
- `public/simulatte/platform/core/simulation/comparison-execution.js`
- `public/simulatte/platform/runtime/simulation-clock.js`
- `public/simulatte/platform/render/semantic-compositor.js`
- `public/simulatte/platform/view/view-director.js`
- `public/simulatte/platform/bootstrap/tier-application-loader.js`
- `public/data/simulatte/tier-application-manifest.json`
- `tools/simulatte/profile-evidence-contract.mjs`
- `tools/simulatte/profile-evidence-browser.mjs`
- `tools/simulatte/run-profile-evidence.mjs`

## Program win condition

Each new experience is a registered `simulatte.applicationProfile.v3` with a
governed world, one domain-owning plugin, deterministic baseline and
intervention execution, policy-blind inputs, complete provenance, settled
desktop and mobile evidence, and no public claim that exceeds the executable
receipts.

The four profile IDs are:

| Public experience | Profile ID | Plugin ID | Tier |
| --- | --- | --- | --- |
| Subsea Network | `subsea-network-global-v1` | `subsea-network-global` | `world` |
| Grid Resilience | `grid-resilience-us-v1` | `grid-resilience-us` | `country` |
| Exoplanet Survey | `exoplanet-survey-v1` | `exoplanet-survey` | `star-chart` |
| Asteroid Defense | `asteroid-defense-v1` | `asteroid-defense` | `solar-system` |

## Required shared changes

### Profile-specific worlds

`simulatte.tierApplicationManifest.v3` is implemented. Each profile entry
owns its pinned world reference. Subsea Network initially shares
`earth-global-topology-v1` with Maritime Trade.

Each profile reference owns its world reference:

```json
{
  "id": "subsea-network-global-v1",
  "path": "../application-profiles/subsea-network-global-v1.json",
  "sha256": "<profile-sha256>",
  "world": {
    "id": "earth-global-topology-v1",
    "path": "./worlds/earth-global-topology-v1.json",
    "sha256": "<world-sha256>"
  }
}
```

Implemented guarantees:

1. The loader selects the profile before its world and verifies
   `profile.worldModelId === profileEntry.world.id`.
2. Existing profile world identities remain unchanged.
3. Loader tests cover multiple profiles in one tier.
4. The loader rejects v2/v3 mixed rows, missing world hashes, duplicate profile IDs, and
   world identity drift.
5. The owning generator refreshes profile and world hashes.

This contract does not change plugin authority. A profile-specific world is
available when an experience needs one, but it is not required merely to add
a second profile to a tier.

### Scientific evidence surfaces

Grid and Subsea use the current map-centric v4 presentation. Asteroid Defense
uses v4 semantic paths, samples, quantities, inspections, and declarative view
intents. Exoplanet still requires plots that are first-class rendered evidence,
not arrays hidden in inspector fields.

Add a core-owned `simulatte.pluginPresentation.v5` that preserves v4 layers and
adds multiple semantic surfaces:

```js
{
  schema: "simulatte.pluginPresentation.v5",
  pluginId,
  epoch,
  surfaces: [{
    id,
    kind: "world | cartesian-plot | distribution | table",
    coordinateSystem,
    axes: {
      x: { quantityKind, unit, domain, scale: "linear | log" },
      y: { quantityKind, unit, domain, scale: "linear | log" }
    },
    layers,
    viewIntents
  }]
}
```

Core owns axes, ticks, clipping, decimation, hover targeting, label collision,
colors, widths, density, and pixel budgets. Plugins own semantic quantities,
coordinates, provenance, and causal selection. V4 contributions normalize to
one `world` surface.

Required implementation:

1. Add v5 validators and a v4-to-v5 adapter.
2. Add a surface compositor that delegates world layers to the current
   compositor and draws plot layers with bounded screen-space geometry.
3. Extend View Director targets to include surface IDs without weakening
   semantic-object provenance checks.
4. Include surface, axes, visible layers, suppressed layers, and pixel
   readback in compositor receipts.
5. Add desktop and mobile tests for world-to-plot switching, comparison mode,
   selection, manual view override, and reload.

This work is required before Exoplanet Survey can pass visible-evidence gates.
Asteroid Defense deliberately exposes screening evidence through bounded v4
semantics and does not claim an operational impact probability.

### Shared numerical capability

Asteroid Defense and Orbital Transfer Planner need independently verified
propagation without importing one another. The shared deterministic RK4
primitive is implemented at:

```text
public/shared/core/simulation/n-body-propagation.js
```

Asteroid Defense exposes `propagation.n-body.v1` and records its force-model,
step, energy-drift, and omission receipt. Orbital Transfer Planner retains its
independent verifier. Lambert search, mission policy, encounter screening, and
intervention logic remain inside their owning plugins.

## Existing runtime reused unchanged

| Requirement | Existing owner |
| --- | --- |
| Baseline/intervention isolation | `comparison-execution.js` |
| Lockstep and event-time advancement | `comparison-execution.js` |
| Hidden truth excluded from policy context | `comparison-contracts.js` |
| Pause, step, seek, replay, reload receipt | comparison and playback runtime |
| Canonical provenance envelope | `plugin-v4-contracts.js` |
| Causal event timeline | `simulation-timeline.js` |
| Playback rate and wall-time scheduling | `simulation-clock.js` |
| Semantic truth-class styling | `semantic-compositor.js` |
| Camera arbitration and manual override | `view-director.js` |
| Content-addressed browser evidence | `tools/simulatte/run-profile-evidence.mjs` |

## Implementation order

1. Maintain the implemented profile-owned world contract.
2. Maintain Subsea Network as the first complete new vertical slice.
3. Maintain Grid Resilience as the interface-constrained dispatch slice.
4. Maintain Asteroid Defense as the policy-blind orbital screening slice.
5. Keep generated registries, manifests, hashes, and claim inventory aligned.
6. Capture the complete profile evidence matrix.
7. Implement Exoplanet Survey only when it returns to the active program.

No later lane may be registered publicly until its own source, data, runtime,
browser, and claim evidence closes. Earlier profiles remain deployable while a
later lane is incomplete.

## Release matrix

Every profile must provide:

| Evidence | Required proof |
| --- | --- |
| Data | Dataset hashes, row IDs, source URL, retrieval epoch, license, transformation chain |
| Model | Equations, solver version, parameters, convergence, omissions, benchmark receipt |
| Simulation | Deterministic seed, initial identity, causal events, progressive states |
| Comparison | Two executed branches, matching starting identity, policy blindness, terminal settlement |
| Presentation | Semantic layers or surfaces, compositor receipt, view receipt, selection provenance |
| Browser | Desktop and `390x844`, pause, step, replay, reload, comparison, inspection |
| Claims | Every published sentence resolves to current run evidence |
| Failure | Missing source, hash, convergence, capability, or evidence fails closed |

The detailed contracts are:

- [Subsea Network](subsea-network.md)
- [Grid Resilience](grid-resilience.md)
- [Exoplanet Survey](exoplanet-survey.md)
- [Asteroid Defense](asteroid-defense.md)
