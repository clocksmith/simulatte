# CATSCAN: Phase 6 Visual

Component: `simulatte.create.phase6-visual`
Parent: [Create compiler pipeline](../CATSCAN.md)
Target: Compile simulation artifacts into a renderable scene program that preserves specific prompt meaning.

## Authority

- Owns VisualIR, render instances, layout, materials, cameras, lights, and scene packets.
- Does not own semantic retrieval or GPU execution.

## Scope

- Applies to Phase 6 visual compilation code.

## Inputs

- [Phase 5 simulation contract](../phase-05-simulation/CATSCAN.md)

## Outputs

- [Phase 7 render contract](../phase-07-render/CATSCAN.md)

## Invariants

- Specific prompt objects do not collapse into generic helpers.
- Support-only geometry stays distinct from visible obligations.

## Acceptance

- Visual fixtures preserve entity identity, relations, layout, and motion intent.
- Evidence: [simulation and visual tests](../../../../tests/physical-compiler-simulation-visual.test.cjs).

## Non-goals

- Reading raw prompt text in the renderer.

## Freedom

Any mechanism is permitted if it preserves these boundaries and passes the
acceptance evidence.

