# Simulatte Bug-Zapping Guide

This guide governs defect investigation and repair across both Simulatte
products. It supplements [STYLE_GUIDE.md](../../STYLE_GUIDE.md); the style
guide remains the binding contract where they differ.

## Scope And Ownership

| Product concern | Owning boundary | Do not fix it in |
| --- | --- | --- |
| Main experience lifecycle, scenario changes, controls, rendering coordination | `public/simulatte/app/` | UI presentation or plugin code |
| Plugin execution, capability calls, persistence, disposal | `public/simulatte/platform/plugin-host/plugin-runtime.js` | Individual experience UI |
| Main simulation, action selection, settlement, verification | `public/simulatte/runtime/`, `public/simulatte/verifier/` | Controller timing code |
| Prompt-to-pixels runtime and prompt controller | `public/blank/app/` | Later compiler phases |
| Prompt-to-pixels semantics and evidence | `public/blank/pipeline/phase-02-*` through `phase-05-*` | Phase 6 or Phase 7 |
| Visual compilation, scene packets, layout | `public/blank/pipeline/phase-06-visual/` | Renderer code |
| GPU rendering and browser pixels | `public/blank/pipeline/phase-07-render/` | VisualIR fields alone |
| Pixel and scene settlement | `public/blank/pipeline/phase-08-scene-proof/` | Renderer receipts alone |

Start at the owning boundary. A downstream symptom is not authority to invent
missing state, semantics, evidence, or lifecycle behavior.

## Retrospective

The highest-value main-world failures were lifecycle and evidence-boundary
defects rather than visible UI defects:

- Async transitions interleaved scenario changes, reset, seek, disposal,
  terminal settlement, and interventions.
- Receipts retained mutable references or accepted reload state without enough
  proof that the restored run was the same run.
- Main-app controllers repeated the same lifecycle hazards across plugin
  runtime, playback, and tier execution.

The compiler audit found the analogous failure class at phase boundaries:

- Phase 6 could read `universeGraph`, `promptParse`, and raw `physicsIR`
  instead of the Phase 5 RenderIR and SolverGraph contract.
- Spatial layout could fall back from accepted RenderIR relations to raw
  PhysicsIR relations.
- Render-program relations were sourced from `physicsIR.couplings`, dropping
  accepted prompt relations when no physical coupling existed.
- Retrieval and rendering work had cache identities or resource lifetimes too
  broad to prove reuse was correct and bounded.

The governing rule is the same in both products: state and evidence cross a
boundary only through an explicit, immutable, validated contract. Unsupported,
stale, unproven, or mismatched input fails closed with a receipt.

## Failure Discipline

- Separate an observed mismatch from its root cause. A receipt, timeout, or
  failed proof identifies the boundary to inspect; it is not root-cause proof.
- Preserve the triggering evidence before repair: exact input, phase envelopes,
  receipts, renderer state, error, and relevant configuration identity.
- Apply the smallest valid containment first. Halt invalid downstream work,
  mark the obligation unsupported or lost, and prevent reuse of corrupted cache
  or receipt state.
- Give retries and bounded work a strict budget and terminal state. Check the
  budget before consuming queued work. Every synchronous or async attempt
  settles on success, error, timeout, cancellation, and disposal; handler
  failure prevents reuse of partially advanced state.
- Test adversarial near-misses, not only happy paths: stale prompt hash,
  forged or mutated receipt, missing provider proof, wrong model or index
  identity, and an obligation reintroduced after exclusion.
- Compare duplicated implementations by failure behavior as well as successful
  output. Share low-level contracts and regression vectors, not broad policy
  helpers.
- Treat configuration as evidence. Verify manifest version, cache key,
  model/index hash, browser capability, origin, and deployed runtime separately
  from source.
- State the permitted conclusion and non-claim for every finding. For example,
  a Phase 7 receipt can prove that this render path consumed a scene packet; it
  cannot prove an unsupported concept was visually recognizable.

Use the failure-record outcomes `blocked`, `unsupported`, `invalid`, `timeout`,
and `divergent-replay` distinctly. Each retains the input, boundary, and
evidence that produced it without implying an unproven root cause.

### Closure Levels

Report the strongest level actually achieved:

