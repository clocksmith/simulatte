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
- Output: [renderer session adapter](simulatte-webgpu-renderer.js) and [GPU lifetime](simulatte-webgpu-renderer-lifecycle.js).

## Invariants

- WGSL consumes resolved data and makes no policy decisions.
- Renderer branches follow compiled scene data, not prompt keywords.
- Bound semantic receipts pass through unchanged and never grant Phase 7 semantic authority.
- Interaction receipts preserve the Phase 5 program hash, command transitions, changed channels, and visible-state consumption.
- Published frame evidence is immutable. Delayed readback uses submitted state and viewport; replacement inputs, interaction revisions, and resizing invalidate old pixels.
- Managed rendering consumes a declared snapshot, frame, and viewport. WorldSpec evidence binds that snapshot to the exact Phase 6 artifact; it supplies no prompt or semantic authority.
- Cancellation clears publication immediately and retains resource ownership until submitted work settles. Phase 8 remains a separate consumer.
- Disposal, failed initialization, and late device acquisition release owned resources and cannot restore readiness or publish stale proof.

## Acceptance

- Part ownership rejects detached, missing, or wrongly owned geometry. Directed motion needs both participants' execution and pixels. Color readback covers every bound drawable.
- Evidence: [pixel and corruption regressions](../../../../tests/phase7-pixel-readback.test.cjs).
- Readback binds packet, device, and frame.
- Evidence: [frame evidence regressions](../../../../tests/renderer-frame-evidence.test.cjs).
- Evidence: [managed rendering regressions](../../../../tests/managed-render-phase.test.cjs).

## Non-goals

- Repairing missing semantic content during drawing.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.
