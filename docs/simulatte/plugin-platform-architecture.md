# Simulatte plugin platform architecture

Status: implemented SDK v1 and first-party plugin platform. The source
migration is complete through P9. P8 adds generic presentation, camera, and
multi-slot UI contributions. P9 replaces inappropriate free-text prompts with
governed, shuffleable scenarios while retaining the open-ended root prompt.
Local browser review passes and deployment remains the release gate.

Owner contracts: `public/platform/`, `public/core/`, `public/plugins/`, and the
thin application coordinator in `public/app/`.

Blank remains a separate prompt-to-pixels compiler. It is not a Simulatte
World plugin.

## Win condition

Simulatte World is a governed browser simulation host. It loads an immutable
world, executes shared simulation mechanics, and composes independently
versioned experiences through a restrictive plugin SDK.

There is no application-versus-plugin product taxonomy. Every selectable
experience sits on the same core and is composed from one or more plugins. The
wire contract retains the historical name `applicationProfile`, but a profile
is only an experience configuration. The UI presents one flat experience list.

The boundary is complete when:

- the core contains no shade, delivery, cable, wage, accessibility, amenity,
  historical-safety, or counterfactual product rules;
- plugins cannot fetch, cache, or select source URLs;
- the core never imports a named plugin;
- plugins never import application coordinators or another plugin;
- plugin-to-plugin composition uses declared capabilities;
- plugins return immutable proposals and receipts instead of mutating core
  state;
- all enabled plugin code, configuration, schemas, and data references are
  identity-locked before activation;
- adding a plugin requires a new plugin directory and generated registry sync,
  not edits across the host;
- the main application remains deployable after every migration checkpoint.

Architectural decoupling means dependency through stable contracts, not zero
dependency. Every plugin depends on a versioned SDK. No plugin depends on host
implementation files.

## Removed coupling

The following extraction sources no longer own product behavior.

| Current owner | Coupling |
| --- | --- |
| `public/platform/bootstrap/application-loader.js` | Resolves the selected governed application profile and plugin-declared datasets. |
| `public/app/main.js` | Coordinates the host, generic mission contributions, declarative UI, and simulation-run port. |
| `public/runtime/autonomy-controller.js` | Accepts generic route contributors and binds named plugin audits without interpreting them. |
| `public/world/route-planner.js` | Runs core A* with generic hard-eligibility and named cost-dimension contributions. |
| `public/runtime/occurrence-engine.js` | Has a narrow occurrence evaluator plugin API, not a complete application plugin contract. |

These are extraction sources. They are not target plugin interfaces.

## Active migration status

Updated: 2026-07-19.

```text
Packet ID: PLATFORM-P7
Plugin ID: all first-party plugins
Base commit: 2089abff1e48a638c13f9515d126e03e0e87d7da
SDK version: 1
Dependencies satisfied: P0 through P6
Allowed paths: integration-owned platform, core, app, generated registry, contracts, tests, and documentation
Current source owners: public/platform, public/core, public/plugins, public/app
Input fixtures: autonomy-manifest.json and browser loader fixtures
Expected contributions: verified artifacts and capability-limited data catalog
Expected receipts: unchanged simulatte.autonomyDataLoadReceipt.v2
Human review case: Main loads, completes a journey, and displays coherent dark controls
Validation commands: focused Autonomy tests, world-tile-manager tests, npm run check:deploy, desktop and mobile browser smoke
Known blockers: deployment has not yet been stamped and verified for the P8 presentation changes.
Last completed step: added validated markers, paths, moving actors, camera targets, inspector/map/HUD slots, and purpose-specific first-party views. The default composed profile and Cable Trader complete locally with zero browser errors or failed responses.
Next exact step: run the full deploy gate, stamp the build, deploy, and verify the live default and Cable Trader profiles.
```

Current implementation paths:

| Path | Implemented responsibility |
| --- | --- |
| `public/platform/transport/browser-transport.js` | Browser byte and text acquisition with cache and response receipts |
| `public/platform/artifacts/governed-artifact-store.js` | JSON parsing plus exact artifact hash and ID verification |
| `public/platform/data-catalog/immutable-data-catalog.js` | Stable dataset lookup and required or optional restricted views |
| `public/platform/storage/browser-tile-storage.js` | CacheStorage, OPFS, IndexedDB, and worker-decoder ownership |
| `public/platform/bootstrap/application-loader.js` | Governed application/profile bootstrap over platform layers |

