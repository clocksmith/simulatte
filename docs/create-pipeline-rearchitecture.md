# Create pipeline rearchitecture

Status: proposed implementation, reviewed against the working tree on 2026-09-07.
Owner: Simulatte. This document expands the original plan; it does not report the redesign as implemented.

Preserve [GOALS](../GOALS.md), [STYLE_GUIDE](../STYLE_GUIDE.md), the fixed eight phases, static hosting, Doppler model execution, existing routes, WorldSpec compatibility, and accepted user edits. Model-generated programs must remain inspectable and editable. Scientific, illustrative, fictional, and symbolic representations must declare their interpretation and assumptions. The ambition is exceptional representation of open natural language; completion is judged against the request, not the availability of a familiar scene.

**What the code actually provides**

| Current source | Observed implementation | Consequence for this redesign |
| --- | --- | --- |
| [Phase contracts](../public/blank/pipeline/simulatte-phase-contracts.js) | Eight versioned envelopes; required artifact keys, receipt IDs, predecessor schema checks, and forbidden-field checks. | Extend these contracts instead of introducing another pipeline schema authority. A matching schema currently does not establish exact predecessor content identity. |
| [Runtime/language orchestration](../public/blank/pipeline/phase-05-simulation/simulatte-physics-model-phase-runtime-language.js) | Runtime preparation and language helpers live under simulation. Runtime context includes `retrievalEvidence`; `withPhase1RetrievalEvidence` carries later retrieval results. | Move responsibilities to their phases and remove semantic results from runtime context after callers migrate. |
| [Parser](../public/simulatte/language/simulatte-universe-parser.js) and [structured-intent rules](../public/blank/pipeline/phase-04-grounded-intent/simulatte-structured-intent-rules.js) | Language extraction uses lexicons and grammar. Structured intent identifies itself as deterministic rules with `model.executed: false`; several candidate collections are capped at 18. | Introduce learned interpretation explicitly. Audit whether each cap bounds candidate search or can discard a required participant. |
| [Model selection](../public/data/pipeline-model-selection.json) and [runtime lock](../public/data/simulatte-embedder/model-runtime-lock.json) | Create offers classification, retrieval, and reranking slots, without a generation slot. Retrieval defaults to local indexing. The pinned reranker is disabled. | Add and qualify generation through the existing model configuration. Embedding availability and a pinned reranker do not establish generative execution. |
| [Doppler intent helper](../public/blank/pipeline/phase-01-runtime/simulatte-doppler-intent.js) | `analyzePrompt` normalizes supplied hints and rejects direct model-execution options. | Do not treat this name as an existing language-model interpreter or bypass the runtime lock through it. |
| [Grounding/simulation orchestration](../public/blank/pipeline/phase-05-simulation/simulatte-physics-model-phase-grounding.js) | Phase 4 and Phase 5 share a file. Phase 5 already emits PhysicsIR, solverGraph, renderIR, interactionIR, channels, and controls. | Separate ownership while retaining these useful compilation products. |
| [Construction substrate](../public/data/simulatte-construction-substrate.js) and [part construction](../public/blank/pipeline/phase-06-visual/simulatte-construction-parts.js) | Reusable part roles and topologies exist alongside specialized construction branches; descriptor hints are capped at 20. | Generalize typed composition and audit coverage limits instead of replacing the existing library with another catalog. |
| [Renderer API](simulatte/rendering-api.md) | Shared session lifecycle already exists; Create consumes exact Phase 6 input. Shared mesh support has specific World/Recursive integrations, not universal Create import. | Reuse lifecycle and compatible utilities; implement and test any missing Create geometry/backend adapter explicitly. |
| [Structured-intent evaluator](../tools/samer/evaluate-structured-intent.mjs) | Aggregates supplied expected/actual rows, accepts a supplied `schemaValid` boolean, and checks sealed-population metadata. | Bind evaluation to retained artifacts, recompute validity, and verify population custody rather than treating supplied result fields as execution proof. |

