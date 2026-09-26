# Tensor placement repair

Component: GPU Supercluster collective solver and workload.
Intent: preserved.
Acceptance evidence: [130 passing tests](tests.tap), [browser audit](gpu/browser.json), and [source-bound validation](validation.json).
Boundary effects: plugin-private collective plan v2 retains immutable rank groups; workload v3 reports tensor/data communication phase. Native contribution and host replay consume the calculated transfers through existing ports.

## Reproduced failure

The solver routed data-parallel traffic but priced tensor-parallel traffic using a scalar NVLink bandwidth, regardless of physical placement. A four-rank, 1,000-byte, 8-Gbit/s ring returned 0.000003333 ms instead of the independently calculated 0.0015 ms: six rounds of 250 bytes per directed link. Disconnected tensor ranks also passed when data groups were singletons. Playback published no tensor transfer links. [Failing regressions](before.tap) retain all three failures.

## Repair and evidence

Both rank families now use the existing physical routing and capacity solver. Rank placement remains [data][pipeline][tensor]. Tensor traffic retains its declared ring algorithm and payload; the selected algorithm governs data traffic. Tensor and data phases execute sequentially, preserving the existing modeled schedule. Playback derives phase durations and active links directly from both plans.

Independent cases verify capacity halving, explicit link latency, disconnection, and placement. Moving two-rank partners from adjacent to opposite ring positions changes tensor duration from 0.0005 to 0.001 ms without changing payload or bandwidth. A cross-node tensor group produces native actors on exactly its executed rail links.

The local browser audit passed 12 checkpoints covering portrait/landscape/desktop framing, selection, straggler introduction and removal, synchronization waits, camera preservation, completion, and exact replay. All 32 racks remain framed. [Portrait screenshot](gpu/resize-390.png) was inspected. Chrome used SwiftShader WebGL; this is browser evidence, not physical GPU qualification.

`npm run catscan:check`, `npm run plugins:check`, `npm run check:source-size`, and `git diff --check` passed. Source-size warnings in existing files remain below the hard limit. Plugin integrity, model hashes, and registry were regenerated through `npm run plugins:sync`.

## Accuracy boundary

The transport remains a conservative synchronous store-and-forward model with per-link capacities and expected retry bytes. It does not model measured NCCL scheduling, aggregate endpoint injection limits, compute/communication overlap, or pipeline-stage activation traffic. No empirical calibration or prediction interval is claimed. This repair removes the tensor placement shortcut within the declared model; it does not qualify end-to-end training performance.