Main `/` uses these layers. Blank remains unchanged and outside this migration.

## Dependency direction

```text
browser transport
      |
      v
governed artifact store
      |
      v
immutable data catalog
      |
      +----------------------+
      |                      |
      v                      v
Simulatte core <-------- plugin host
      ^                      |
      |                      v
      +--------------- plugin SDK
                             |
                             v
                         plugins
                             |
                             v
                    declarative UI output
```

Dependencies point downward through contracts:

1. Transport knows how to obtain bytes. It knows nothing about simulation or
   plugin meaning.
2. The artifact store verifies identities, schemas, and cache state. It knows
   artifact contracts but does not interpret product behavior.
3. The data catalog exposes immutable datasets and world queries. It performs
   no network work.
4. The core owns reusable world and simulation mechanics. It knows extension
   contract types but no plugin IDs.
5. The plugin host resolves manifests, permissions, capabilities, ordering,
   lifecycle, and conflicts.
6. Plugins consume granted SDK ports and return typed contributions.
7. The UI host renders declarative plugin output. Plugins do not select global
   layout or reach into application DOM.

No dependency may point from a lower layer to a higher layer.

## Proposed ownership

```text
public/
  platform/
    transport/
    artifacts/
    data-catalog/
    plugin-host/
    ui-host/
    contracts/
  core/
    world/
    routing/
    simulation/
    events/
    rendering/
    receipts/
  plugins/
    sun-walker/
    cable-trader/
    safety-explorer/

  # Additional plugin directories are deferred to later lanes.
  app/
    main.js
```

`public/app/main.js` becomes a coordinator. It starts the platform, selects an
application profile, mounts host-owned UI slots, and forwards user actions. It
does not compile plugin meaning or render plugin-specific details.

## Data boundary

### Transport

Transport is the only runtime layer authorized to call browser network and
storage APIs. Its port is byte-oriented:

```js
transport.read({ url, cacheMode, signal })
```

It returns bytes plus response metadata. It does not parse plugin data or
decide whether an artifact is trustworthy.

### Governed artifact store

The artifact store consumes a reference containing an ID, path, digest,
schema ID, and requirement status. It owns:

- path resolution;
- transport calls;
- content-hash verification;
- schema lookup and validation;
- immutable cache identity;
- dependency traversal;
- load, reuse, rejection, and cache receipts.

Its public port is identity-oriented:

```js
artifactStore.resolve(reference)
artifactStore.resolveGraph(references)
```

### Immutable data catalog

The catalog receives only verified artifacts. It exposes frozen values by
stable identity:

```js
dataCatalog.require(datasetId)
dataCatalog.optional(datasetId)
dataCatalog.receipt(datasetId)
```

Plugins receive a capability-limited dataset view containing only the IDs
declared in their manifest. They do not receive URLs, transport, cache, the
complete catalog, or undeclared datasets.

Core world data and plugin data remain distinct:

| Data class | Examples | Owner |
| --- | --- | --- |
| Core world | Nodes, directed edges, buildings, actors, embodiments, clock basis | Core data manifest |
| Shared evidence | World snapshots and source provenance | Artifact store and data catalog |
| Plugin data | Cable inventory, delivery offers, crash rows, rack proximity, wage policy | Owning plugin manifest |
| Derived runtime state | Active requests, reservations, balances, route comparisons | Owning plugin state namespace |

The platform may share the same verified bytes with multiple plugins. Shared
storage does not imply shared semantic ownership.

## Plugin package contract

Every plugin is a self-contained directory:

```text
public/plugins/sun-walker/
  plugin.json
  config.schema.json
  default-config.json
  index.js
  contracts/
  data/
  ui.js
```

The minimum manifest shape is:

