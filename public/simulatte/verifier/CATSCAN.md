# CATSCAN: Journey verification

Parent: [World](../CATSCAN.md)
## Target

Verify a completed journey against declared mission, lifecycle, result, and receipt obligations.

## Authority

- Owns journey verification verdicts and explicit verification failures.
- Does not own mission compilation, plugin execution, or evidence capture.

## Scope

- Applies to verifier code under `public/simulatte/verifier/`.

## Contracts

- Input: [journey receipt schema](../../shared/contracts/journey-receipt.schema.json)
- Output: [journey verifier](journey-verifier.js)

## Invariants

- Missing terminal evidence cannot pass.
- Verification distinguishes modeled results from external truth.

## Acceptance

- Valid journey receipts pass and incomplete receipts fail deterministically.
- Evidence: [profile evidence runner tests](../../../tests/profile-evidence-runner.test.cjs).

## Non-goals

- Manufacturing missing receipts or changing the completed run.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.

