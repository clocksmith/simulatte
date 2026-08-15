# CATSCAN: Phase 8 Scene Proof

Parent: [Create compiler pipeline](../CATSCAN.md)
## Target

Settle composition obligations against render receipts and pixel evidence without adding scene content.

## Authority

- Owns settled obligations, proof verdict, explicit losses, and not-proven results.
- Does not own semantic changes, scene generation, or behavioral WorldProof.

## Scope

- Applies to Phase 8 scene proof code.

## Contracts

- Input: [Phase 7 render contract](../phase-07-render/CATSCAN.md)
- Output: [WorldProof product goal](../../../../GOALS.md#worldproof)

## Invariants

- An obligation without render evidence cannot silently pass.
- Screenshots and hashes are evidence, not proof by themselves.

## Acceptance

- Proof fixtures distinguish visible settlement from missing or unsupported output.
- Evidence: [render proof tests](../../../../tests/physical-compiler-render-proof.test.cjs).

## Non-goals

- Proving dynamics, controls, or safety from a screenshot.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.

