# CATSCAN: Create application

Parent: [Create](../CATSCAN.md)
## Target

Expose prompt, progress, inspection, interaction, and review controls around the compiler.

## Authority

- Owns Create page state, browser workers, controls, and progress presentation.
- Does not own phase semantics or proof verdicts.

## Scope

- Applies to browser coordination under `public/blank/app/`.

## Contracts

- Input: [runtime script manifest](runtime-script-manifest.js)
- Input: [compiler charter](../pipeline/CATSCAN.md)
- Output: [Create page](../index.html)
- Output: [WorldSpec editor](prompt/world-spec-editor.js)
- Output: [compiler determinism coordinator](prompt/prompt-controller-compiler-proof.js)
- Output: [WorldProof inspector and replay](prompt/prompt-controller-lab-controller.js)
- Output: [run view model](runtime/run-view-model.js)

## Invariants

- The application coordinates typed phase APIs rather than reimplementing them.
- Displayed completion follows receipts, not optimistic UI state.
- Applied edits record user authority before the edited artifact executes.
- Compiler determinism compares an independently compiled artifact with the reconstructed pre-edit baseline.
- Exact replay performs a second execution and compares bound outcomes under one execution identity.
- Deterministic Create runs bind an independent fixed-step simulation comparison before replay can pass.
- Declared safety rules bind two independent fixed-step decision traces before WorldProof can pass.
- Create binds the typed Phase 2 and Phase 4 intent receipt into both execution and exact replay.
- Create binds typed semantic provenance into execution and exact replay without reinterpreting it.

## Acceptance

- The runtime manifest and phase registry resolve without hidden dependencies.
- Evidence: [phase module registry tests](../../../tests/phase-module-registry.test.cjs).
- Evidence: [WorldSpec editor tests](../../../tests/world-spec.test.cjs).
- Evidence: [WorldSpec editor browser audit](../../../tools/audit-world-spec-editor.mjs).

## Non-goals

- Making retrieval, grounding, simulation, or rendering decisions.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.
