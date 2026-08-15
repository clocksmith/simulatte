# CATSCAN: Phase 7 Render

Parent: [Create compiler pipeline](../CATSCAN.md)
## Target

Execute the compiled scene packet and emit pixels plus identity, frame, and timing receipts.

## Authority

- Owns GPU resources, shader execution, frame state, readback, and render receipts.
- Does not own semantic authority, retrieval, inference, or scene selection.

## Scope

- Applies to Phase 7 render execution code.

## Contracts

- Input: [Phase 6 visual contract](../phase-06-visual/CATSCAN.md)
- Output: [Phase 8 scene proof contract](../phase-08-scene-proof/CATSCAN.md)

## Invariants

- WGSL consumes resolved data and makes no policy decisions.
- Renderer branches follow compiled scene data, not prompt keywords.

## Acceptance

- Pixel readback binds the executed packet, device, and frame result.
- Evidence: [pixel readback tests](../../../../tests/phase7-pixel-readback.test.cjs).

## Non-goals

- Repairing missing semantic content during drawing.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.

