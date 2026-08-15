# CATSCAN: Plugin host

Component: `simulatte.world.platform.plugin-host`
Parent: [World platform](../CATSCAN.md)
Target: Instantiate plugins with only declared capabilities, datasets, state, scheduling, and deterministic services.

## Authority

- Owns plugin loading, capability graph, SDK ports, state host, scheduler, and generated registry consumption.
- Does not own plugin business logic or manifest authorship.

## Scope

- Applies to plugin host code under this directory.

## Inputs

- [generated plugin registry](generated-plugin-registry.js)
- [platform contracts](../contracts/CATSCAN.md)

## Outputs

- [plugin runtime](plugin-runtime.js)
- [plugin SDK](plugin-sdk.js)

## Invariants

- Missing capabilities fail before plugin work begins.
- Cross-plugin and undeclared network, storage, or DOM access stay unavailable.

## Acceptance

- Capability, lifecycle, custody, and registry tests pass.
- Evidence: [plugin platform tests](../../../../tests/plugin-platform.test.cjs).

## Non-goals

- Treating contractual restrictions as process isolation.

## Freedom

Any mechanism is permitted if it preserves these boundaries and passes the
acceptance evidence.

