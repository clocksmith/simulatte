# CATSCAN: Blank core library

Parent: [Shared browser runtime](../CATSCAN.md)

## Target
Supply reusable execution, world contracts, compiler governance, simulation
adapters, and renderer lifecycle without owning a simulation product.

## Authority
- Owns canonical runtime, WorldSpec/authorship, compiler-boundary, data-run,
  renderer-session, and attachment-lifecycle implementations.
- Owns native ESM and generated classic compatibility forms of the same code.
- Does not own pages, model selection, plugin-specific physics, or proof claims.

## Scope
This standalone package, its generated compatibility assets, and its examples.

## Contracts
- Input: explicit [runtime plugins](index.d.ts)
- Input: bounded [compiler phases](compiler.d.ts)
- Input: validated [world programs](world.d.ts)
- Input: injected [renderer adapters](render.d.ts)
- Output: validated artifacts, phase records, trajectories, and lifecycle state through the [public API](README.md)
- Output: generated compatibility projections declared by the [compatibility map](compatibility.json)
- Schema: canonical [WorldSpec](../contracts/world-spec.schema.json)

## Invariants
- Dependencies point inward; canonical factories never import product code.
- Native imports perform no I/O or global registration.
- Compatibility builds are projections, never independent implementations.
- Instances retain independent state; stale work cannot publish.
- Borrowed resources remain host-owned; in-flight leases outlive cancellation.
- Blank retains eight phases; domain products do not have to load that compiler.
- Data simulation retains its explicit constant-velocity scope and unproven claims.
- Plugin execution does not confer isolation, authorization, or scientific truth.

## Acceptance
- Packed imports include complete internal dependencies and schemas.
- Existing compiler, data, and renderer consumers preserve their contracts.
- Independent consumer runs preparation, edits, execution, and replay through package APIs.
- Evidence: [installed package acceptance](../../../tests/blank-core-package.test.cjs),
  [data consumer regression](../../../tests/data-workbench.test.cjs), and
  [renderer lifecycle regression](../../../tests/renderer-session.test.cjs).

## Non-goals
Product navigation, pretrained models, domain catalogs, or automatic plugin installation.

## Freedom
Any implementation is permitted if it exposes only cohesive capability
entrypoints, preserves explicit instance lifecycles, and passes the acceptance
evidence.
