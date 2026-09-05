# CATSCAN: Shared contracts

Parent: [Shared browser runtime](../CATSCAN.md)
## Target

Define restrictive shared browser contracts.

## Authority

- Owns schemas and validators.
- Does not own policy or activation.

## Scope

- `public/shared/contracts/`.

## Contracts

- Input: [schema rules](../../../STYLE_GUIDE.md)
- Output: [WorldSpec](world-spec.schema.json), [profile compiler](profile-world-spec.js), [WorldProof](world-proof.schema.json), and [profile binding](profile-world-proof.js)
- Output: [recompile reconciliation](world-spec-reconciliation.js) and [governed improvement record](world-improvement-record.js)
- Output: recursive [scopes](recursive-world-scope.schema.json), [frames](coordinate-frame.schema.json), [ports](simulation-port.schema.json), [couplings](coupling-plan.schema.json), [checkpoints](scope-checkpoint.schema.json), and [fidelity transitions](fidelity-transition.schema.json)
- Output: [intent](world-proof-intent.js), [semantic](world-proof-semantic.js), [simulation](world-proof-simulation.js), [interaction](world-proof-interaction.js), and [safety](world-proof-safety.js) receipts
- Output: [mission validator](contract-validator.js)
- Output: [bounded input reader](input-source.js) and [data WorldSpec adapter](data-world-spec.js)

## Invariants

- Absence differs from disablement; undeclared structure rejects.
- Determinism classes are closed and enforced.
- Compiler proof binds input, build, lane, baseline, and independent output.
- Independent proof classes bind source, settlement, authority, and revision.
- User edits cannot rewrite grounding evidence, refusals, or ambiguity records.
- Imports verify identity; recompilation retains history and requires user decisions to replace patches.
- File, pasted, and explicit URL inputs share bounded decoding and hashing. URLs omit credentials; data cannot authorize execution.
- Data adapters enforce mapping, bounds, and supported semantics.
- Profiles require WorldSpec, independent compilation, canonical intent, and semantic evidence.
- Profile WorldProof keeps machine execution, replay, and human visual recognition as separate verdicts.
- Improvement records bind failures, patches, replay, and review; unadjudicated data cannot enter training.
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

Any implementation is permitted within these contracts.