| Level | Permitted conclusion |
| --- | --- |
| Source-fixed | The code and focused regression repair the identified boundary. |
| Browser-proofed | The browser render or lifecycle boundary produced the expected receipt. |
| Deployment-verified | The deployed route and effective runtime configuration produced the expected receipt. |
| Human-adjudicated | A bound human review found the required result recognizable and faithful. |

Do not claim a higher closure level from a lower one.

### Server, Relay, And Tooling Surfaces

These rules apply only when Simulatte introduces a server, relay, training sync,
or streamed model/tooling surface. They do not imply a server boundary for the
static `/blank/` compiler.

- Deployment evidence verifies effective environment values, proxy and header
  trust, exposed listeners, origin policy, and reachable network paths.
- Authorization treats missing, malformed, and unverifiable identity as denied.
  Test route and WebSocket-upgrade authorization separately; origin checks are
  not authentication.
- Bind raw results before accepting or exposing them: recompute canonical hashes
  from returned bytes or tensors and compare them with the receipt. Apply this
  to model, index, tensor, artifact, and receipt ingestion.
- Relays, training sync, and streamed model work use a total cursor, never
  advance past unseen data, bound and observe out-of-order buffers, and settle
  connect attempts on open, error, close, timeout, or cancellation.
- Add a release regression proving development bypasses are disabled by default
  and cannot become remotely reachable through proxy or forwarded-header
  configuration.

## Core Invariants

### Stateful controllers

Every stateful main-world controller has explicit `active -> disposing ->
disposed` semantics.

- A controller owns a monotonically increasing generation.
- Reset, seek, scenario change, intervention, and disposal invalidate the
  active generation before starting replacement work.
- Async work captures its generation and rechecks it after every `await` and
  before publishing state, rendering, persisting, dispatching, or invoking a
  callback.
- Queued work must verify that the controller remains `active` before it
  begins.
- Terminal settlement is a single-flight commit per generation.
- A stale terminal path must not publish a settlement, comparison, receipt,
  render, callback, or persistence write.

### Mutable plugin and receipt data

Treat plugin outputs, restore payloads, and receipts as hostile mutable input.

- Validate shape before use.
- Deep-clone before retaining, comparing, persisting, or exposing data.
- Deep-freeze retained evidence; shallow `Object.freeze` is insufficient.
- `Object.freeze` does not make `Map`, `Set`, or typed-array contents immutable.
  Expose read-only collection facades, retain detached typed-array snapshots,
  and return detached copies when consumers require mutable buffers.
- Retain cloned scenario, controls, actions, capabilities, settlements,
  comparisons, and restore inputs.
- Do not publish an object that a plugin or callback can mutate later.

### Reload and replay

Reload proves reproduction, not merely a plausible terminal state.

- Validate the persisted envelope before reading it.
- Reconstruct from current inputs and current governed artifacts.
- Compare terminal identity, action result, comparison evidence, settlement,
  and receipt identity when those fields are retained.
- Clear persisted state and emit a failure receipt on divergence.
- Never preserve an invalid saved state as a compatibility fallback.

### Eight-phase compiler envelope

Each phase consumes only its preceding phase output plus documented runtime
context. A later phase does not reopen earlier phase data to repair a gap.

| Phase | Semantic authority | Required output and failure mode |
| --- | --- | --- |
| 1 Runtime | Manifests, provider, model, index, cache evidence | Readiness receipts; missing required provider or index blocks work |
| 2 Language | Raw prompt and language options | Tokens, spans, counts, negation, clauses, and typed relations |
| 3 Retrieval | Language graph, indexes, model/reranker policy | Ranked and rejected candidates with model/index/cache provenance |
| 4 Grounded Intent | Retrieval evidence and language evidence | Accepted graph, unsupported rows, assumptions, provenance |
| 5 Simulation | Grounded graph and approved assumptions | PhysicsIR, SolverGraph, RenderIR, state bindings, controls |
| 6 Visual | RenderIR, SolverGraph, visual cards, operator atlas | VisualIR, scene packet, layout, render instances, visual receipts |
| 7 Render | Compiled scene packet and browser/GPU state | Drawn pixels, timing, frame, and readback receipts |
| 8 Scene Proof | Phase 7 evidence and compiled obligation ledger | Settled, failed, lost, or unsupported obligations |

