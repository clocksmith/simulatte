# Simulatte

## Intent

Simulatte compiles natural language into executable world models: grounded
representations of anything a person describes, rendered as inspectable moving
simulations.

The prompt is the source program. What it names, relates, constrains, causes,
changes, measures, or implies should survive into the compiled world model
unless Simulatte explicitly marks it unsupported or assumed. The world model
must carry receipts: language evidence, grounding, assumptions, unsupported
claims, causal structure, simulation structure, VisualIR, and renderer bindings.

The visible simulation is the product truth. It must clearly represent the
prompt's specific intent without requiring logs or internal artifacts. Different
meanings should produce meaningfully different worlds, behavior, and visual
language; closely related prompts should preserve their differences; broadly
different prompts should not collapse into the same scene.

Simulatte is not a prompt-to-template toy, generic shader demo, keyword
visualizer, fixed example gallery, or model hallucinating physics. It is a
browser-native natural-language simulation pipeline with deterministic receipts,
grounded world models, and prompt-faithful visual execution.

Front-door promise:

> Prompt a world. Resolve intent into a world model. Run the simulation.

Simulatte uses browser-native simulation surfaces for entities, fields, motion,
materials, constraints, controls, causal processes, ledgers, visible state
evolution, and WebGPU visual execution. The front door is a single prompt.
Example prompts are convenience inputs, not product boundaries.

## Product Contract

- The prompt is compiled, not decorated. Prompt terms must be preserved as
  language evidence before they can become physics, visual atoms, or renderer
  behavior.
- The compiled world model is inspectable. It carries receipts for language
  spans, accepted activations, retrieved evidence, assumptions, unsupported
  claims, causal edges, PhysicsIR, simulation channels, VisualIR, graphics atom
  mappings, and renderer uniform bindings.
- The simulation is executable. The renderer should consume compiled artifacts
  rather than raw prompt text or broad scene buckets.
- The visual output is the user-facing proof. Prompt-specific entities,
  relations, materials, fields, motion, and causal processes must be visible
  enough that different meanings produce different worlds.
- If Simulatte cannot support part of the prompt, it must say so in receipts
  instead of silently inventing unsupported physics.

## Eight-Phase Pipeline

1. Runtime: load the browser runtime, model hooks, catalogs, and worker fallback.
2. Language graph: preserve prompt spans, clauses, predicates, quantities,
   modifiers, negation, and causal language.
3. Retrieval: use Qwen embedding, Qwen reranking, and deterministic catalog retrieval to find
   candidate primitives, materials, components, examples, causal rows, and
   visual cards.
4. Activation cloud: bind spans to candidate meanings and visual signals.
5. Grounded intent: accept evidence-backed meanings, expose unresolved spans,
   and build assumptions, alternatives, causal edges, and visual affordances.
6. Simulation compile: lower the grounded world into PhysicsIR, validation,
   solver graph, channels, state, controls, and readouts.
7. VisualIR compile: compose entities, geometry, materials, fields, processes,
   motion, camera, receipts, graphics atoms, uniform slots, and WGSL operator
   bindings.
8. WebGPU execution: render the compiled world model as a moving scene and keep
   the visible output tied to VisualIR and graphics atoms.

## Runtime Artifacts

- `spec.intent.intentBrief`: canonical intent receipt with language evidence,
  activation cloud, grounded interpretation, causal graph, assumptions, and
  visual intent.
- `spec.universeGraph`: grounded world graph built from accepted evidence.
- `spec.physicsIR`: typed simulation contract, operators, couplings, state
  fields, readouts, assumptions, and validation.
- `spec.solverGraph`: executable update channels and solver steps.
- `spec.renderIR.intentBriefReceipt`: compact handoff from grounded intent into
  render compilation.
- `spec.renderProgram.visualIR`: visual program for entities, materials, fields,
  processes, motion, camera, causal affordances, receipts, and graphics atoms.
- `spec.renderProgram.visualIR.graphicsAtoms`: operator mappings, language
  signals, uniforms, WGSL operators, and renderer-facing visual slots.

