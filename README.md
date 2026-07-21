# Simulatte

> Browser-native, deterministic world simulation and prompt-to-world compilation. Core simulation runs on-device; the web client may emit page analytics.

- **Live:** [simulatte.world](https://simulatte.world)
- **World compiler:** [simulatte.world/blank](https://simulatte.world/blank)
- **Repository status:** Private and proprietary; no public license is granted.

## What it does

Simulatte has two primary surfaces:

- **Simulatte World** runs governed simulations across city, country, planetary, solar-system, and stellar scales.
- **Blank** compiles natural-language prompts into inspectable, deterministic 3D scene programs.

The city tier contains the full autonomy runtime: mission grounding, route planning, deterministic action rollouts, fail-closed safety checks, reference dynamics, settlement, and cryptographic receipts.

## Scale tiers

Select a tier with `?tier=<value>`.

| Tier | Query value | Scope |
| --- | --- | --- |
| **City** | `city` | New York City journeys with WebGPU rendering, pedestrian/bicycle/scooter/car dynamics, safety gates, and receipt verification |
| **Country** | `country` | United States regional transit and freight exploration |
| **Planet** | `world` | Earth-scale border topology derived from Natural Earth |
| **Solar System** | `solar-system` | Heliocentric orbit visualization using NASA JPL Horizons data |
| **Universe** | `star-chart` | Three-dimensional Hipparcos stellar chart grouped by spectral class |

The city tier runs the complete mission engine. Larger scales use lighter data and interaction paths.

## City runtime

```text
Prompt
  ↓
Grounded mission
  ↓
Route candidates
  ↓
Deterministic action rollouts
  ↓
Fail-closed safety gates
  ↓
Selected action
  ↓
Reference dynamics
  ↓
Settlement + SHA-256 receipt chain
```

### Core guarantees

- **Governed inputs:** manifests, schemas, datasets, and dependencies are verified before execution.
- **Bounded grounding:** unsupported or ambiguous missions fail with explicit diagnostics.
- **Deterministic planning:** A* routing uses governed topology, stable tie-breaking, and declared plugin cost dimensions.
- **Fail-closed safety:** execution stops when no candidate satisfies network, signal, speed, mode, blockage, and clearance constraints.
- **Auditable runs:** every tick is committed to a canonical SHA-256 chain and checked against mission obligations.
- **Separated model authority:** optional local models may assist place resolution, but they do not control physics, route safety, or action gating.

## Plugin platform

Experiences are assembled from application profiles and manifest-governed plugins.

Plugins:

- run in the main JavaScript realm;
- receive only manifest-declared SDK ports and datasets;
- update local state through namespaced events and reducers;
- interact through versioned capabilities rather than direct imports;
- emit validated UI, presentation data, and receipts;
- cannot fetch, use browser storage, manipulate the DOM, or import another plugin through the supported plugin boundary.

This is a contract and permission boundary, not a separate JavaScript security isolate.

First-party experiences include **Sun Walker**, **Cable Trader**, and **Safety Explorer**.

## Repository layout

```text
public/
├── index.html
├── simulatte/
│   ├── app/          # Lifecycle, cameras, trace views, WebGPU coordination
│   ├── runtime/      # Observations, action bets, safety, dynamics, receipts
│   ├── mission/      # Bounded natural-language mission compilation
│   ├── world/        # Graphs, routing, actors, disruptions, world tiles
│   ├── verifier/     # Obligation, trace, and integrity verification
│   ├── platform/     # Artifacts, data catalog, plugin host, SDK, UI host
│   └── language/     # Deterministic universe-language parsing
├── shared/plugins/   # First-party plugin packages
├── blank/            # Prompt-to-pixels compiler
└── data/             # Governed manifests, profiles, models, and world data

tools/                # Build, audit, evaluation, and deployment tooling
tests/                # Runtime, platform, plugin, and data tests
```

## Blank world compiler

Blank turns a prompt into a grounded, simulated, rendered, and audited scene.

```text
Prompt
  ↓
Evidence
  ↓
Grounded world
  ↓
Simulation
  ↓
Visual program
  ↓
WebGPU pixels
  ↓
Scene proof
```

Its authoritative phases are:

1. Runtime
2. Language
3. Retrieval
4. Grounded Intent
5. Simulation
6. Visual
7. Render
8. Scene Proof

See `public/blank/pipeline/README.md` and `STYLE_GUIDE.md`.

## Model execution

Language components use versioned, receipt-emitting model lanes pinned by:

```text
public/data/simulatte-embedder/model-runtime-lock.json
```

- **Control lane:** zero-download deterministic lexical and TF-IDF processing.
- **Neural lane:** pinned local Qwen models executed through Doppler.

Both lanes return typed evidence to deterministic downstream compilers and simulators. Model selection does not bypass contract validation or safety gates.

## Development

```bash
# Run the test suite
npm test

# Start the local server at http://localhost:4173
npm run serve

# Verify plugin manifests, generated registry, and plugin boundaries
npm run plugins:check

# Run the Simulatte browser smoke audit
npm run audit:simulatte:browser
```

## Deployment

Firebase Hosting project: `simulatte-world`.

```bash
# Run deployment checks
npm run check:deploy

# Stamp the build
npm run stamp:build

# Deploy
npm run deploy:hosting
```

## License

**Private and proprietary.** No public license is granted. `package.json` marks the package as private.