The [retained local qualification](../artifacts/pipeline-live-local-audit-composition-2026-09-06/acceptance.json) records 1,227 tests and 40 browser cases on a named earlier build. Those cases used local retrieval and mobile viewport emulation. They are a regression baseline, not evidence that this redesign, learned generation, or universal language support works.

**Execution and data contracts**

Use the existing module registry and plain browser JavaScript. Give each phase one discoverable entry facade with explicit dependencies; retain small internal modules by job. Do not add a bundler, a framework per phase, another global registry, or wrappers around every helper.

Proposed common interface:

```js
run({ previous, invocation }, resources, signal) // PhaseOutput or Promise<PhaseOutput>
validateInput(call, resourceDescriptors)
validateOutput(output, call)
```

The runner awaits either return form. These are proposed interfaces, not current exported signatures.

- `previous` is the exact preceding envelope. Phase 1 materializes a request envelope using the existing Phase 0 schema identity; today's runtime entry takes a prompt string and options. The new envelope contains the request, authored-input references, and declared configuration. This is ingress, not another processing phase.
- `invocation` is empty for phases without additional inputs. Phase 7 explicitly receives the allowed simulation snapshot, frame identity, and viewport; their digests bind its output. It cannot obtain mutable application state through a hidden global.
- `resources` exposes phase-specific handles to models, immutable assets, and rendering services. Serializable descriptors record identities and capabilities; GPU devices and sessions are never serialized into artifacts.
- Phase 2 receives pinned linguistic examples through declared resources, not world-candidate retrieval. Phase 3 owns semantic retrieval. Later phases resolve already selected component references; they cannot perform undeclared semantic searches.
- Runtime health probes may execute named test inputs. Their results establish provider readiness and remain distinct from the user's retrieval or interpretation.

Extend the current envelope, retaining `schema`, `phase`, `inputSchema`, `runtimeReceiptId`, `artifact`, and `receipts`. Add producer/build identity, predecessor artifact digest, invocation digest, artifact digest, and dependency digests. Allocate new schema versions centrally where shapes change. Validate nested payloads and references, not only top-level keys.

Use canonical UTF-8 serialization and SHA-256 for new integrity digests; reject non-finite numbers and unspecified required fields. Store binary assets by digest. Separate timing and operational attempt records from deterministic artifact content. The existing [WorldSpec hash](../public/shared/contracts/world-spec.js) is `fnv1a32:` and excludes selected evidence roots. Preserve its compatibility meaning; do not silently relabel it cryptographic. A stronger public WorldSpec identity requires an explicit versioned migration.

One canonical language graph, accepted semantic graph, and composition ledger own their respective state. Compatibility fields such as `promptParse`, `languageGraph`, and `sceneLanguageGraph` become validated projections where they overlap; retain distinct information instead of flattening unlike concepts. Each requirement retains an ID stable within its input revision, source or authoring authority, explicit references, and an append-only disposition. Cross-revision reconciliation records identity mappings rather than assuming source offsets remain stable. Merging nodes retains all contributing source spans.

The runner owns run revisions, cancellation, phase order, budgets, and attempts. Commit output only if the predecessor digest and active revision still match. Invalid dependencies stop the run. Unsupported meaning can produce a partial artifact and preview, but cannot count as successful task completion. Cancelled GPU work may finish physically; stale results cannot publish, and resources are released after in-flight use ends.

Repairs create a new Phase 0 request with the original prompt and explicit versioned retry policy or accepted edit. Traverse all eight phases forward. Reuse a complete phase artifact only when its exact inputs and dependencies match; otherwise reuse eligible lower-level computations, not stale envelopes. Candidate exclusions and failure-receipt references are declared policy for the new attempt, never hidden feedback in the current attempt's runtime context. No phase mutates earlier meaning. Reuse the existing [construction search records](../public/blank/app/prompt/prompt-controller-construction-search.js), preserving rejected attempts instead of adding another retry ledger.

