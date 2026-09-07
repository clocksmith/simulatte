# CATSCAN: Create application

Parent: [Create](../CATSCAN.md)
## Target

Expose controls and evidence around the compiler.

## Authority

- Owns Create page state, browser workers, controls, and progress presentation.
- Does not own phase semantics or proof verdicts.

## Scope

- Browser coordination under `public/blank/app/`.

## Contracts

- Input: [runtime script manifest](runtime-script-manifest.js)
- Input: [compiler charter](../pipeline/CATSCAN.md)
- Output: [Create page](../index.html)
- Output: [WorldSpec editor](prompt/world-spec-editor.js), [reconciliation](prompt/world-spec-reconciliation-controller.js), and [correction session](prompt/world-improvement-session.js)
- Output: [compiler determinism coordinator](prompt/prompt-controller-compiler-proof.js)
- Output: [WorldProof inspector and replay](prompt/prompt-controller-lab-controller.js)
- Output: [run view model](runtime/run-view-model.js)
- Output: [runner](runtime/phase-runner.js)

## Invariants

- Preserved reconciled edits compile through typed phases before publication.
- The runner bounds phases, resources, and revisions; cancelled work cannot publish or release in-flight leases.
- Workers reject undeclared resources; cancellation and failure cannot publish or poison replacements.
- Authored replay admits per-phase sources; file exchange preserves sources, excluding stale execution proof.
- Edits record user authority before execution; fresh compilation cannot replace them without an explicit preserve or supersede decision.
- Compiler determinism compares an independently compiled artifact with the reconstructed pre-edit baseline.
- Exact replay performs a second execution and compares bound outcomes under one execution identity.
- Deterministic runs bind independent fixed-step simulation and safety comparisons before replay can pass.
- Execution and replay bind typed Phase 2 intent, Phase 4 settlement, and semantic provenance without reinterpretation.
- Correction records require a bound failed critical obligation, later user-authored revision, and passing exact replay.
- Machine-only correction records remain diagnostic until a final-phase human action creates a hash-bound adjudication.

## Acceptance

- Evidence: [worker tests](../../../tests/pipeline-worker-phases.test.cjs).
- Evidence: [WorldSpec editor tests](../../../tests/world-spec.test.cjs).
- Evidence: [browser audit](../../../tools/audit-world-spec-editor.mjs).
- Evidence: [correction tests](../../../tests/world-improvement-record.test.cjs).
- Evidence: [runner component tests](../../../tests/create-phase-runner.test.cjs).

## Non-goals

- Making retrieval, grounding, simulation, or rendering decisions.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.