```json
{
  "$schema": "../../platform/contracts/plugin-manifest.schema.json",
  "schema": "simulatte.pluginManifest.v1",
  "id": "sun-walker",
  "version": "1.0.0",
  "sdkVersion": 1,
  "entry": {
    "path": "./index.js",
    "integrity": "sha384-..."
  },
  "permissions": [
    "world.query.v1",
    "routing.contribute.v1",
    "clock.read.v1",
    "receipts.append.v1",
    "ui.inspector.v1"
  ],
  "datasets": [
    {
      "id": "world.buildings.v1",
      "required": true
    }
  ],
  "provides": ["routing.dimension.sun-exposure.v1"],
  "consumes": [],
  "extensionPoints": ["request", "route", "settlement", "ui", "presentation"]
}
```

The manifest owns declared authority. Runtime code cannot request additional
permissions or data after activation.

The generated runtime registry is produced by scanning plugin manifests and
sorting by plugin ID. Plugin work does not hand-edit the registry. One
integration command regenerates it after merges. This removes a shared file
from parallel plugin work.

## SDK ports

Plugins receive the smallest set of frozen ports justified by their manifest.

| Port | Authority |
| --- | --- |
| `worldQuery` | Read declared world entities and spatial indexes without exposing mutable world storage. |
| `routing` | Request route candidates and return eligibility or cost contributions. |
| `clock` | Read simulation time and convert declared civil or UTC instants. |
| `events` | Propose namespaced events and subscribe to declared event schemas. |
| `state` | Read and reduce only the plugin's state namespace. |
| `receipts` | Append schema-valid namespaced receipt sections. |
| `datasets` | Read only verified datasets declared by the plugin. |
| `capabilities` | Invoke another plugin through a declared versioned capability. |
| `ui` | Return declarative view models and named actions for permitted host slots. |

The SDK does not expose `fetch`, CacheStorage, IndexedDB, the DOM, renderer
internals, mutable core state, or the raw plugin registry.

## Extension contracts

### Request contribution

A request plugin may return typed obligations from source-bound evidence:

```js
{
  pluginId,
  recognized,
  obligations,
  unresolved,
  receipt
}
```

The host validates and merges obligations. Plugins do not replace source text
or rewrite another plugin's obligations.

### Route contribution

A route plugin evaluates one candidate segment or complete route:

```js
{
  contributorId,
  eligible,
  costDimensions,
  rejectionReasons,
  receipt
}
```

Hard eligibility and soft cost remain separate. A plugin cannot disguise an
ineligible route as a large finite cost. Cost dimensions stay named until a
declared application profile combines them.

The core planner owns graph traversal, bounded search, mode eligibility,
blocked segments, and deterministic tie-breaking. Plugins own only their
declared eligibility or cost evidence.

### State and event contribution

Plugins use event-sourced state:

```js
reduce(previousPluginState, namespacedEvent)
```

Reducers are deterministic and pure. A plugin proposes an event; the host
validates, sequences, records, and then applies it. Cross-plugin events require
a declared consumed capability or event contract.

### Settlement contribution

A plugin settles only obligations and state it owns. It returns:

```js
{
  pluginId,
  obligationResults,
  stateIdentity,
  losses,
  receipt
}
```

The core receipt chain binds plugin receipts without interpreting their
product claims.

### UI contribution

Default plugin UI is declarative:

```js
{
  slot: "inspector",
  title: "Sun exposure",
  rows: [
    { "label": "Selected route", "value": "73% modeled shade" }
  ],
  actions: [
    { "id": "compare-fastest", "label": "Compare" }
  ]
}
```

The host owns elements, layout, focus, mobile behavior, accessibility, and
styling. Plugins may contribute to `inspector`, `map`, and `hud`. A plugin
receives named action messages, not DOM nodes. Camera actions name one of the
plugin's declared camera targets; the host namespaces and executes the focus.

### Presentation contribution

Plugins describe world presentation without receiving renderer authority:

```js
{
  schema: "simulatte.pluginPresentation.v2",
  markers: [{ id, label, nodeId, tone, heightM, radiusM, intensity }],
  paths: [{ id, label, segmentIds, tone, widthM, intensity }],
  actors: [{ id, label, kind, segmentIds, tone, speedMps, phaseOffsetM, isSelected }],
  areas: [{ id, label, points, tone, heightM, intensity }],
  sun: { id, label, azimuthDegrees, elevationDegrees, anchorSegmentIds, distanceM, radiusM, intensity },
  cameraTargets: [{ id, label, nodeIds, segmentIds, distanceM }]
}
```