**Phase 1: Runtime Gate**

Current entry: `runPhase1RuntimeGate` in the runtime/language orchestration file. Move it and readiness policy into `phase-01-runtime`; keep language extraction elsewhere.

Input is the request, selected lane, model/index lock references, device capabilities, and declared resource limits. Output contains untouched prompt ingress, immutable resource descriptors, readiness receipts, and the initial ledger. It contains no retrieval candidates or accepted interpretations.

Implementation steps:

1. Extend the model-selection schema and numbered runtime lock with separately declared generation capability, tokenizer, model artifacts, decoding policy, and qualification references. Keep generation, embedding, and reranking requirements independent.
2. Qualify actual Doppler generation on the intended browser/device: cold installation, warm reuse, meaningful output, cancellation, malformed output, memory pressure, and device loss. Preserve existing download consent and the explicit local lane.
3. Inspect the pinned Doppler generation API before promising grammar-constrained decoding. If the required structured-output or token-filter hook is absent, implement and qualify it in Doppler, then update Simulatte's pinned dependency through its existing synchronization workflow. Validation followed by regeneration must be labeled as such; it is not incremental constrained decoding.
4. Budget model residency and GPU queue use together with graphics. Do not load every model simultaneously or infer that an embedding model can generate programs.

Acceptance: the selected lane performs its declared operations and missing required capabilities stop readiness. Model identity alone never satisfies this gate. Capture model requests and responses with decoding identity. Separate replay of an accepted program from fresh model interpretation; a fixed seed alone does not establish identical interpretation across devices.

**Phase 2: Language Graph**

Current parser entry: `parsePrompt`. Move language graph and query-plan construction from simulation ownership into `phase-02-language`; retain the shared parser facade for World callers.

Input is Phase 1 prompt ingress and declared language resources. Output is one linguistic graph with entity mentions, attributes, exact quantities, negation scopes, clauses, temporal connectives, reference alternatives, and source-bound candidate requirements. It does not commit physical operators or visual templates.

Implementation steps:

1. Preserve original text and half-open UTF-16 offsets, matching JavaScript string indexing. If normalization is used, retain a reversible offset map.
2. Ask a qualified Doppler generator for schema-constrained linguistic proposals. Check span substrings, number/unit fidelity, identity references, duplicated mentions, and missing meaningful clauses independently of model confidence.
3. Keep uncertainty explicit. Preserve complete clause evidence even when its meaning is unresolved. Pronouns, quantifier scope, event order, and comparisons can carry alternatives for Phase 4. Rules provide exact lexical evidence and a measured control; they no longer determine the maximum expressiveness.
4. Partition long inputs at clauses with stable cross-part references. Never use a context or batching limit to silently truncate requested objects or conditions.

Acceptance: unseen paraphrases and meaning-changing edits alter the appropriate requirements. Independent annotations detect omitted meaning; an unchanged scene hash or a complete self-generated ledger is insufficient.

**Phase 3: Retrieval and Rerank**

Current owners include [phase retrieval](../public/blank/pipeline/phase-05-simulation/simulatte-physics-model-phase-retrieval.js), [span retrieval](../public/blank/pipeline/phase-03-retrieval/simulatte-intent-embedder-span-retrieval.js), and [construction retrieval](../public/blank/pipeline/phase-03-retrieval/simulatte-intent-embedder-construction-retrieval.js). Move orchestration to `phase-03-retrieval`.

Input is the Phase 2 graph and query plan. Output carries that evidence plus ranked candidates, component bundles, compatibility constraints, coverage, exclusions, and model execution provenance.

Implementation steps:

