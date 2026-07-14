# Simulatte

[![Live site](https://img.shields.io/website?url=https%3A%2F%2Fsimulatte.world&label=live)](https://simulatte.world)
[![License: not declared](https://img.shields.io/badge/license-not%20declared-lightgrey.svg)](#license)

This repository ships two products:

**Simulatte** is the governed NYC navigation simulator at
[simulatte.world](https://simulatte.world/).

**Blank**: *By Language Alone, Nothing Keyframed*. The prompt-to-pixels world
compiler at [simulatte.world/blank](https://simulatte.world/blank/).

Blank came first and set the contracts: fail-closed phases, typed receipts,
and obligations checked against rendered pixels. Simulatte applies that
discipline to navigation. The two browser applications remain separate while
sharing governed data and repository tooling where their contracts agree.

## Simulatte

One embodied agent at a time, a delivery bicycle or a pedestrian runner,
executes natural-language missions in a real-data New York world, entirely in
the browser on WebGPU. The product is the decision loop, not the route:

```text
mission -> observe -> propose action bets -> predict -> safety gate
        -> select -> execute -> settle -> update memory -> observe
```

A generated route is not autonomy proof. A qualifying journey needs repeated
closed-loop decisions, validated state transitions, hard-gate compliance,
settled predictions, terminal completion, and a verified receipt chain.

Every stage is contract-typed: [mission](public/contracts/mission.schema.json),
[observation](public/contracts/observation.schema.json),
[action bet](public/contracts/action-bet.schema.json),
[settlement](public/contracts/settlement.schema.json), and
[journey receipt](public/contracts/journey-receipt.schema.json).

The active `nyc-core-autonomy-v1` world is compiled from pinned public
sources. It carries 2,491 multimodal nodes, 3,723 directed segments, 6,589 OSM
street ways, an 8,500-footprint building render set, and 13,062 feature cards.
Its three region packs span ten grounded places from the West Village through
North Brooklyn. Four official NYC Parks properties contribute nine rendered
exterior boundaries: McCarren, Tompkins Square, Union Square, and Washington
Square. Only the separately validated Union Square boundary is an executable
pedestrian circuit. Every source retains authority, license, query, snapshot
date, and SHA-256 provenance.

Current missions include bicycle delivery between grounded places, protected
lane preference, pedestrian yielding, named-street avoidance, and pedestrian
Union Square loops terminated by distance, lap count, or elapsed time. The UI
shuffles only examples that compile against those registered capabilities. A
5,000 ft mission settles at exactly 1,524 m. Scooter and car share the
renderer and ambient animation contract but fail closed as controlled agents
until eligible embodiments and roadway graphs are registered.

| Module | Role |
| --- | --- |
| [`public/index.html`](public/index.html), [`public/app/`](public/app/) | Entry page, camera controller, WebGPU renderer, trace view |
| [`public/mission/`](public/mission/) | Mission compiler: language to typed mission |
| [`public/world/`](public/world/) | World model and route planner |
| [`public/runtime/`](public/runtime/) | Decision loop: bets, safety gate, selection, settlement, occurrence engine, feature retrieval |
| [`public/verifier/`](public/verifier/) | Journey verification |
| [`public/contracts/`](public/contracts/) | Schemas and contract validator |
| [`public/data/autonomy/`](public/data/autonomy/) | Worlds, feature cards, embodiments, policies, evidence receipts |

`tools/samer/autonomy/` compares action-selection approaches across matched
public scenarios. Public diagnostic results cannot promote a policy or
support a physical-world autonomy claim. Design docs live in
[docs/autonomy/](docs/autonomy/README.md), including the
[NYC navigation transfer](docs/autonomy/nyc-navigation-transfer.md) map.

## Blank

Blank compiles natural-language prompts into inspectable, moving world models
in the browser. The prompt is source code. The compiler preserves the
prompt's language evidence, grounds accepted meanings, and lowers them into
physics and visual programs. WebGPU renders the scene, then Scene Proof
checks the result against the prompt's visible obligations.

The visible simulation is product truth. Prompt-specific entities, relations,
materials, motion, fields, and causal processes must appear in the moving
world. Unsupported meaning remains explicit in the receipts.

| Guarantee | Contract |
| --- | --- |
| Traceable | Language spans, clauses, quantities, modifiers, negation, and causal terms remain linked to downstream artifacts. |
| Grounded | Accepted world nodes carry provenance. Assumptions, alternatives, unresolved spans, and unsupported concepts stay explicit. |
| Executable | Grounded intent lowers into PhysicsIR, a solver graph, state channels, controls, readouts, VisualIR, and a scene packet. |
| Visible | WebGPU consumes the compiled scene packet. Scene Proof settles whether required objects and processes reached the pixels. |

### Eight-phase compiler

Each phase consumes the exact output of the previous phase plus allowed
runtime context.

| Phase | Question | Output |
| --- | --- | --- |
| [1. Runtime](public/blank/pipeline/phase-01-runtime/) | Are the required models, indexes, caches, and providers proven? | Runtime readiness and model, index, reranker, provider, and cache receipts. |
| [2. Language](public/blank/pipeline/phase-02-language/) | What did the prompt say? | Tokens, spans, clauses, predicates, quantities, negation, relations, and query plans. |
| [3. Retrieval](public/blank/pipeline/phase-03-retrieval/) | What evidence activates each prompt obligation? | Ranked candidates, reranker provenance, activation weights, conflicts, negative evidence, and coverage. |
| [4. Grounded intent](public/blank/pipeline/phase-04-grounded-intent/) | What world meaning does the compiler accept? | Grounded world graph, candidate-match scan receipt, rejected evidence, assumptions, alternatives, and unsupported concepts. |
| [5. Simulation](public/blank/pipeline/phase-05-simulation/) | What executable physics follows from that world? | PhysicsIR, solver graph, RenderIR, state channels, controls, and readouts. |
| [6. Visual](public/blank/pipeline/phase-06-visual/) | What scene represents the simulation? | VisualIR, render instances, camera, lights, passes, graphics atoms, and scene packet. |
| [7. Render](public/blank/pipeline/phase-07-render/) | What did WebGPU draw? | Pixels, frame state, identity receipts, and timing receipts. |
| [8. Scene Proof](public/blank/pipeline/phase-08-scene-proof/) | Which composition obligations reached the render? | Settled obligations, verdict, explicit losses, and not-proven receipts. |

```text
prompt -> evidence -> grounded world -> simulation -> visual program
       -> WebGPU pixels -> scene proof
```

Phase 3 retrieves and weights evidence. Phase 4 accepts meaning. Phase 6 owns
visual composition. Phase 7 draws the compiled scene without adding
semantics. Phase 8 checks the result without adding scene content. The
mandatory rules live in [STYLE_GUIDE.md](STYLE_GUIDE.md); the
[pipeline contract](public/blank/pipeline/README.md) owns phase authority,
inputs, and outputs.

## Shared substrate

| Surface | Owner |
| --- | --- |
| [`public/data/`](public/data/) | Governed data for both projects: NYC worlds and feature cards, the construction substrate, the language lexicon, and the embedder artifacts. |
| [`public/vendor/doppler/`](public/vendor/doppler/) | Pinned local inference runtime. The [model-runtime lock](public/data/simulatte-embedder/model-runtime-lock.json) owns the package version, model identities, manifest hashes, and integrity values. |
| [`tools/`](tools/) | World compilers, data gates, evaluators, SAME-R executors, and audits. |

## Run locally

```bash
npm test
npm run serve
```

`npm run serve` serves `public/` and mounts the sibling Doppler repository at
same-origin `/doppler/`. For a local embedding artifact, override the base
URL in the browser:

```text
?embeddingModelBase=/doppler/models/local/qwen-3-embedding-0-6b-q4k-ehf16-af32
```

## Evidence gates

| Command | Proof |
| --- | --- |
| `npm test` | Phase boundaries, artifact shapes, catalog drift, deterministic output, VisualIR mappings, false-positive guards, autonomy contracts, and browser contracts. |
| `npm run audit:pipeline` | Model-backed phase receipts, scores, weakest phase, regressions, and audit history. |
| `npm run audit:visual` | Local screenshots, canvas motion, signal coverage, representation quality, and prompt diversity. |
| `npm run eval:live` | The visual rubric against the deployed Firebase surface. |
| `npm run check:deploy` | Model lock, vendored Doppler integrity, autonomy data verification, the SAME-R honesty gate, and the deploy surface before Firebase stamps the build. |

Screenshots and hashes are evidence inputs. The pipeline receipts and settled
obligations explain what the render represented and what it lost.

## Start here

| Reader | Entry points |
| --- | --- |
| Users | [Simulatte](https://simulatte.world) and [Blank](https://simulatte.world/blank/) |
| Simulatte contributors | [Autonomy design](docs/autonomy/README.md), [browser runtime](public/), and [SAME-R executor](tools/samer/autonomy/) |
| Blank UI contributors | [Compiler browser app](public/blank/app/) and [simulation host](public/blank/app/simulation/) |
| Pipeline contributors | [Pipeline contract](public/blank/pipeline/README.md) and [style guide](STYLE_GUIDE.md) |
| Runtime and catalog maintainers | [Model-runtime lock](public/data/simulatte-embedder/model-runtime-lock.json), [data contracts](public/data/), and [vendored Doppler](public/vendor/doppler/) |
| Evidence and deploy operators | [Repository commands](package.json) and [deployment runbook](docs/deployment.md) |

## Deployment

Firebase Hosting serves `public/` from project `simulatte-world`. The
predeploy hook runs the deploy gate and stamps the build.

```bash
npm run firebase:check
npm run deploy:preview
npm run deploy:hosting
```

Account selection, account-pinned scripts, authentication recovery, and
domain checks live in [docs/deployment.md](docs/deployment.md).

## License

`package.json` marks this repository private and does not declare a license.
No standalone `LICENSE` file is present.
