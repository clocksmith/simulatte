# CATSCAN: Plugin tooling

Component: `simulatte.tools.plugins`
Parent: [Repository tools](../CATSCAN.md)
Target: Validate plugin integrity and generate the connected runtime registry from declared manifests.

## Authority

- Owns plugin boundary checks, integrity synchronization, and registry generation.
- Does not own plugin behavior, profile activation, or host runtime policy.

## Scope

- Applies to plugin tools under `tools/plugins/`.

## Inputs

- [plugin source charter](../../public/shared/plugins/CATSCAN.md)

## Outputs

- [generated plugin registry](../../public/simulatte/platform/plugin-host/generated-plugin-registry.js)

## Invariants

- Registry order and integrity are deterministic.
- Disconnected plugins cannot enter through stale generated state.

## Acceptance

- Plugin checks reproduce the committed registry and hashes.
- Evidence: [plugin platform tests](../../tests/plugin-platform.test.cjs).

## Non-goals

- Approving an experience claim from manifest validity alone.

## Freedom

Any mechanism is permitted if it preserves these boundaries and passes the
acceptance evidence.