1. Query the existing universe, visual-card, and construction indexes by role, required ports, relations, appearance, and behavior. Preserve the originating requirement and source span on every query and returned row.
2. Separate retrieval recall from ranking precision. Bound alternatives per query only with measured recall; chunk queries without dropping slots. Cache immutable index vectors and deduplicate equivalent queries while retaining every owner.
3. Build candidate bundles whose ports and dependencies can compose. Rank relevance and coverage without interpreting a high similarity score as semantic acceptance.
4. Expose missing capabilities as specific uncovered requirements. New admitted components enter the same indexes. Keep observed incumbent wins and reranker failures; the disabled reranker must earn qualification before use.

Acceptance: known relevant components remain retrievable in unfamiliar combinations, while incompatible candidates are rejected with explicit reasons. No lexical filter may silently remove an otherwise admissible model proposal.

**Phase 4: Grounded Intent**

Move `runPhase4GroundedIntent` to `phase-04-grounded-intent`. Replace [catalog-grounded draft rules](../public/blank/pipeline/phase-04-grounded-intent/simulatte-structured-intent-rules.js) behind a versioned interpretation interface, retaining them as an explicit comparison implementation during migration.

Input is Phase 3 evidence. Output is the accepted semantic contract: canonical entities, properties, relations, events, conditions, quantities, prohibitions, selected component descriptors, assumptions, alternatives, and unresolved requirements.

Implementation steps:

1. Generate candidate semantic graphs constrained to typed composition operations and provenance. Permit new assemblies and explicit symbolic entities; do not require every resulting world to have a pre-existing catalog ID.
2. Validate reference resolution, event scope, contradictory assertions, exact counts, and requirement conservation. Model confidence cannot override an explicit quantity or prohibition.
3. Specify the representation mode and coordinate meaning. Distinguish physical relations from presentation constraints; declare whether “left” refers to a view or world frame. Ask about consequential ambiguity while allowing editable, clearly provisional interpretations where useful.
4. Admit physical shape descriptors and behavioral intent before simulation compilation. A later visual choice cannot silently change mass, collision geometry, or causal meaning.
5. Apply accepted user overrides through existing [authorship and reconciliation](../public/shared/contracts/world-spec-reconciliation.js). Retain field authority and resolve missing targets explicitly.

Acceptance: each accepted relation is traceable to request, authoring, or declared inference; every unfulfilled requirement stays visible. Independent reviewers must recognize the chosen interpretation.

**Phase 5: Simulation Compile**

Keep `runPhase5SimulationCompile`, [PhysicsIR validation](../public/blank/pipeline/phase-05-simulation/simulatte-physics-ir-validator.js), [solver compilation](../public/blank/pipeline/phase-05-simulation/simulatte-solver-compiler.js), and the [solver registry](../public/blank/pipeline/phase-05-simulation/simulatte-solver-registry.js) under simulation ownership.

Input is the Phase 4 contract. Output retains PhysicsIR, solverGraph, interactionIR, state channels, controls, renderIR, lowered-relation evidence, and unresolved execution requirements.

Implementation steps:

1. Introduce a versioned, restricted behavior-expression vocabulary: typed references, arithmetic, bounded repetition, predicates, events, state transitions, constraints, and calls to admitted solver operations. Extend existing IRs rather than creating another public world format.
2. Check units, scalar/vector shape, coordinate frames, parameter bounds, dependencies, and state ownership. Require an explicit reducer when multiple operators contribute to a channel. Reject accidental competing writers.
3. Separate instantaneous dependency cycles from temporal feedback. Feedback uses declared state/delay or a coupled solver; algebraic cycles require an implemented solution method.
4. Lower equations and event programs to trusted interpreters or compiled kernels with resource bounds. New elementary operations require implementation and independent tests. Do not evaluate arbitrary model-produced JavaScript or shader strings.
5. Qualify stability and timestep policy for each model. Preserve actual operator execution receipts, fresh-state replay, interaction transitions, and safety checks. Unsupported physical mechanisms cannot be replaced silently by attractive animation.

Acceptance: perturbing a declared control changes the intended state and readout; invariants and non-finite-state checks execute. Illustrative kinematics remain explicitly illustrative.

**Phase 6: Visual Compile**

