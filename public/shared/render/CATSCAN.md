# CATSCAN: Shared drawing resources

Parent: [Shared browser runtime](../CATSCAN.md)
## Target

Share drawing resources and explicit scene presentation across workbench consumers.

## Authority

- Owns bounded attachment allocation, compatible reuse, and disposal.
- Owns the shared renderer session lifecycle, explicit capability checks, and stale asynchronous output rejection.
- Owns bounded immutable triangle meshes and material declarations consumed by renderer adapters.
- Owns the data-point scene view, aspect-preserving projection, picking, and resize lifecycle.
- Does not own provider selection, scene compilation, cameras, or proof settlement.

## Scope

- `public/shared/render/`.

## Contracts

- Input: explicit device, size, formats, sample count, and usage under the [drawing contract](../../blank/pipeline/phase-07-render/CATSCAN.md).
- Output: [render targets](render-targets.js).
- Output: [renderer sessions](renderer-session.js) and [mesh library](mesh-library.js).
- Output: [point scene view](point-scene-view.js), explicitly using Canvas 2D rather than claiming WebGPU execution.

## Invariants

- Reuse requires the same device and attachment descriptor.
- Allocation failure preserves the previous usable targets and frees partial allocations.
- Disposal is idempotent.
- Adapters preserve their native input schemas and proof receipts. A common method name never converts submitted work into completed GPU or semantic proof.
- Unsupported operations reject explicitly; shared sessions never select a fallback backend.

## Acceptance

- Evidence: [shared drawing resource tests](../../../tests/render-targets.test.cjs).
- Evidence: [renderer lifecycle tests](../../../tests/renderer-session.test.cjs) and [mesh extension tests](../../../tests/render-mesh-library.test.cjs).

## Non-goals

- One universal drawing implementation, shared application state, or a replacement for compiler phase contracts.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.
