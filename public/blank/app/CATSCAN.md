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
- Input: [shared execution lifecycle](../../shared/blank-core/CATSCAN.md)
- Input: [compiler charter](../pipeline/CATSCAN.md)
- Output: [Create page](../index.html)
- Output: [WorldSpec editor](prompt/world-spec-editor.js) and [correction session](prompt/world-improvement-session.js)
- Output: [compiler determinism coordinator](prompt/prompt-controller-compiler-proof.js)
- Output: [WorldProof replay](prompt/prompt-controller-lab-controller.js)
- Output: [runner](runtime/phase-runner.js)

## Invariants

- Dispatch runs eight phases; edits and retries enter identified forward requests.
- The runner bounds resources and revisions; cancellation cannot publish or release in-flight leases.
- Workers reject undeclared resources; cancellation and failure cannot publish or poison replacements.
- Authored replay admits phase sources; exchange preserves them without stale proof.
- Edits record user authority; recompilation requires preserve or supersede decisions.
- Compiler determinism compares independent compilation with the pre-edit baseline.
- Exact replay compares a second bound execution under one identity.
- Runs bind fixed-step simulation and safety comparisons before replay passes.
- Execution binds typed intent, settlement, and provenance without reinterpretation.
- Correction requires a failed critical obligation, user revision, and passing replay.
- Machine-only correction stays diagnostic until hash-bound human adjudication.

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