Move the Phase 6 envelope builder from [visual execution orchestration](../public/blank/pipeline/phase-05-simulation/simulatte-physics-model-phase-visual-execution.js) into `phase-06-visual`. Reuse compatible geometry grammars, construction substrate, framing, and interaction projection.

Input is Phase 5 output, including accepted visual descriptors and semantic bindings. Output is VisualIR, scene packet, geometry references, materials, transforms, rigging, camera/light plans, passes, and per-instance obligation bindings.

Implementation steps:

1. Compile typed geometry recipes for mesh assembly, swept surfaces, repeated parts, instancing, fields/volumes, diagrams, and symbolic structures. Each recipe declares parameters, attachment frames, bounds, and source requirements. These are target capabilities; existing Create rendering does not already support every form.
2. Generate and compare recipe compositions rather than selecting a whole scene by prompt keywords. Validate topology, nondegenerate geometry, exact part counts, attachment continuity, and asset provenance.
3. Solve presentation constraints against final visible bounds: overlap, visibility, scale, framing, and informative camera placement. Physical positions and colliders retain Phase 5 authority. If a proposed mesh requires different physical geometry, request a new forward attempt.
4. Define units and transforms explicitly between world, object, camera, and screen coordinates. Preserve separate IDs for semantic entity, instance, part, mesh, and state channel.
5. Compile material and lighting intent into parameters the backend actually consumes. Rich appearance requires correct geometry, normals, shading, transparency, shadows, and composition together; a new field in JSON does not implement a visual feature.

Acceptance: close semantic contrasts are recognizable in pixels and motion, not only packet metadata. Human review assesses object identity, material appearance, composition, and clarity.

**Phase 7: Render Execution**

Reuse [renderer-session.js](../public/shared/render/renderer-session.js) and Create's [renderer facade](../public/blank/pipeline/phase-07-render/simulatte-webgpu-renderer.js). Move Phase 7 envelope construction out of simulation ownership without moving semantics into rendering.

Input is exact Phase 6 output plus an explicitly identified simulation snapshot, frame/viewport, and GPU resources. Output is the frame's render-execution artifact, submitted instance bindings, timings, state/program identity, and GPU readback receipts.

Implementation steps:

1. Keep initialization, readiness, updates, disposal, and device failure within the existing session contract. Build a Create adapter for any newly supported mesh or volume representation; shared mesh support elsewhere is not evidence of that adapter.
2. Implement actual vertex/buffer layouts and WGSL paths for admitted visual features. Specify normal transforms, linear color processing, transparency ordering, depth/shadow behavior, and resource ownership.
3. Update per-instance data from its exact state channel and projection. Verify repeated objects cannot collapse through a shared target lookup.
4. Use instancing, cached pipelines, buffer reuse, and declared detail levels to control cost. Fidelity may change only inside an accepted visual policy; required counts, motion, and recognizability remain gates.
5. Separate the simulation clock from rendering cadence. Resize, backgrounding, reconnecting a device, and resumed frames follow declared pause/catch-up policy. Record queue submission, asynchronous completion, and readback costs separately.

Acceptance: real WebGPU execution preserves the submitted programs through first frame, interaction, resize, cancellation, and device failure. Renderer success never grants new semantic authority.

**Phase 8: Scene Proof and independent evaluation**

Retain [settleSceneProof](../public/blank/pipeline/phase-08-scene-proof/simulatte-scene-proof.js) as a consumer of Phase 7. It receives no raw prompt, retrieval channel, or scene-generation authority.

Input is the exact render-execution artifact, carried ledger, program/state bindings, and observed evidence. Output is settled obligations and WorldProof evidence with independent dimensions left distinct.

Implementation steps:

