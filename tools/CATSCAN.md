# CATSCAN: Repository tools

Component: `simulatte.tools`
Parent: [Simulatte](../CATSCAN.md)
Target: Build, inspect, validate, package, and audit Simulatte through explicit commands and receipts.

## Authority

- Owns deterministic developer and release tooling.
- Does not own browser runtime policy or proof without bound execution evidence.

## Scope

- Applies to Node and support tools under `tools/`.

## Inputs

- [engineering invariants](../STYLE_GUIDE.md)
- [package commands](../package.json)

## Outputs

- [CATSCAN validator](check-catscan.mjs)
- [World tool charter](simulatte/CATSCAN.md)

## Invariants

- Generated artifacts are changed only by their generators.
- Tool success states what evidence layer actually ran.

## Acceptance

- Tool contracts and focused regression lanes pass.
- Evidence: [CATSCAN contract tests](../tests/catscan.test.cjs).

## Non-goals

- Becoming a hidden runtime dependency or claiming deployment from local output.

## Freedom

Any mechanism is permitted if it preserves these boundaries and passes the
acceptance evidence.

