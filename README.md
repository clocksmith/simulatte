# Simulatte

[![Live site](https://img.shields.io/website?url=https%3A%2F%2Fsimulatte.world&label=live)](https://simulatte.world)
[![License: not declared](https://img.shields.io/badge/license-not%20declared-lightgrey.svg)](#license)

[Open Simulatte Autonomy](https://simulatte.world)

[Open the prompt-to-pixels compiler](https://simulatte.world/blank/)

Simulatte compiles natural-language prompts into inspectable, moving world
models in the browser. The prompt is source code. The compiler preserves the
prompt's language evidence, grounds accepted meanings, and lowers them into
physics and visual programs. WebGPU renders the scene, then Scene Proof checks
the result against the prompt's visible obligations.

The visible simulation is product truth. Prompt-specific entities, relations,
materials, motion, fields, and causal processes must appear in the moving
world. Unsupported meaning remains explicit in the receipts.

## Autonomous delivery-bike runtime

[Open Simulatte Autonomy](https://simulatte.world/)

The root `public/` modules are the browser subsystem for continuous embodied
decisions. It compiles a known-label delivery mission, observes a synthetic
corridor, proposes action bets, predicts each outcome, applies hard safety
gates, selects one eligible action, executes the reference dynamics, settles
the prediction, and repeats until delivery or a surfaced failure.

The autonomy runtime does not extend or reorder the eight-phase compiler.
`tools/samer/autonomy/` compares action-selection approaches across matched
public scenarios. Public diagnostic results cannot promote a policy or support
a physical-world autonomy claim.

## Product contract

| Guarantee | Contract |
| --- | --- |
| Traceable | Language spans, clauses, quantities, modifiers, negation, and causal terms remain linked to downstream artifacts. |
| Grounded | Accepted world nodes carry provenance. Assumptions, alternatives, unresolved spans, and unsupported concepts stay explicit. |
| Executable | Grounded intent lowers into PhysicsIR, a solver graph, state channels, controls, readouts, VisualIR, and a scene packet. |
| Visible | WebGPU consumes the compiled scene packet. Scene Proof settles whether required objects and processes reached the pixels. |

The mandatory rules live in [STYLE_GUIDE.md](STYLE_GUIDE.md). The
[pipeline contract](public/blank/pipeline/README.md) owns phase authority, inputs, and
outputs.

## Eight-phase compiler

Each phase consumes the exact output of the previous phase plus allowed runtime
context.

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
visual composition. Phase 7 draws the compiled scene without adding semantics.
Phase 8 checks the result without adding scene content.

## Run locally

```bash
npm test
npm run serve
```

`npm run serve` serves `public/` and mounts the sibling Doppler repository at
same-origin `/doppler/`. The
[model-runtime lock](public/data/simulatte-embedder/model-runtime-lock.json)
owns the Doppler package version, embedding and reranker identities, manifest
hashes, artifact URLs, and integrity values.

For a local artifact, override the embedding base URL in the browser:

```text
?embeddingModelBase=/doppler/models/local/qwen-3-embedding-0-6b-q4k-ehf16-af32
```

## Evidence gates

| Command | Proof |
| --- | --- |
| `npm test` | Phase boundaries, artifact shapes, catalog drift, deterministic output, VisualIR mappings, false-positive guards, and browser contracts. |
| `npm run audit:pipeline` | Model-backed phase receipts, scores, weakest phase, regressions, and audit history. |
| `npm run audit:visual` | Local screenshots, canvas motion, signal coverage, representation quality, and prompt diversity. |
| `npm run eval:live` | The visual rubric against the deployed Firebase surface. |
| `npm run check:deploy` | Model lock, vendored Doppler integrity, and the deploy surface before Firebase stamps the build. |

Screenshots and hashes are evidence inputs. The pipeline receipts and settled
obligations explain what the render represented and what it lost.

## Start here

| Reader | Entry points |
| --- | --- |
| Users | [Autonomy](https://simulatte.world) and [prompt-to-pixels compiler](https://simulatte.world/blank/) |
| UI contributors | [Compiler browser app](public/blank/app/) and [simulation host](public/blank/app/simulation/) |
| Pipeline contributors | [Pipeline contract](public/blank/pipeline/README.md) and [style guide](STYLE_GUIDE.md) |
| Runtime and catalog maintainers | [Model-runtime lock](public/data/simulatte-embedder/model-runtime-lock.json), [data contracts](public/data/), and [vendored Doppler](public/vendor/doppler/) |
| Evidence and deploy operators | [Repository commands](package.json) and [deployment runbook](docs/deployment.md) |
| Autonomy contributors | [Autonomy design](docs/autonomy/README.md), [browser runtime](public/), and [SAME-R executor](tools/samer/autonomy/) |

## Deployment

Firebase Hosting serves `public/` from project `simulatte-world`. The predeploy
hook runs the deploy gate and stamps the build.

```bash
npm run firebase:check
npm run deploy:preview
npm run deploy:hosting
```

Account selection, account-pinned scripts, authentication recovery, and domain
checks live in [docs/deployment.md](docs/deployment.md).

## License

`package.json` marks this repository private and does not declare a license. No
standalone `LICENSE` file is present.