1. Recompute obligation checks from actual submitted instance identities, counts, parts, spatial bounds, solver execution, interactions, and pixel readback. Refuse mismatched packet/frame/program identities.
2. Declare temporal observation windows. One still image cannot establish “after,” “until,” “never moves,” or a triggered transition. Tie traces and pixel observations to the same episode.
3. Run an external evaluation observer against the original request and separately authored expectations. It reads artifacts without rewriting them or adding a ninth compilation phase. Human and independent vision judgments supplement machine checks.
4. Extend the current structured-intent evaluator to consume artifact references and verified digests, recompute schema validity, and verify sealed-population opening/provenance. Keep public diagnostics separate from sealed promotion.
5. Add per-request completion, quantities, attributes, negation, temporal behavior, and visual recognition to aggregate preservation metrics. Preserve the existing policy thresholds and their meanings; micro-F1 is not proof that every requirement succeeded.

Acceptance: omitted source meaning, wrong semantic bindings, fake receipts, stale frames, and visually unrecognizable results are detected even when the compiler's own ledger looks complete.

**Composable examples and component admission**

Extend current universe/visual indexes, construction records, model locks, and review artifacts. A common component description is a shared schema projection over those owners, not a new competing database.

Proposed component metadata:

```js
{
  id, version, ownerPhase,
  ports: { inputs, outputs },       // named types, units, multiplicity
  parameters, preconditions, effects,
  dependencies, resourceBounds,
  source, license, contentDigest,
  examples, counterexamples, qualification
}
```

The shape is a design sketch, not a currently accepted schema. Geometry components add attachment frames and bounds; behavior components add state ownership and integrator requirements. A composed component records the exact member versions and bindings.

Build small reusable examples for linguistic attachment, graph relations, event transitions, force coupling, articulated parts, material responses, camera framing, and evidence checks. Parameterized templates support substitution and bounded recursion. They can generate many combinations without whole-prompt lookup tables. Candidate search may be bounded; required input coverage may not be truncated.

Admission proceeds through schema validation, isolated execution, counterexamples, and downstream compositions with independently expected results. Runtime generation may compose admitted operations freely within the declared language. A new primitive or unsupported external dependency remains a proposal until implemented and qualified. Distinguish an unfamiliar word, a new assembly of known operations, a missing elementary capability, and insufficient physical evidence; they require different repairs.

Extend [compile-human-reviews](../tools/compile-human-reviews.mjs) to propose typed component/example changes with source review IDs. Its current heuristic suggestions are not automatically validated runtime knowledge. Keep historical records intact, version corrections, and invalidate dependents when a component is revoked.

Split training/retrieval examples from diagnostic and sealed evaluation populations by composition family. Reviewed evaluation cases become development material and cannot remain “unseen.” Record example-pack and prompt-policy identities with each model call.

**Worked composition target**

Example request: “Three glass lanterns, A, B, and C, circle a wooden tree. When I ring a bell, A turns red, B and C stop, and the tree never moves.”

This is a proposed integration case, not a claim of present support.

| Phase | Required transformation |
| --- | --- |
| 1 | Identify local model/asset capabilities and preserve the exact request. |
| 2 | Extract three named lanterns, glass, wooden tree, circling, user bell event, event-scoped color/stopping, and the continuing immobility prohibition. |
| 3 | Retrieve compatible lantern/tree recipes, circling behavior, event/stop operations, and glass/wood material components. Surface anything unavailable. |
| 4 | Bind A/B/C to those same three entities, specify illustrative kinematics and editable defaults, keep the tree fixed, and bind the event only to its stated effects. |
| 5 | Create per-lantern state, a bell input event, circling updates, A's color transition, and B/C's stopped state. A continues circling; tree state remains constant. |
| 6 | Construct recognizable lanterns and tree, expose A/B/C identity, apply glass/wood appearance, and frame all three trajectories. |
| 7 | Render the same program before and after the actual user event using identified state snapshots. |
| 8 | Check exactly three lanterns, the correct event timing and targets, B/C stopping, A changing color while continuing, and tree immobility over the declared window. |

Changing “B and C stop” to “only C stops” must change the event bindings and observed motion without selecting another scene. Changing glass to paper must change appearance while preserving the unchanged behavior. Import, edit, recompile, and replay retain authored overrides and provenance.

