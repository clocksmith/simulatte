# Simulatte

Simulatte is a browser application for deterministic world simulation and
prompt-to-world compilation. The main Simulatte surface runs governed
simulations. Blank turns a natural-language prompt into an inspectable 3D scene
program.

- [Live site](https://simulatte.world)
- [Blank world compiler](https://simulatte.world/blank)
- Repository status: private npm package; source is MIT licensed.

## Mission, goal, and value

Simulatte’s mission is to turn a described world or mission into a governed,
inspectable simulation whose actions and rendered result can be checked later.

The current goal is a browser pipeline that preserves prompt obligations through
grounding, planning, simulation, rendering, and proof. A researcher or operator
can inspect the selected route, plugin inputs, safety checks, dynamics, and
receipt. A creator can use Blank to compile a prompt into a deterministic scene
program and inspect the scene proof.

Simulatte serves:

- People running city, country, planet, solar-system, or star-chart scenarios.
- Plugin authors building governed experiences against the versioned SDK.
- Researchers comparing route plans, world dynamics, and rendered outcomes.
- Reviewers checking manifests, data, safety decisions, and receipts.

## How to use Simulatte

Open the live site and choose a scale tier with `?tier=<value>`:

| Tier | Query value | Scenario |
| --- | --- | --- |
| City | `city` | New York City movement, routing, safety gates, and plugins. |
| Country | `country` | U.S. food supply and agricultural logistics. |
| Planet | `world` | Container shipping, port queues, chokepoints, and emissions. |
| Solar System | `solar-system` | Orbit ephemeris and transfer planning. |
| Universe | `star-chart` | Visible-star routing with bounded relay and disruption rules. |

Open [Blank](https://simulatte.world/blank) to compile a natural-language
scene. For local development:

```bash
npm test
npm run serve
npm run plugins:check
npm run audit:simulatte:browser
```

The local server runs at `http://localhost:4173`.

## Evidence and execution boundaries

The City runtime follows this path:

```text
Prompt
  -> Grounded mission
  -> Route candidates
  -> Deterministic action rollouts
  -> Fail-closed safety gates
  -> Selected action
  -> Reference dynamics
  -> Settlement and SHA-256 receipt chain
```

Blank follows a separate compilation path:

```text
Prompt
  -> Evidence
  -> Grounded world
  -> Simulation
  -> Visual program
  -> WebGPU pixels
  -> Scene proof
```

The authoritative Blank phases are Runtime, Language, Retrieval, Grounded
Intent, Simulation, Visual, Render, and Scene Proof. The runtime checks
manifests, schemas, datasets, dependencies, route constraints, plugin
permissions, and receipt obligations before accepting a result.

Core guarantees:

- Unsupported or ambiguous missions produce diagnostics instead of an
  ungrounded action.
- A* routing uses governed topology, stable tie-breaking, and declared plugin
  cost dimensions.
- Safety gates stop execution when no candidate meets network, signal, speed,
  mode, blockage, or clearance requirements.
- Optional local models may assist place resolution, but they do not control
  physics, route safety, or action gating.
- Plugin code receives only manifest-declared ports and datasets and cannot use
  fetch, browser storage, the DOM, or another plugin through the supported SDK
  boundary.

See the [canonical experience index](docs/simulatte/experiences/README.md) for
the registered profiles, controls, data sources, simulation contracts, and
implementation status.

## Long-term vision

Simulatte is intended to support inspectable simulations across physical and
institutional scales while keeping the prompt, world data, plugin inputs,
simulation state, rendered output, and proof connected. The scale tiers and
plugins are separate profiles; a feature in one profile does not establish the
same feature in another.

## Limits and current status

The Control lane uses deterministic lexical and TF-IDF processing. The Neural
lane uses pinned local Qwen models through Doppler. Both return typed evidence to
deterministic downstream compilers and simulators. Model selection does not
bypass contract validation or safety gates.

The plugin boundary is a contract and permission boundary, not a separate
JavaScript security isolate. The package remains private, while the source is
licensed under MIT.

## Repository map

- [`public/simulatte/`](public/simulatte/) — Simulatte World application, runtime, routing, and receipts
- [`public/blank/`](public/blank/) — prompt-to-pixels compiler and scene proof
- [`public/shared/`](public/shared/) — shared plugin host, SDK, UI, and platform code
- [`public/data/`](public/data/) — governed manifests, profiles, models, and world data
- [`tools/`](tools/) — build, audit, evaluation, and deployment tools
- [`tests/`](tests/) — runtime, platform, plugin, and data tests
- [`STYLE_GUIDE.md`](STYLE_GUIDE.md) — phase contracts and browser implementation rules
- [`docs/simulatte/experiences/README.md`](docs/simulatte/experiences/README.md) — experience index

## Deployment

Firebase Hosting project: `simulatte-world`.

```bash
npm run check:deploy
npm run stamp:build
npm run deploy:hosting
```

## License

[MIT License](LICENSE). The package remains marked private in
[`package.json`](package.json), which controls publication rather than the
source license.