The plugin host validates bounds and allowed values. The generic presentation
compiler resolves governed node and segment identities. Core-owned WebGPU
geometry draws beacons, route ribbons, actors, bounded areas, and a modeled
sun. Solar direction may drive the core lighting vector, but the plugin still
owns the source astronomy and shadow projection. The core camera controller
owns transitions and focus. Plugins never receive the canvas, GPU device,
camera state, animation frame, or DOM. Missing world identities fail at the
presentation boundary instead of producing misleading graphics.

Arbitrary third-party UI or untrusted plugin code requires a sandboxed iframe
or equivalent capability boundary. Same-page first-party JavaScript can be
structurally decoupled and statically checked, but it is not a security
sandbox.

## Lifecycle and deterministic composition

The host executes this lifecycle for every experience profile:

1. Load and validate the core runtime lock.
2. Load the experience profile.
3. Resolve enabled plugin manifests.
4. Verify plugin code, configuration, schemas, and data identities.
5. Resolve required and optional capability dependencies.
6. Reject missing requirements and dependency cycles.
7. Create least-authority SDK ports.
8. Activate plugins in dependency order, then plugin-ID order.
9. Compile request contributions.
10. Execute route, event, state, rendering, and settlement contributions.
11. Bind all plugin receipts into the run receipt.
12. Dispose plugins and release host-owned resources.

Ordering is never based on script-tag order, object insertion order, or
network completion order.

All contribution merge rules are explicit:

- hard rejection wins over soft score;
- duplicate contribution IDs fail;
- undeclared receipt schemas fail;
- undeclared state namespaces fail;
- equal scores use stable core tie-breaking;
- missing optional capabilities produce an explicit disabled receipt;
- missing required capabilities block profile readiness.

## Experience profiles

An experience profile selects plugins, interaction behavior, governed
scenarios, camera behavior, and configuration without changing plugin
packages. It is not a second product kind beside plugins:

```json
{
  "schema": "simulatte.applicationProfile.v2",
  "id": "cable-trader-pickup-v1",
  "interaction": {
    "mode": "playback",
    "startLabel": "Play cable city",
    "shuffleLabel": "Shuffle seed"
  },
  "defaultSeedId": "july-baseline",
  "seeds": [
    {
      "id": "july-baseline",
      "label": "July baseline",
      "description": "Cable inventory, routes, and pickup settlement.",
      "seed": "cable-city-month-2026-07",
      "missionText": "Show the predefined cooperative cable network and every optimal cross-hub flow."
    },
    {
      "id": "campus-return-wave",
      "label": "Campus return wave",
      "description": "A return-heavy month with redistributed demand across hubs.",
      "seed": "cable-city-campus-return-731",
      "missionText": "Show the predefined cooperative cable network and every optimal cross-hub flow."
    }
  ],
  "plugins": [
    { "id": "cable-trader", "configId": "cable-trader-network-v2" }
  ],
  "camera": {
    "initialMode": "top",
    "runMode": "top",
    "pluginId": "cable-trader",
    "targetId": "cable-network"
  },
  "routeObjective": {
    "travelSeconds": 1,
    "sunExposureSeconds": 0.4,
    "marginalDeliverySeconds": 0.2
  }
}
```

Profiles own enablement, cross-dimension policy, interaction mode, scenario
identity, and camera defaults. A scenario contains human-facing copy, the
compiler input, and a stable seed. Shuffling changes the governed scenario;
plugins with stochastic state receive that seed through `setScenario` and
rebuild their state. The selected scenario is bound into the runtime receipt.
Only the open-ended root profile retains the legacy prompt interaction.
Plugins must not silently enable themselves or choose global weights.

## First-party plugin definitions

