# CATSCAN: Simulatte

Component: `simulatte`
Parent: none
Target: Compile bounded briefs into inspectable, executable worlds with explicit proof and refusal.

## Authority

- Owns repository mission, product boundaries, and release-wide evidence meaning.
- Does not own the internal algorithms of child components.

## Scope

- Applies to the complete Simulatte repository.

## Inputs

- [product goals](GOALS.md)
- [engineering invariants](STYLE_GUIDE.md)

## Outputs

- [product navigation](README.md)
- [browser component charter](public/CATSCAN.md)

## Invariants

- Goals, implementation claims, and evidence remain distinct.
- Unsupported behavior stays explicit and fails closed where required.

## Acceptance

- Every governed component resolves an ordered charter chain.
- Evidence: [CATSCAN contract tests](tests/catscan.test.cjs).

## Non-goals

- Prescribing one implementation technique for every component.

## Freedom

Any mechanism is permitted if it preserves these boundaries and passes the
acceptance evidence.