## Browser Modules

App code is split around the four product components:

- `public/app/main.js` and `public/app/version-guard.js`: startup and version checks.
- `public/app/loading/`: snake loading canvas and loading presentation.
- `public/app/prompt/`: prompt input, run/shuffle behavior, status, debug, and review UI.
- `public/app/simulation/`: simulation canvas host, app-side simulation state,
  readouts, scenario behavior, and simulation graphics helpers.
- `public/pipeline/`: the strict eight-phase prompt-to-render engine that powers
  the simulation canvas.

- `public/pipeline/phase-02-language/simulatte-language-evidence.js`: language-first span and predicate
  evidence.
- `public/pipeline/phase-03-retrieval/simulatte-intent-embedder.js`: model-backed retrieval over
  precomputed primitive, surface-card, and universe indexes.
- `public/pipeline/phase-03-retrieval/simulatte-activation-cloud.js`: span-to-candidate activations and
  native visual signal rows.
- `public/pipeline/phase-04-grounded-intent/simulatte-grounded-interpretation.js`: accepted activations,
  evidence bindings, unresolved spans, and coverage gaps.
- `public/pipeline/phase-04-grounded-intent/simulatte-intent-forensics.js`: canonical intent brief assembly.
- `public/pipeline/phase-04-grounded-intent/simulatte-universe-grounder.js`: grounded world graph and compact
  downstream intent receipts.
- `public/pipeline/phase-05-simulation/simulatte-physics-ir.js`: typed simulation IR.
- `public/pipeline/phase-06-visual/simulatte-composition-graph.js`: VisualIR and graphics atom
  composition.
- `public/pipeline/phase-07-render/simulatte-webgpu-renderer.js`: browser-native visual execution from
  compiled VisualIR and graphics atom uniforms.
- `public/app/prompt/prompt-controller.js`: browser UI coordinator, prompt
  runtime, worker fallback, receipts, and live simulation loop.

## Quality Gates

- `npm test` checks pipeline structure, artifacts, catalog drift, VisualIR
  mappings, false-positive gates, and browser contracts.
- `npm run audit:pipeline` scores every pipeline phase against the current floor
  and records history, baseline, weakest phase, and regressions.
- `npm run audit:visual` runs the browser visual rubric locally against prompt
  diversity, signal coverage, scene diversity, screenshots, canvas motion, and
  representation quality.
- `npm run eval:live` runs the same visual rubric against the deployed page.

## Boundary

Simulatte is not a D4DA archive, Reploid agent room, Grid wrapper, Dream demo,
or new separate product. Grid, Dream, Reploid, D4DA, Doppler, Doe, and Plasma
can later integrate only as packaged dependencies. The first product loop is
owned here:

```text
prompt -> intent -> world model -> simulation spec -> continuous render -> export/remix
```

## Local Check

```bash
npm test
npm run serve
```

`npm run serve` serves `public/` and mounts the sibling Doppler repo at
same-origin `/doppler/`. The intent manifest defaults to the pinned Qwen
embedding and reranker artifact URLs. For local artifact testing, pass an
override such as
`?embeddingModelBase=/doppler/models/local/qwen-3-embedding-0-6b-q4k-ehf16-af32`.

## Deployment

This repo deploys static Firebase Hosting to project `simulatte-world`.
The deploy preflight verifies that `public/vendor/doppler` matches the pinned
`doppler-gpu@0.4.7` npm package before stamping the build.

The machine has multiple Firebase accounts, so always check the active account
before deploying:

```bash
firebase login:list
firebase login:use <account-email>
firebase use
```

The deploy commands pin the project explicitly:

```bash
npm run deploy:preview
npm run deploy:hosting
```


If the CLI reports expired credentials, reauthenticate the selected account:

```bash
firebase login --reauth
```

`https://simulatte.world` and `https://simulatte-world.web.app` should both
serve the `simulatte-world` Firebase Hosting site when the custom domain is
attached to this project. Verify the active domain target with:

```bash
curl -I https://simulatte.world
curl -I https://simulatte-world.web.app
```