| Plugin | Owns | Core ports | Provides | Consumes | Implemented owner |
| --- | --- | --- | --- | --- | --- |
| Sun Walker | Solar position, building occlusion, exposure integration, shade preference, comparison receipt | World query, clock, routing, receipts, UI | `routing.dimension.sun-exposure.v1` | None | `public/plugins/sun-walker/` |
| Cable Trader | Cable taxonomy, hub inventory, requests, deposits, credits, candidate journeys, exchange settlement | World query, routing, events, state, receipts, UI | `inventory.exchange.v1`, `settlement.credit.v1` | Optional `fulfillment.delivery.v1` | `public/plugins/cable-trader/` |
| Safety Explorer | Historical-observation route dimension and narrow claim boundary | Routing, datasets, receipts, UI | `routing.dimension.historical-observation.v1` | None | `public/plugins/safety-explorer/` |
The current shipped set is:
`sun-walker`, `cable-trader`, and `safety-explorer`.
Other plugin families are deferred to later lanes.

## Parallel work rules

Parallel plugin work begins only after the SDK, schemas, host lifecycle,
generic route contribution, state namespace, receipt envelope, and UI slots
are frozen at version 1.

Each plugin lane may edit only:

- `public/plugins/<plugin-id>/`;
- `tests/plugins/<plugin-id>/`;
- plugin-owned fixtures under its directory;
- its work-packet status row in this document during integration.

Plugin lanes do not edit:

- `public/app/main.js`;
- `public/platform/`;
- `public/core/`;
- another plugin directory;
- the generated runtime registry;
- shared index HTML script tags.

If a plugin cannot be implemented through SDK v1, its lane records the exact
missing port and stops. It does not add a private host import or widen a port.
The platform owner decides whether the missing behavior is generic enough for
a new SDK version.

Shared generated files are regenerated once by the integration lane after
parallel branches merge.

## Resumable migration checkpoints

Every checkpoint leaves the deployed application functional. Do not begin a
later checkpoint while an earlier checkpoint has unresolved behavior drift.

### P0: Record the baseline

- [x] Record current main-page script inventory and product-specific imports.
- [x] Record one working mission for shade, cooperation, accessibility,
  amenity, safety weighting, and counterfactual comparison.
- [x] Record the current data-load receipt shape and route result shape.
- [ ] Confirm the current combined deployment gate. The Simulatte deploy surface is clean, but the combined gate currently stops on insufficient disk while checking Doppler development bytes.

Exit condition: the current behavior and object shapes are inspectable before
extraction. This is diagnostic evidence, not plugin proof.

### P1: Split transport, artifacts, and data catalog

- [x] Move network and browser-storage mechanics into `public/platform/transport/`
  and `public/platform/storage/` for Main.
- [x] Move digest, schema, dependency, and cache verification into
  `public/platform/artifacts/`.
- [x] Introduce an immutable data catalog over verified artifacts.
- [x] Preserve the existing `loadAutonomyData` facade temporarily.
- [x] Reject undeclared data access through restricted catalog views.

Exit condition: existing behavior runs unchanged, while no simulation or
plugin candidate directly calls network or storage APIs.

### P2: Establish plugin SDK v1

- [x] Add restrictive plugin-manifest and application-profile schemas.
- [x] Add manifest discovery and deterministic registry generation.
- [x] Add capability resolution, cycle detection, permissions, and lifecycle.
- [x] Add namespaced state, event, error, and receipt envelopes.
- [x] Add declarative UI slots and action dispatch.
- [x] Add static checks banning transport, storage, DOM, app, and cross-plugin
  imports from plugin directories.

Exit condition: a contract fixture plugin activates, contributes one receipt
and one UI row, and disposes without product-specific host code.

### P3: Generalize core extension points

- [x] Replace named amenity and safety planner arguments with generic route
  eligibility and cost contributors.
- [x] Replace product-specific mission mutation with validated obligation and
  plan contributions.
- [x] Replace controller-owned product indexes with granted plugin datasets.
- [x] Bind plugin receipts generically into journey receipts.
- [x] Keep graph search, deterministic ordering, execution, and rendering in
  the core.

Exit condition: the core accepts generic contributions and contains no named
candidate-plugin data input.

### P4: Extract Sun Walker reference plugin

- [x] Move solar, occlusion, exposure, request, settlement, and UI ownership
  into `public/plugins/sun-walker/`.
