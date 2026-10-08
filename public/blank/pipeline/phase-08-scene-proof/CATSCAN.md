# CATSCAN: Phase 8 Scene Proof

Parent: [Create compiler pipeline](../CATSCAN.md)
## Target

Settle composition obligations against render receipts and pixel evidence without adding scene content.

## Authority

- Owns settled visual obligations, the scene-proof verdict, explicit losses, and not-proven results.
- Attaches the shared WorldProof aggregate without converting scene evidence into behavioral proof.
- Does not own semantic changes, scene generation, simulation, interaction, safety, or replay evidence.

## Scope

- Applies to Phase 8 scene proof code.

## Contracts

- Input: [Phase 7 render contract](../phase-07-render/CATSCAN.md)
- Output: [WorldProof product goal](../../../../GOALS.md#worldproof)

## Invariants

- Activity sequence acceptance consumes Phase 7 trajectory and drawing evidence and checks bounded contacts, collisions, support, joint lengths, feet, participants, timing, and motion; incomplete sequences remain not-proven. Planar kinematics, force dynamics, and liquid transfer have distinct coverage.

- An obligation without render evidence cannot silently pass.
- Phase 8 supplies the canonical required-failure list; downstream displays cannot drop unsupported obligations.
- Screenshots and hashes are evidence, not proof by themselves.
- WorldProof receives typed intent, semantic, and interaction receipts without Phase 8 borrowing one proof class for another.

## Acceptance

- Proof fixtures distinguish visible settlement from missing or unsupported output.
- Evidence: [render proof tests](../../../../tests/physical-compiler-render-proof.test.cjs).
- Evidence: [WorldProof aggregation tests](../../../../tests/world-proof.test.cjs).

## Non-goals

- Proving dynamics, controls, or safety from a screenshot.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.
