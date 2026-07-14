# Simulatte Pipeline

This folder is the prompt-to-render pipeline.

It takes a user prompt and turns it into:

1. runtime readiness
2. language structure
3. retrieved and weighted evidence
4. grounded world intent
5. simulation artifacts
6. visual scene packets
7. WebGPU pixels
8. a settled scene proof

## Phases

Each phase answers one question and owns one authority.

| Folder | Question | Job |
| --- | --- | --- |
| `phase-01-runtime/` | Is the runtime proven? | Proves required models, indexes, cache, and providers are ready. |
| `phase-02-language/` | What did the prompt literally say? | Turns prompt text into tokens, spans, clauses, relations, and query plans. |
| `phase-03-retrieval/` | What evidence exists and how strongly does it activate obligations? | Embedding retrieval, bounded mandatory rerank, and activation fusion with candidate-budget, coverage, conflict, and negative-evidence receipts. |
| `phase-04-grounded-intent/` | What world meaning do we commit to? | Chooses the accepted world graph and records candidate pairs, matches, assumptions, and unsupported concepts. |
| `phase-05-simulation/` | What executable physics do we compile? | Compiles grounded intent into PhysicsIR, solver graph, and RenderIR. |
| `phase-06-visual/` | What visual scene do we compile? | Compiles simulation output into VisualIR, render instances, and scene packets. |
| `phase-07-render/` | What actually rendered? | Executes the compiled render input and draws pixels with WebGPU. |
| `phase-08-scene-proof/` | Did the render keep every promise? | Settles every composition ledger obligation against render receipts. |

## Rules

- Each phase consumes the previous phase output.
- A phase may use approved runtime context, but it must not read random upstream state.
- Reranking and activation fusion are operations inside Phase 3; raw retrieval and weighted activation stay separate receipted sections.
- Phase 4 decides truth; Phase 3 only finds and weights evidence.
- Phase 6 owns visual meaning and scene composition.
- Phase 7 only draws the compiled scene packet. It does not infer semantics.
- Phase 8 settles obligations; it adds no scene content and surfaces losses instead of passing silently.
- If a prompt object is accepted, it must stay visible or be marked unsupported.

## Main Files

- `phase-03-retrieval/simulatte-intent-embedder.js`: embedding and reranking retrieval.
- `phase-04-grounded-intent/simulatte-universe-grounder.js`: accepted identity graph and candidate-match receipt.
- `phase-05-simulation/simulatte-physics-model.js`: phase orchestration and compile path.
- `phase-06-visual/simulatte-composition-graph.js`: VisualIR and scene packet compiler.
- `phase-07-render/simulatte-webgpu-renderer.js`: WebGPU renderer.
- `phase-08-scene-proof/simulatte-scene-proof.js`: obligation settlement and scene proof verdict.

## Verify

Run from the project root:

```sh
npm test
npm run audit:pipeline
```