Phase 6 has no authority to read `universeGraph`, `promptParse`, or raw
`physicsIR`. Prompt relation and layout authority comes from accepted
`renderIR.compositionLedger` rows. Phase 7 has no semantic authority. Phase 8
does not treat a VisualIR field or renderer assertion as proof without scene
packet and pixel evidence. Every affirmative and negative prompt constraint
must have a stable ledger ID before Phase 3; negation is not merely rejected
retrieval evidence. Exact numeric and number-word counts must retain their
value and `exact` mode through every phase. A minimum inferred from plurality
must never replace an explicit count.

Negative visual proof is bounded rather than absolute: the scene packet must
define the inspected region, target archetype, detector policy, and Phase 7
readback identity. Phase 8 may settle a negative obligation only as absent
within that recorded evidence boundary; otherwise it remains unsupported or
unproven.

## Investigation Procedure

### 1. Reproduce At The Boundary

Name the owning controller or phase, then capture its exact input, output,
generation or phase receipt, and observable failure. Do not begin with a
global search-and-replace or a visual patch.

For main-world work, record:

- Current lifecycle state and generation.
- Invalidation event: reset, seek, scenario change, intervention, or dispose.
- Every awaited operation and the generation checked after it.
- Whether terminal settlement, persistence, callback, and rendering share one
  commit boundary.

For compiler work, record:

- Prompt obligation ledger: entities, counts, attributes, parts, relations,
  actions, environments, and negation.
- Phase N input and phase N output schemas.
- Receipts and rejected or unsupported rows for the failed obligation.
- Render packet semantics, Phase 7 readback, and Phase 8 settlement for a
  visual failure.

### 2. Trace Authority, Not Symptoms

Ask these questions at every transition or phase:

- What is allowed to decide this value?
- Which exact object proves it?
- Can an upstream side channel alter it after the declared boundary?
- What invalidates it?
- Can a stale or mutable reference cross the boundary?
- Does a missing model, index, provider, receipt, or render proof fail closed?

If the answer is a fallback, a guessed field, an unvalidated saved payload, or
a raw prompt read in a later phase, remove that path and repair the owning
boundary.

### 3. Make The Smallest Cohesive Repair

Prefer a focused phase-local or controller-local module.

- Split a near-limit JavaScript file by an existing responsibility such as
  retrieval ranking, scene-kind binding, layout constraints, settlement, or
  persistence validation.
- Do not create a global utility hub.
- Keep every JavaScript file below 999 lines.
- Preserve source-span mappings, receipt IDs, hashes, and rejected evidence
  when optimizing candidate work or cache reuse.
- A faster compiler is not correct if it drops an obligation, reduces recall,
  weakens provider proof, or makes a visual relation unprovable.

### 4. Add A Regression That Forces The Failure

The regression belongs at the failing boundary and must fail on the old path.

| Failure class | Regression fixture |
| --- | --- |
| Stale async controller work | Pause a promise between awaits, invalidate generation, release it, and assert no state, receipt, callback, persistence, or render occurs |
| Duplicate terminal settlement | Start competing terminal calls and assert one committed settlement and comparison per generation |
| Disposal race | Queue work, dispose before it begins, and assert no plugin call or render starts |
| Mutable plugin output | Mutate the original nested plugin object after handoff and assert the retained receipt is unchanged and frozen |
| Mutable collection or typed array | Call `set`, `delete`, or `clear` on an exposed collection and mutate provider and consumer typed arrays; assert retained evidence and later cache hits are unchanged |
| Scheduler handler or budget failure | Throw inside a handler and exhaust the event budget; assert failed work is not counted as processed, work beyond the budget is not dequeued, and the scheduler enters an inspectable terminal state |
| Invalid reload | Corrupt envelope shape or terminal evidence, reload, and assert saved state is cleared with a failure receipt |
| Phase side channel | Poison an upstream field and assert the downstream phase output is unchanged or rejects missing authoritative input |
| Missing model/index/provider | Remove evidence and assert an unsupported or blocked receipt, never a plausible substitute |
| Relation loss | Compile a relation with no physical coupling and assert the accepted RenderIR relation reaches the scene packet and Phase 8 proof |
| Negation loss | Compile `a dog but no cat`; assert a typed negative cat obligation survives with its source span, reaches the scene packet, and settles only from bounded Phase 7 absence evidence |
| Explicit count weakening | Compile `five cats in a galaxy`; assert the Phase 2 quantity and Phase 4 visual obligation are `expectedCount: 5`, `countMode: exact`, and never a plural-surface minimum |
| Renderer-only claim | Validate both scene-packet semantics and browser pixels or readback before accepting the fix |