- [x] Remove shade imports and branches from the application coordinator.
- [x] Preserve existing route and comparison output for the baseline mission.
- [x] Disable the plugin through a profile and prove ordinary routing still
  works.

Exit condition: Sun Walker is the reference implementation for every SDK v1
extension point it needs. SDK v1 is then frozen for parallel extraction.

### P5: Parallel plugin extraction

The following work packets may proceed independently after P4:

- [x] WP-ACCESS: Accessible Journey.
- [x] WP-SAFETY: Safety Explorer.
- [x] WP-AMENITY: Amenity Router.
- [x] WP-HISTORY: Historical Streets.
- [x] WP-COUNTERFACTUAL: Counterfactual Lab.
- [x] WP-DELIVERY: P2P Delivery.

Gig Wage Truth waits for the delivery settlement capability. Cable Trader can
build its standalone inventory and hub-pickup behavior in parallel, but its
delivery adapter waits for P2P Delivery.

Exit condition: every extracted plugin can be independently enabled and
disabled through an application profile. The host has no product-specific UI,
data, route, state, or settlement branch.

### P6: Compose dependent applications

- [x] WP-WAGE: consume `settlement.delivery.v1` without importing P2P Delivery.
- [x] WP-CABLE: finish hub inventory, credits, requests, and pickup settlement.
- [x] WP-CABLE-DELIVERY: consume optional `fulfillment.delivery.v1`.
- [x] Add profiles exercising standalone and composed operation.
- [x] Prove missing optional providers disable only the dependent feature.

Exit condition: Cable Trader runs with hub pickup alone and gains opportunistic
delivery when P2P Delivery is enabled, without changing either plugin package.

### P7: Remove compatibility paths

- [x] Delete the temporary data-loader facade after all callers use platform
  ports.
- [x] Delete product-specific branches from the controller, route planner, and
  main coordinator.
- [x] Remove old script tags and compatibility globals.
- [x] Regenerate the plugin registry and generated plugin script inventory.
- [x] Confirm desktop and mobile local plugin selection.
- [x] Confirm deployed plugin selection.

Exit condition: the target ownership tree is true in source, not only in this
document.

### P8: Purpose-specific presentation

- [x] Add a bounded `presentation` extension point to SDK v1.
- [x] Compile plugin markers, paths, actors, and camera targets through core-owned code.
- [x] Add host-owned `map` and `hud` UI slots beside the existing inspector.
- [x] Make Cable Trader a four-hub, ten-family exchange network with four moving candidate journeys.
- [x] Give P2P Delivery, Sun Walker, Accessibility, Amenity, Safety, and Counterfactual distinct evidence-backed map treatments.
- [x] Give Historical Streets and Gig Wage Truth purpose-specific non-spatial UI without inventing spatial evidence.
- [x] Remove the application/plugin selector split and expose one experience list.
- [x] Move initial and running camera defaults into validated experience configuration.
- [x] Render Sun Walker's projected building shadows, solar marker, and solar lighting through presentation v2.
- [x] Pass local default and Cable Trader browser journeys with zero runtime errors and failed responses.

Exit condition: every visual comes from validated plugin data, while the host
alone owns WebGPU, cameras, DOM, and lifecycle.

### P9: Governed interaction and seeded scenarios

- [x] Add a versioned profile interaction contract for explorer, form,
  playback, request, and route experiences.
- [x] Give all ten specialized profiles four named, identity-bearing scenarios.
- [x] Keep the root world prompt-first for open-ended mission compilation.
- [x] Pass the active scenario to plugin activation and scenario changes to an
  optional `setScenario` lifecycle method.
- [x] Rebuild Cable Trader's complete 30-day network when its seed changes.
- [x] Replace unsupported step-free presets with honest accessibility audits;
  explicit wheelchair requests still fail closed without sufficient evidence.
- [x] Verify root, every specialized profile, composed Cable City, and mobile
  Cable Trader in the browser with zero runtime errors.

Exit condition: the shared shell expresses each experience's real interaction
instead of presenting every plugin as an NLP prompt, and a seed change affects
the simulation wherever the plugin owns stochastic state.

## Work packet contract

