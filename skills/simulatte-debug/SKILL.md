---
name: simulatte-debug
description: Reproduce and diagnose a named Simulatte prompt, retrieval, graph, simulation, visual, settlement, browser, model, cache, or deployment failure; repair it only when requested.
---

# Simulatte Debug

Diagnosis is read-only. Patch the first invalid phase owner only when the user's request includes implementation.

Before non-trivial investigation or repair, read
[`docs/simulatte/bug-zapping-guide.md`](../../docs/simulatte/bug-zapping-guide.md).
It governs ownership boundaries, lifecycle invalidation, immutable evidence,
race regressions, and focused validation; this skill governs phase-by-phase
diagnosis.

## Prerequisites

Supply the failing prompt, named phase or visible surface, expected result, build and
model identities, and the available phase artifacts, receipts, browser, or cache state.

## Procedure

1. Capture one failing run and preserve every phase identity.
2. Compare each producer output with the next consumer input using the maps below.
3. Report the earliest mismatch; only if repair is requested, patch that owner and run
   focused phase, pipeline-audit, lifecycle, and browser checks as applicable.

Find the first phase that loses or invents an obligation. A plausible screenshot does
not repair a broken contract, and an object field does not prove a visible result.

## Capture One Failing Run

Record the exact prompt, build, route, device, model/config identity, cache mode,
phase receipts, scene packet, screenshot, console output, and timings. Preserve a cold
and warm distinction when performance or caching is involved.

## Compare Every Boundary

For phases 1 through 8, compare the actual serialized output with the next phase's
declared input. Track the obligation ledger across IDs rather than relying on prose.
Stop at the first missing, changed, duplicated, unsupported, or fabricated field.

Inspect common failure classes separately:

- Retrieval: query/source-span mapping, candidate counts, filters, reranking, cache key.
- Graph: canonical node identity, typed edges, count preservation, constraint results.
- Simulation: construction selection, state transition, bounds, deterministic search.
- Visual compile: geometry/material/pose obligations and resource ownership.
- Render: camera, lifecycle, shader errors, actual pixel visibility, frame cost.
- Settlement: receipt binding, screenshot identity, unsupported and failed obligations.

## Authorized Repair And Proof

When repair is requested, patch the producer at the first invalid boundary and add a fixture that preserves the
failing prompt. Run focused phase tests, pipeline and visual audits, then a real browser
check for pixels or lifecycle. For performance, compare identical work and obligation
coverage; do not count skipped work as a speedup. Report the boundary fix, receipt, and
pixel verdict independently.

## Validation

The original prompt crosses the repaired phase boundary with matching receipts and
the focused phase tests, pipeline audit, and real browser check required by the failure
all pass.

## Stop Conditions

Stop when the failing prompt, phase artifacts, or expected visible result is missing.
Do not skip obligations or phases to obtain a passing or faster result.

## Outputs

A phase-bound diagnosis with matching receipts and pixel evidence where relevant, plus
any authorized repair's focused, audit, lifecycle, and browser results.

## Side Effects

Diagnosis reads artifacts and runs local checks. Authorized repair may edit Simulatte
and create test/build/cache artifacts; deployment and provider use remain separate.
