# CATSCAN: Shared contracts

Parent: [Shared browser runtime](../CATSCAN.md)
## Target

Define restrictive, versioned contracts shared across browser components.

## Authority

- Owns shared schemas and deterministic validators.
- Does not own runtime defaults, product policy, or data activation.

## Scope

- Applies under `public/shared/contracts/`.

## Contracts

- Input: [schema rules](../../../STYLE_GUIDE.md)
- Output: [WorldSpec](world-spec.schema.json), [profile compiler](profile-world-spec.js), [WorldProof](world-proof.schema.json), and [profile binding](profile-world-proof.js)
- Output: [intent](world-proof-intent.js), [semantic](world-proof-semantic.js), [simulation](world-proof-simulation.js), [interaction](world-proof-interaction.js), and [safety](world-proof-safety.js) receipts
- Output: [mission validator](contract-validator.js)

## Invariants

- Absence and explicit disablement retain distinct meanings.
- Validators reject undeclared structure by default.
- Declared determinism classes are closed; proof cannot ignore them.
- Compiler proof binds inputs, build, lane, pre-edit baseline, and independent output.
- Intent and semantic proof bind source spans, settlements, accepted facts, authority, Phase 4, and the exact revision.
- Simulation, interaction, and safety proof retain independent state, transition, tolerance, and decision evidence.
- User edits cannot rewrite grounding evidence, refusals, or ambiguity records.
- Governed profiles execute only through a valid public WorldSpec and independent matching compile.
- Profile resolution compares every scenario-derived root with a fresh compilation; partial rewrites fail closed.
- Profile briefs compile canonical Phase 2 requirements and Phase 4 settlement and provenance; stale source or evidence fails.
- Profile replay binds the same intent and semantic receipts as the executed WorldProof.
- Profile WorldProof keeps machine execution, replay, and human visual recognition as separate verdicts.

## Acceptance

- Shared schemas accept valid fixtures and reject boundary violations.
- Evidence: [shared domain contract tests](../../../tests/shared-domain-contracts.test.cjs).
- Evidence: [WorldSpec contract tests](../../../tests/world-spec.test.cjs).
- Evidence: [WorldProof contract tests](../../../tests/world-proof.test.cjs).
- Evidence: [profile WorldSpec and WorldProof tests](../../../tests/profile-world-spec.test.cjs).

## Non-goals

- Inventing behavior-changing defaults during validation.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.
