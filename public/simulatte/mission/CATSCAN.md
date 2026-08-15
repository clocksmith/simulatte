# CATSCAN: Mission compilation

Parent: [World](../CATSCAN.md)
## Target

Compile a governed mission into typed capabilities and executable planning inputs.

## Authority

- Owns mission validation, capability matching, and mission compilation.
- Does not own route selection, simulation settlement, or rendering.

## Scope

- Applies to mission code under `public/simulatte/mission/`.

## Contracts

- Input: [mission schema](../../shared/contracts/mission.schema.json)
- Output: [mission compiler](mission-compiler.js)
- Output: [capability matrix](capability-matrix.js)

## Invariants

- Unsupported requirements stay explicit.
- Compilation cannot grant capabilities absent from the selected profile.

## Acceptance

- Mission fixtures compile deterministically or refuse with a contract error.
- Evidence: [autonomy tests](../../../tests/autonomy.test.cjs).

## Non-goals

- Choosing a successful action without downstream planning and safety proof.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.

