# CATSCAN: Create application

Component: `simulatte.create.app`
Parent: [Create](../CATSCAN.md)
Target: Expose prompt, progress, inspection, interaction, and review controls around the compiler.

## Authority

- Owns Create page state, browser workers, controls, and progress presentation.
- Does not own phase semantics or proof verdicts.

## Scope

- Applies to browser coordination under `public/blank/app/`.

## Inputs

- [runtime script manifest](runtime-script-manifest.js)
- [compiler charter](../pipeline/CATSCAN.md)

## Outputs

- [Create page](../index.html)
- [run view model](runtime/run-view-model.js)

## Invariants

- The application coordinates typed phase APIs rather than reimplementing them.
- Displayed completion follows receipts, not optimistic UI state.

## Acceptance

- The runtime manifest and phase registry resolve without hidden dependencies.
- Evidence: [phase module registry tests](../../../tests/phase-module-registry.test.cjs).

## Non-goals

- Making retrieval, grounding, simulation, or rendering decisions.

## Freedom

Any mechanism is permitted if it preserves these boundaries and passes the
acceptance evidence.