Each work packet starts with this header in its branch or handoff:

```text
Packet ID:
Plugin ID:
Base commit:
SDK version:
Dependencies satisfied:
Allowed paths:
Current source owners:
Input fixtures:
Expected contributions:
Expected receipts:
Human review case:
Validation commands:
Known blocker:
Last completed step:
Next exact step:
```

Each packet follows the same steps:

1. Copy no code until current inputs, outputs, and receipts are named.
2. Create the plugin manifest, schemas, default configuration, and fixtures.
3. Move pure product logic behind SDK ports without changing behavior.
4. Move product data references into the plugin manifest.
5. Move state into the plugin namespace.
6. Move presentation into declarative UI contributions.
7. Remove the old call site in the integration lane.
8. Verify enabled behavior, disabled behavior, and missing-dependency behavior.
9. Record the last completed and next exact step before handing off.

## Plugin work packets

| Packet | Dependencies | Primary output | Human review case |
| --- | --- | --- | --- |
| WP-SUN | P0 through P3 | Sun-exposure route dimension and comparison UI | A shade-preferring route remains understandable and ordinary routing works with the plugin disabled. |
| WP-ACCESS | P4 | Accessibility eligibility and refusal | A supported route reads clearly; insufficient evidence refuses without implying an accessibility determination. |
| WP-SAFETY | P4 | Historical-observation cost dimension | The comparison says historical observation, never safest route or live risk. |
| WP-AMENITY | P4 | Amenity eligibility and distance contribution | A bicycle-rack constraint is visible and disabling the plugin removes only that constraint. |
| WP-HISTORY | P4 | Dated-world provider and unavailable receipt | An unavailable date refuses instead of substituting the current world. |
| WP-COUNTERFACTUAL | P4; optional WP-HISTORY | Matched baseline and challenger application | Exactly one declared intervention changes and both receipts remain inspectable. |
| WP-DELIVERY | P4 | Delivery fulfillment and settlement providers | Need, offer, detour, authorization, custody, and settlement remain distinct. |
| WP-CABLE | P4 | Cable inventory, hubs, credits, requests, and pickup | Inventory and credits settle without requiring a delivery provider. |
| WP-WAGE | WP-DELIVERY | Gross work-rate analysis | Gross rate and excluded costs are readable and do not imply net wages. |
| WP-CABLE-DELIVERY | WP-CABLE and WP-DELIVERY | Optional cable fulfillment adapter | Enabling Delivery adds fulfillment choices without changing Cable Trader accounting. |

## Resumption protocol

At the start of any resumed session:

1. Read this document, `AGENTS.md`, and `STYLE_GUIDE.md`.
2. Inspect repository status and preserve unrelated work.
3. Find the earliest incomplete migration checkpoint.
4. Read the active work-packet header and confirm its base commit still exists.
5. Verify declared dependencies and SDK version before editing.
6. Re-run the packet's narrow last-known check.
7. Continue from `Next exact step`; do not restart completed extraction.
8. Update the packet header before stopping, including any changed object
   shapes or blockers.

The canonical status is the checkpoint list in this document plus the active
work-packet header. Chat history is not a status store.

## Review and integration rules

Plugin completion requires three distinct reviews:

| Review | Question |
| --- | --- |
| Contract | Does the plugin use only declared SDK ports, datasets, capabilities, state, and receipt schemas? |
| Behavior | Does enabled output match the preserved baseline, and does disabled operation remain valid? |
| Human product review | Are plugin choices, results, refusals, and claim boundaries understandable in the browser? |

The integration lane owns shared host edits, generated registry updates,
script changes, deployment stamps, and final browser review. A plugin lane
does not resolve shared-file conflicts by expanding its scope.

## Non-goals

- Blank does not move into the plugin host.
- Plugins do not receive arbitrary runtime network authority.
- A plugin system does not by itself make third-party code trustworthy.
- The SDK does not expose every core function for convenience.
- Plugins do not fork route search, clocks, rendering, event sequencing, or
  receipt chaining when a core capability already owns that mechanic.
- Documentation does not prove extraction. Each checkpoint remains incomplete
  until the source boundary and browser behavior match it.