**Implementation sequence and removal gates**

These are delivery steps, not additional pipeline phases.

| Step | Concrete change and dependency | Required exit evidence |
| --- | --- | --- |
| A. Capture the baseline | Freeze source, build, configuration, phase artifacts, existing failures, and independently annotated composition families. Preserve public and sealed population separation. | Reproduce a known pass and a known failure, with the first divergent artifact identified. Existing 40-case evidence remains historical. |
| B. Establish contracts and runner | Add deep validators, digests, phase-specific resource access, invocation binding, cancellation, and replay. Wrap current implementations; migrate retrieval results out of runtime context into Phase 3 output. | Mutation, wrong-predecessor, missing-reference, stale-result, and resource-failure tests fail correctly. Supported existing semantics remain unchanged. |
| C. Qualify generation | Add the generation slot/lock and adapter; implement any missing Doppler constraint hook in its owner. Use real model/browser episodes. | Structured output, source preservation, malformed-response handling, cold/warm use, and cancellation are measured. No classifier or embedding result substitutes. |
| D. Replace interpretation | Implement Phase 2 proposals, Phase 3 composable retrieval, and Phase 4 semantic composition against B/C. Retain one canonical representation per responsibility. | Unseen language and component combinations preserve independently specified meaning, including ambiguity and negative cases. |
| E. Compile behavior | Extend existing IRs and solver adapters with typed composition, events, units, ownership, and declared coupling. | Analytic/reference cases, fresh-state replay, event transitions, and invalid compositions demonstrate the actual execution boundary. |
| F. Compile and render representation | Implement visual recipes and their Create renderer consumption together, using E's bindings and the existing session lifecycle. | Real desktop/mobile browser captures, motion traces, and human visual review show the required representation and measured resource use. |
| G. Compare and retire | Run independent full-journey evaluation and matched established-engine controls. Switch one implementation at a time, then remove superseded callers and duplicate builders. | Accepted interfaces and edits survive; new behavior beats the frozen baseline on declared outcomes without erasing adverse evidence. |

The structural move map is specific: runtime functions to Phase 1; language graph/query helpers to Phase 2; retrieval orchestration to Phase 3; grounded-graph construction to Phase 4; simulation lowering stays in Phase 5; visual and render envelope builders move to Phases 6 and 7. Phase 8 settlement stays in its owner. Common envelope validation remains in `simulatte-phase-contracts.js`.

Do not rewrite stable solvers, shaders, shared lifecycle, or WorldSpec authorship merely to change module style. Keep the existing synchronous `createSpecFromPrompt` behavior for explicit local compatibility callers during migration; route interactive model work through the existing asynchronous compiler dispatch. Both must use the same phase transformations. Changing a caller's return type requires an explicit migration, not an accidental Promise.

Delete a compatibility adapter only when its callers and manifest entries have migrated and no serialized artifact requires its reader. Keep legacy import readers and immutable evidence where compatibility requires them. Rebuild WorldSpec through existing [runtime serialization/editing](../public/blank/pipeline/phase-05-simulation/simulatte-world-spec-runtime.js); new executable fields require schema and migration work, not unchecked side fields. WorldSpec assembly projects the accepted phase outputs into the public editable artifact; it makes no new semantic choices and is not a ninth phase. Accepted edits enter the next request as identified authoring inputs and are reconciled in Phase 4. Attach execution evidence separately without silently changing authored intent.

A WorldSpec-only import or replay remains an authored-program path and must not trigger fresh language-model interpretation. Preserve its original provenance and validate rebuilt execution evidence without presenting replay as a new prompt-understanding result.

Update affected CATSCAN charters with implementation, regenerate runtime entrypoints and inventories through their owners, and verify both Create and World because language and rendering utilities are shared. No source ownership move is complete while the old family remains the hidden implementation authority.

**Commands, comparison, and resource policy**

