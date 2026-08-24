# CATSCAN: Shared contracts

Parent: [Shared browser runtime](../CATSCAN.md)
## Target

Define restrictive shared browser contracts.

## Authority

- Owns shared schemas and deterministic validators.
- Does not own runtime defaults, product policy, or data activation.

## Scope

- `public/shared/contracts/`.

## Contracts

- Input: [schema rules](../../../STYLE_GUIDE.md)
- Output: [WorldSpec](world-spec.schema.json), [profile compiler](profile-world-spec.js), [WorldProof](world-proof.schema.json), and [profile binding](profile-world-proof.js)
- Output: [recompile reconciliation](world-spec-reconciliation.js) and [governed improvement record](world-improvement-record.js)
- Output: recursive [scopes](recursive-world-scope.schema.json), [frames](coordinate-frame.schema.json), [ports](simulation-port.schema.json), [couplings](coupling-plan.schema.json), [checkpoints](scope-checkpoint.schema.json), and [fidelity transitions](fidelity-transition.schema.json)
- Output: [intent](world-proof-intent.js), [semantic](world-proof-semantic.js), [simulation](world-proof-simulation.js), [interaction](world-proof-interaction.js), and [safety](world-proof-safety.js) receipts
- Output: [mission validator](contract-validator.js)

## Invariants

- Absence and explicit disablement differ; validators reject undeclared structure.
- Declared determinism classes are closed; proof cannot ignore them.
- Compiler proof binds input, build, lane, baseline, and independent output.
- Intent and semantic proof bind source, settlement, authority, and revision; proof classes remain independent.
- User edits cannot rewrite grounding evidence, refusals, or ambiguity records.
- Imports verify identity. Recompilation retains reconciliation history and cannot replace accepted patches without a named user decision.
- Governed profiles require a valid public WorldSpec, matching independent compile, canonical intent, and semantic evidence.
- Profile WorldProof keeps machine execution, replay, and human visual recognition as separate verdicts.
- Improvement records bind the failed trace, exact user patches, successful replay, and review without admitting unadjudicated data into a training population.
- Cross-scope ports require named mismatch adapters.
- Zero-delay cycles require solvers; lossy fidelity is not exact.

## Acceptance

- Schemas accept valid fixtures and reject boundary violations.
- Evidence: [shared domain contract tests](../../../tests/shared-domain-contracts.test.cjs).
- Evidence: [WorldSpec contract tests](../../../tests/world-spec.test.cjs).
- Evidence: [WorldProof contract tests](../../../tests/world-proof.test.cjs).
- Evidence: [profile WorldSpec and WorldProof tests](../../../tests/profile-world-spec.test.cjs).
- Evidence: [improvement record tests](../../../tests/world-improvement-record.test.cjs).
- Evidence: [multiscale tests](../../../tests/multiscale-contracts.test.cjs).

## Non-goals

- Inventing behavior-changing defaults during validation.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.
