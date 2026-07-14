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

Simulatte is a local-first, governed NYC navigation simulator. Maps answers
"how do I get there?" Simulatte executes "what would happen if?" and returns
the route, every autonomous choice, the simulated outcome, and the evidence
needed to inspect that outcome. It runs in the browser on WebGPU and does not
send mission text or journey ledgers to a server.

```text
language -> grounded mission -> candidate routes -> action bets -> safety gates
         -> selected action -> reference dynamics -> settlement -> receipt chain
```

The same controller and A* planner execute pedestrian, bicycle, scooter, and
car journeys. Embodiment files provide mode-specific dimensions, dynamics,
speed limits, rendering, and graph eligibility. Missions currently cover
point-to-point travel, bicycle delivery, ordered stops and return trips,
declared park circuits, distance, lap and duration goals, named-street
avoidance, deadlines, daylight windows, gross compensation, bicycle-rack
proximity, and wheelchair requests. Unsupported requests fail with named
evidence instead of being guessed.

Every stage is contract-typed: [mission](public/contracts/mission.schema.json),
[observation](public/contracts/observation.schema.json),
[action bet](public/contracts/action-bet.schema.json),
[settlement](public/contracts/settlement.schema.json), and
[journey receipt](public/contracts/journey-receipt.schema.json). Journey
receipts can be exported, verified, imported, and replayed. A browser-local
SHA-256 ledger accumulates settled ETA error, mode results, and curriculum
progress without a network write.

The active `nyc-core-autonomy-v1` world is compiled from pinned public
sources. It contains 11,286 multimodal nodes, 28,638 directed segments, 6,587
rendered OSM street ways, 8,500 building footprints, 13,185 feature cards, 20
mode-specific grounded place nodes, four declared park circuits, and 98 exact
seams across three region packs. The current footprint spans the West Village,
Union Square, East Village, the Williamsburg Bridge corridor, Williamsburg,
McCarren Park, Greenpoint, and nearby streets. Every source retains authority,
query, snapshot date, byte hashes, and a claim boundary.

The data layer also pins 9,359 NYC DOT bicycle-parking rows, 11,603 NYC DOT
pedestrian-ramp rows, and 5,131 reported NYPD crashes from July 2025 through
June 2026. Rack proximity is geometry evidence, not availability. Ramp
measurements are not ADA determinations. Crash joins have no exposure
denominator and therefore support historical-observation counterfactuals, not
"safest route" or live-risk claims.

Simulatte can compare a baseline journey with one declared intervention:
closing a routed street, weighting the pinned crash history, or requesting a
dated world snapshot. Both lanes run through the same controller and return a
matched diff. If the street, evidence index, or dated world is unavailable,
the challenger refuses while retaining the baseline receipt. Current and
future map worlds are never silently substituted for a historical street
network.

### What the models do

The zero-download control resolves place names lexically, retrieves feature
cards through an inverted index, and reranks them with typed deterministic
rules. Route planning and every action decision are deterministic and do not
use a language model.

The optional neural place lane runs the pinned Qwen 3 Embedding 0.6B model
locally through Doppler. It embeds only the origin or destination phrase and
may select only a node already eligible for the chosen embodiment. It does not
generate text, choose a route, operate the vehicle, or replace safety gates.
After correcting the Doppler 0.4.8 embedding math, the shipped deterministic
extended-typo lane scores 27/37 versus 21/37 for the legacy lexical control,
with zero wrong-place or must-refuse violations. The Qwen candidate also scores
27/37 and adds no correct rows, so it remains an explicit experiment rather
than the default. That population is exposed and promotion-ineligible. The
pinned Qwen reranker remains available to Blank; it is not falsely reported as
executing in Simulatte's navigation decisions.

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
diagnostic scenarios. Those runs do not support a physical-world autonomy
claim. Design docs live in
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
