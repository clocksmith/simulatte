# CATSCAN: Simulatte

Parent: none
## Target

Turn data and instructions into editable, executable, replayable simulations through one data-first workbench with explicit evidence and refusal.

## Authority

- Owns repository mission, product boundaries, and release-wide evidence meaning.
- Does not own the internal algorithms of child components.

## Scope

- Applies to the complete Simulatte repository.

## Contracts

- Input: [product goals](GOALS.md)
- Input: [engineering invariants](STYLE_GUIDE.md)
- Output: [product navigation](README.md)
- Output: [browser component charter](public/CATSCAN.md)

## Invariants

- Goals, implementation claims, and evidence remain distinct.
- Unsupported behavior stays explicit and fails closed where required.

## Acceptance

- Every governed component resolves an ordered charter chain.
- Evidence: [CATSCAN contract tests](tests/catscan.test.cjs).

## Non-goals

- Prescribing one implementation technique for every component.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.
