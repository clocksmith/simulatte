# Simulatte

Simulatte is a data-first browser simulation workbench. Bring data, prepare an
editable program, run it, inspect the output, change it, and replay or export it.
Prompt compilation and governed domain profiles are optional workflows.

- [Live site](https://simulatte.world)
- [Prompt compiler](https://create.simulatte.world/)
- [Workbench workflow and component contracts](docs/workbench.md)
- Repository status: private npm package; source is MIT licensed.

## Mission, goal, and value

The goal in [GOALS.md](GOALS.md) is to help technical creators turn data and
instructions into interactive simulations they can inspect, change, and
reproduce. Free local use counts. A prompt, model download, account, or domain
profile is not required for supported data execution.

## How to use Simulatte

The repository's root page provides CSV/JSON input, explicit column mapping,
constant-velocity 2D point execution, a timeline and output table, WorldSpec
editing, result comparison, exact replay, and program/result export. Local data
does not leave the browser. URL acquisition happens only on Fetch URL.

Use the governed profile selector for domain-specific execution:

| Tier | Query value | Scenario |
| --- | --- | --- |
| City | `city` | New York City movement, routing, safety gates, and plugins. |
| Country | `country` | U.S. food supply and agricultural logistics. |
| Planet | `world` | Container shipping, port queues, chokepoints, and emissions. |
| Solar System | `solar-system` | Orbit ephemeris and transfer planning. |
| Universe | `star-chart` | Visible-star routing with bounded relay and disruption rules. |

Use [Prompt](https://create.simulatte.world/) to compile a natural-language
scene with the existing eight phases. For local development:

```bash
npm test
npm run serve
npm run audit:workbench
npm run plugins:check
npm run audit:simulatte:browser
```

The local server runs at `http://localhost:4173`.

Use these command entry points; existing specialist commands and aliases remain compatible:

| Job | Command |
| --- | --- |
| Local workbench and profiles | `npm run serve` |
| Focused correctness and architecture | `npm run check:fast` |
| Complete regression suite | `npm test` |
| Data workflow, desktop and mobile | `npm run audit:workbench` |
| Prompt and profile release qualification | `npm run check:release` |

Freeze source edits before the full suite. Its source fingerprint rejects
mixed-revision results. Neither local checks nor qualification deploys the site.

Find specialist commands with `npm run help -- browser` or inspect the complete
directory with `npm run help -- --json`. This reads `package.json` without running
any listed command. Compatibility aliases delegate to their canonical command.

## Evidence and execution boundaries

The data path uses validated input, an explicitly mapped WorldSpec, bounded
simulation, and inspectable scene frames. SHA-256 execution receipts bind the
program and complete trajectory. Replay compares a second execution, not a
cached result. This does not establish scientific validity or human visual
recognition. See [workbench boundaries](docs/workbench.md).

The City runtime follows this domain-specific path:

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
All currently executable plugins are repository-bundled, same-realm, and
explicitly not marketplace-eligible. Activation emits a trust receipt and
fails closed for legacy or revoked executable manifests; no third-party
execution lane is claimed.

## Repository map

- [`public/simulatte/`](public/simulatte/) — Simulatte World application, runtime, routing, and receipts
- [`public/blank/`](public/blank/) — prompt-to-pixels compiler and scene proof
- [`public/shared/`](public/shared/): contracts, input readers, reusable simulation, drawing, UI, and plugin implementations
- [`public/simulatte/platform/`](public/simulatte/platform/): plugin host and SDK, governed artifact storage, transport, and platform composition
- [`public/data/`](public/data/) — governed manifests, profiles, models, and world data
- [`tools/`](tools/) — build, audit, evaluation, and deployment tools
- [`tests/`](tests/) — runtime, platform, plugin, and data tests
- [`GOALS.md`](GOALS.md): durable product direction and success gates
- [`CATSCAN.md`](CATSCAN.md): root component authority and invariant charter
- [`docs/component-index.md`](docs/component-index.md): generated recursive component index
- [`docs/catscan-template.md`](docs/catscan-template.md): component charter format
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
