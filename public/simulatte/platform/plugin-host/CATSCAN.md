# CATSCAN: Plugin host

Parent: [World platform](../CATSCAN.md)
## Target

Instantiate plugins with only declared capabilities, datasets, state, scheduling, and deterministic services.

## Authority

- Owns plugin loading, capability graph, SDK ports, state host, scheduler, and generated registry consumption.
- Does not own plugin business logic or manifest authorship.

## Scope

- Applies to plugin host code under this directory.

## Contracts

- Input: [generated plugin registry](generated-plugin-registry.js)
- Input: [platform contracts](../contracts/CATSCAN.md)
- Input: [profile WorldSpec compiler](../../../shared/contracts/profile-world-spec.js)
- Output: [plugin runtime](plugin-runtime.js)
- Output: [plugin SDK](plugin-sdk.js)

## Invariants

- Missing capabilities fail before plugin work begins.
- Plugin activation and scenario changes resolve through the exact authored profile WorldSpec; runtime receipts expose that artifact and its conformance receipt.
- Cross-plugin and undeclared network, storage, or DOM access stay unavailable.
- Executable plugins require an active repository-bundled trust receipt; same-realm code is never marketplace-eligible.

## Acceptance

- Capability, lifecycle, custody, and registry tests pass.
- Evidence: [plugin platform tests](../../../../tests/plugin-platform.test.cjs).

## Non-goals

- Treating contractual restrictions as process isolation.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.
