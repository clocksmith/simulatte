# CATSCAN: World semantic compositor

Component: `simulatte.world.platform.render`
Parent: [World platform](../CATSCAN.md)
Target: Compose declared plugin and World presentation contributions without obscuring the primary simulation.

## Authority

- Owns semantic composition of platform view contributions.
- Does not own plugin simulation state, camera policy, or low-level renderer semantics.

## Scope

- Applies to platform render composition under this directory.

## Inputs

- [platform view contract](../contracts/tier-presentation.schema.json)

## Outputs

- [semantic compositor](semantic-compositor.js)

## Invariants

- Presentation remains bound to declared contributions.
- Overlays cannot become unreceipted product truth.

## Acceptance

- Composition fixtures preserve view ownership and obstruction limits.
- Evidence: [plugin compositor tests](../../../../tests/plugin-compositor-runtime.test.cjs).

## Non-goals

- Drawing Create scenes or repairing missing plugin evidence.

## Freedom

Any mechanism is permitted if it preserves these boundaries and passes the
acceptance evidence.