Reuse existing commands; phase substitution/replay switches are proposed extensions to the current tooling, not flags available today.

- `npm run evaluate:structured-intent -- --input <trial.json> --out <report.json>` currently evaluates a supplied trial; extend its artifact verification before using it as execution evidence.
- `node tools/audit-pipeline.mjs --intent-mode local --prompt "<request>"` exercises the explicit local lane. Model mode requires its declared providers.
- `npm run test:doppler-models` is the current qualification entry; extend it for generation rather than assuming its existing embedding/reranker cases cover generation.
- `npm run audit:blank:gold:desktop` and `npm run audit:blank:gold:mobile` currently select local, machine-only gold evaluation. Add separately identified model and human review episodes.
- `npm run test:renderers`, `npm run check:blank`, `npm run check:world`, and `npm test` cover integration as the respective boundaries change. Synchronize and check the runtime manifests and charters.
- `npm run compile:reviews` retains the existing human-review workflow; new admission rules must bind its outputs to tests and reviewers.

Measure cold load, download bytes, warm cache, model calls, each compilation phase, first useful frame, sustained frames, simulation steps, and proof separately. Cache keys include input and dependency digests, producer/model/tokenizer/decoding policy, and compatible device identity where relevant. Keep portable CPU artifacts separate from device-owned GPU caches. Count failed candidates and verification work.

Set budgets in versioned policy from measured baselines before comparison. Bound context, candidate expansion, recursion, geometry, model residency, GPU allocations, and evidence storage separately. Yield and cancel expensive work; coalesce obsolete revisions. Budget exhaustion is visible and cannot silently omit requirements.

Compare against a competent model-to-established-engine implementation with matched prompts, assets, model access, hardware, and resource budgets. Use blinded judgments for semantic fidelity, recognizability, visual quality, motion, editing, and usefulness. Scores for appearance cannot compensate for incorrect counts or events. Prove relative improvements on the evaluated population before making a “best graphics” claim.

Require 100% accounting for extracted and independently annotated requirements. Unsupported or unresolved required content fails task completion; accounting for a refusal is not satisfying the request. No finite test suite proves universal support.

**Cohesion decisions after the final review**

- Runtime readiness supplies capabilities, Phase 3 supplies retrieved knowledge, and Phase 4 owns semantic commitment. Neither naming nor context fields may conceal another owner.
- Scene proof checks executed artifacts; independent evaluation checks whether the request was understood. Neither can stand in for the other.
- Phase 5 owns physical state and geometry assumptions; Phase 6 owns visual realization and presentation; Phase 7 executes both through explicit bindings.
- Creative composition uses extensible typed programs and admitted components. It is not limited to whole scenes, and it does not confer unimplemented physics through labels.
- New attempts replay forward with identified inputs; accepted edits retain authority; prior failures remain evidence.
- Reusable examples expand capability. Sealed evaluation stays independent, and adding examples cannot be used to hide missing generalization.
- Keep one plan, one runner, existing schema/registry owners, and existing review/evaluation entrypoints. Migration adapters are temporary dependencies, not a second platform.

Research motivates these decisions without validating this implementation: [PICARD](https://aclanthology.org/2021.emnlp-main.779/) demonstrates constrained language generation; [Holodeck](https://arxiv.org/abs/2312.09067) combines language, assets, and spatial constraints; [Code as Policies](https://arxiv.org/abs/2209.07753) composes executable control programs. [CFQ](https://arxiv.org/abs/1912.09713) motivates composition-family evaluation, and [GenEval](https://arxiv.org/abs/2310.11513) motivates detailed independent visual checks. These results neither establish universal natural-language understanding nor prove Simulatte superior.

Component: Create architecture and implementation plan.
Intent: preserved; responsibilities and migration mechanics clarified.
Acceptance evidence for this document: current source inspection, local reference validation, charter checks, and folder-contract validation.
Boundary effects: documentation only; implementation and deployment remain separate work.
