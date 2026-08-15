# CATSCAN: World platform contracts

Component: `simulatte.world.platform.contracts`
Parent: [World platform](../CATSCAN.md)
Target: Define the versioned profile, plugin, presentation, and platform wire boundaries.

## Authority

- Owns platform schemas, adapters, schema registry, and contract validation.
- Does not own plugin execution, scheduling, or application presentation.

## Scope

- Applies to contract code under `public/simulatte/platform/contracts/`.

## Inputs

- [plugin v4 specification](../../../../docs/simulatte/plugin-v4-contract.md)

## Outputs

- [plugin manifest schema](plugin-manifest.schema.json)
- [plugin contracts](plugin-v4-contracts.js)

## Invariants

- Adapters cannot silently broaden authority.
- Unknown contract versions fail explicitly.

## Acceptance

- V4 fixtures satisfy exact schemas and reject legacy-only behavior.
- Evidence: [plugin v4 platform tests](../../../../tests/plugin-v4-platform.test.cjs).

## Non-goals

- Executing plugins or choosing host policy.

## Freedom

Any mechanism is permitted if it preserves these boundaries and passes the
acceptance evidence.

