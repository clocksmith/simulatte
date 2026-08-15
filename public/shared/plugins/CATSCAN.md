# CATSCAN: Experience plugins

Parent: [Shared browser runtime](../CATSCAN.md)
## Target

Contribute governed experience behavior through versioned manifests and capability-limited ports.

## Authority

- Owns plugin source, declared resources, datasets, controls, contributions, and lifecycle hooks.
- Does not own host capabilities, cross-plugin access, or profile activation.

## Scope

- Applies to connected and explicitly disconnected plugins under this directory.

## Contracts

- Input: [plugin v4 contract](../../../docs/simulatte/plugin-v4-contract.md)
- Output: [example plugin manifest](cable-trader/plugin.json)

## Invariants

- Plugins receive only declared capabilities and datasets.
- One plugin cannot access another through supported APIs.

## Acceptance

- Manifests, integrity, lifecycle, and capability boundaries pass together.
- Evidence: [plugin platform tests](../../../tests/plugin-platform.test.cjs).

## Non-goals

- Treating manifest permissions as a JavaScript security isolate.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.

