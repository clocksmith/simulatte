# CATSCAN: Tests and executable evidence

Component: `simulatte.tests`
Parent: [Simulatte](../CATSCAN.md)
Target: Act as the executable type system for component boundaries, behavior, artifacts, and evidence integrity.

## Authority

- Owns deterministic regression fixtures and assertions.
- Does not own product intent, deployed behavior, or human visual judgment.

## Scope

- Applies to test files and stable fixtures under `tests/`.

## Inputs

- [engineering invariants](../STYLE_GUIDE.md)
- [component validator](../tools/check-catscan.mjs)

## Outputs

- [folder contract suite](folder-contracts.test.cjs)
- [CATSCAN suite](catscan.test.cjs)

## Invariants

- Tests do not weaken to match incorrect behavior.
- A source test does not claim browser, GPU, deployment, or human proof.

## Acceptance

- The affected component's narrowest stable tests pass.
- Evidence: [test runner](../tools/run-test-files.mjs).

## Non-goals

- Encoding product direction only in assertions.

## Freedom

Any mechanism is permitted if it preserves these boundaries and passes the
acceptance evidence.