### 5. Verify In Layers

Run the smallest lane first. Broader gates are release evidence, not a
substitute for the focused regression.

## Focused Test Lanes

### Main world and plugins

```bash
node --test tests/plugin-platform.test.cjs
node --test tests/plugin-playback.test.cjs
node --test tests/tier-run-controller.test.cjs
```

Use these for plugin lifecycle, playback invalidation, tier execution,
settlement, persistence, and immutable boundary changes.

### Prompt-to-pixels compiler

```bash
SIMULATTE_PHYSICAL_TEST_GROUP=language-grounding node --test tests/physical-compiler-suite.cjs
SIMULATTE_PHYSICAL_TEST_GROUP=simulation-visual node --test tests/physical-compiler-suite.cjs
SIMULATTE_PHYSICAL_TEST_GROUP=render-proof node --test tests/physical-compiler-suite.cjs
SIMULATTE_PHYSICAL_TEST_GROUP=solvers node --test tests/physical-compiler-suite.cjs
node --test tests/scene-proof.test.cjs
node --test tests/phase7-pixel-readback.test.cjs
SIMULATTE_SHAPE_TEST_GROUP=browser-render node --test tests/js-shape-suite.cjs
```

Use `simulation-visual` for RenderIR, layout, VisualIR, scene packet, and
relation-preservation changes. Use `render-proof` and `phase7-pixel-readback`
when renderer behavior changes. Use `scene-proof` whenever Phase 8 settlement
or receipt linkage changes.

### Shared and release gates

```bash
npm run check:fast
npm run check:world
npm run check:blank
npm test
```

Run only the gates relevant to the changed product while unrelated worktree
changes are active. `check:blank` includes the desktop machine-only gold pixel
audit. A wrapper blocked by its dirty-worktree guard is not a passing result;
report the guard and the direct focused lanes separately.

## Evidence And Performance Rules

- Cache keys include every behavior-changing identity: artifact ID, declared
  dependency graph, model, dtype, dimensions, index hash, normalized query,
  ranking policy, and construction policy.
- Reuse only a proven compatible model handle and GPU device. Destroy or
  unmap transient GPU resources deterministically.
- Batch independent embedding work only when the provider supports it and
  source-span mappings remain intact.
- Bound candidate selection without weakening recall. Record candidates before
  and after each filter, reranker work, cache mode, latency, memory, and model
  reuse.
- Model, index, cache, provider, construction, and pixel evidence are all
  separate proofs. One cannot stand in for another.
- Unsupported concepts receive unsupported receipts. Do not draw a plausible
  visual substitute and call it complete.

## Release Checklist

- [ ] The fix is at the owning controller or phase boundary.
- [ ] Every async transition has invalidation, generation checks, and
  single-flight semantics where it commits terminal state.
- [ ] Retained plugin, receipt, persistence, comparison, and restore data is
  validated, deep-cloned, and deep-frozen.
- [ ] The compiler phase consumes only its allowed previous artifact and
  documented runtime context.
- [ ] Every prompt obligation, including negation, has a stable receipted
  representation through Phase 8.
- [ ] Explicit digit and number-word counts preserve their value and exactness;
  inferred plurality is never substituted for them.
- [ ] Negative settlements identify their inspected visual region, detector
  policy, and Phase 7 readback evidence.
- [ ] Missing evidence fails closed with an unsupported or blocked receipt.
- [ ] A focused regression reproduces the old race, corruption, boundary leak,
  or visual loss.
- [ ] Rendering changes have scene-packet and browser-pixel proof.
- [ ] The narrow test lane and relevant broader gate pass, or any external
  guard is reported precisely.
- [ ] Source-size checks pass and new code remains in a focused module.
