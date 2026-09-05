# CATSCAN: Shared drawing resources

Parent: [Shared browser runtime](../CATSCAN.md)
## Target

Share drawing resources and explicit scene presentation across workbench consumers.

## Authority

- Owns bounded attachment allocation, compatible reuse, and disposal.
- Owns the data-point scene view, aspect-preserving projection, picking, and resize lifecycle.
- Does not own provider selection, scene compilation, cameras, or proof settlement.

## Scope

- `public/shared/render/`.

## Contracts

- Input: explicit device, size, formats, sample count, and usage under the [drawing contract](../../blank/pipeline/phase-07-render/CATSCAN.md).
- Output: [render targets](render-targets.js).
- Output: [point scene view](point-scene-view.js), explicitly using Canvas 2D rather than claiming WebGPU execution.

## Invariants

- Reuse requires the same device and attachment descriptor.
- Allocation failure preserves the previous usable targets and frees partial allocations.
- Disposal is idempotent.

## Acceptance

- Evidence: [shared drawing resource tests](../../../tests/render-targets.test.cjs).

## Non-goals

- A universal renderer or shared application state.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.
