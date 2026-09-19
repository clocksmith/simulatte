# CATSCAN: Shared contracts

Parent: [Shared browser runtime](../CATSCAN.md)
## Target

Define restrictive shared browser contracts.

## Authority

- Owns canonical shared schemas and product-specific validators.
- WorldSpec and edit implementations live in the Blank library; legacy paths are generated projections.
- Does not own policy or activation.

## Scope

- `public/shared/contracts/`.

## Contracts

- Input: [schema rules](../../../STYLE_GUIDE.md)
- Output: [WorldSpec](world-spec.schema.json), [profile compiler](profile-world-spec.js), [WorldProof](world-proof.schema.json), and [profile binding](profile-world-proof.js)
- Output: [reconciliation](world-spec-reconciliation.js) and [improvement records](world-improvement-record.js)
- Output: recursive [scopes](recursive-world-scope.schema.json), [ports](simulation-port.schema.json), and [couplings](coupling-plan.schema.json)
- Output: typed [proof receipts](world-proof-intent.js)
- Output: [mission validator](contract-validator.js)
- Output: [bounded input reader](input-source.js) and [data WorldSpec adapter](data-world-spec.js)

## Invariants

- Absence differs from disablement; undeclared structure rejects.
- Determinism classes are closed and enforced.
- Proof binds input, build, lane, baseline, source, authority, and output.
- User edits cannot rewrite grounding evidence, refusals, or ambiguity records.
- Imports verify identity; recompilation retains history and requires user decisions to replace patches.
- All input modes share bounded decoding and hashing; data cannot authorize execution.
- Data adapters enforce mapping, bounds, and supported semantics.
- Profiles require WorldSpec, independent compilation, intent, and semantic evidence.
- Machine execution, replay, and human review remain separate verdicts.
- Improvement records bind failures, patches, replay, and review.
- Cross-scope ports require named mismatch adapters.
- Zero-delay cycles require solvers; lossy fidelity is not exact.

## Acceptance

- Schemas accept valid fixtures and reject boundary violations.
- Evidence: [shared domain contract tests](../../../tests/shared-domain-contracts.test.cjs).
- Evidence: [WorldSpec contract tests](../../../tests/world-spec.test.cjs).
- Evidence: [WorldProof contract tests](../../../tests/world-proof.test.cjs).
- Evidence: [profile contract tests](../../../tests/profile-world-spec.test.cjs).
- Evidence: [multiscale tests](../../../tests/multiscale-contracts.test.cjs).

## Non-goals

- Inventing behavior-changing defaults during validation.

## Freedom

Any implementation is permitted within these contracts.
