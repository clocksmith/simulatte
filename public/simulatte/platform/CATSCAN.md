# CATSCAN: World platform

Component: `simulatte.world.platform`
Parent: [World](../CATSCAN.md)
Target: Host profiles and plugins through explicit data, capability, lifecycle, view, and receipt contracts.

## Authority

- Owns platform contracts, loading, plugin hosting, shared clocks, catalogs, storage, transport, and views.
- Does not own experience-specific policy or Create compilation.

## Scope

- Applies to platform code under `public/simulatte/platform/`.

## Inputs

- [plugin platform architecture](../../../docs/simulatte/plugin-platform-architecture.md)
- [platform contracts](contracts/CATSCAN.md)

## Outputs

- [plugin host charter](plugin-host/CATSCAN.md)
- [platform runtime charter](runtime/CATSCAN.md)

## Invariants

- Every plugin contribution crosses a declared port.
- Platform services preserve provenance and deterministic identity.

## Acceptance

- Platform lifecycle and capability tests pass without legacy authority leaks.
- Evidence: [plugin v4 platform tests](../../../tests/plugin-v4-platform.test.cjs).

## Non-goals

- Encoding one experience's rules into shared platform services.

## Freedom

Any mechanism is permitted if it preserves these boundaries and passes the
acceptance evidence.

