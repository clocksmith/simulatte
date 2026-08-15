# CATSCAN: Vendored runtimes

Component: `simulatte.vendor`
Parent: [Browser surface](../CATSCAN.md)
Target: Provide pinned third-party browser runtime source without transferring product authority to the vendored tree.

## Authority

- Owns the exact vendored snapshot and its local import surface.
- Does not own upstream Doppler direction, Simulatte model policy, or artifact qualification.

## Scope

- Applies to vendored dependencies under `public/vendor/`.

## Inputs

- [model runtime lock](../data/simulatte-embedder/model-runtime-lock.json)

## Outputs

- [Doppler browser API](doppler/src/client/doppler-api.js)

## Invariants

- Vendored bytes match declared provenance.
- Simulatte selects models through its own manifests.

## Acceptance

- Pinned provenance and import boundaries remain valid.
- Evidence: [Doppler provenance tests](../../tests/doppler-model-provenance.test.cjs).

## Non-goals

- Editing vendored code as an undeclared Simulatte fork.

## Freedom

Any mechanism is permitted if it preserves these boundaries and passes the
acceptance evidence.

