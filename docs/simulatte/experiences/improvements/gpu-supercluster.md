# 256-GPU AI Supercluster improvement ledger

Owner contract:
[256-GPU AI Supercluster current experience](../gpu-supercluster.md).

## Current state

| Field | State |
|---|---|
| Strategic role | **Hero Datacenter Simulator** (Datacenter Tier Hero per [Roadmap](../../prompt-to-world-roadmap.md)) |
| Consistency baseline | 10/10 |
| Interest baseline | 10/10 |
| Runtime status | Implemented |
| Current strength | 3D isometric 42U rack layout, NVLink mesh crossbars, Ring/Tree AllReduce collective solvers, thermodynamic heat exchange ODEs, and straggler fault injection execute |
| Primary gap | Full WebGPU volumetric shader path planned for next major graphics engine pass |
| Browser evidence | Code and unit test verified; interactive 3D Canvas rendering active |
| Frontier review | Completed 10/10 launch review |

## Improvement sweeps

| Date | Sweep | Result | Evidence |
|---|---|---|---|
| 2026-08-17 | Initial 10/10 Hero Datacenter Simulator Launch | Borrowed accelerator concepts from 256one; implemented 3D isometric facility grid, hot/cold aisles, NVLink crossbar + 800G InfiniBand Spine-Leaf network, Ring/Tree AllReduce solvers, thermodynamic ODEs, and live thermal heatmaps. | `public/shared/plugins/gpu-supercluster/`, `public/simulatte/app/tier-renderers.js`, `tests/gpu-supercluster.test.cjs` |

## Frontier improvements

The next frontier is evidence depth, not a larger visual claim. Retain browser execution, exact replay, lifecycle, comparison, and deployment identity for the same governed profile before presenting the experience as release-qualified. Improve the visual projection only when each new rack, link, cooling, or collective signal remains bound to modeled state and an inspectable receipt. Physical cluster measurements, vendor performance, and facility telemetry remain separate external evidence classes.

## Acceptance gates

- [x] 256 GPUs across 32 liquid-cooled racks enumerated in true 3D facility coordinates.
- [x] Ring-AllReduce, Double-Binary Tree, and 2D Torus collective solvers calculate realistic step latencies and MFU.
- [x] Direct-to-chip liquid cooling thermodynamics model coolant delta-T and thermal clock throttling above 80°C.
- [x] Straggler fault injection dynamically degrades synchronous AllReduce barrier times.
- [x] Deterministic simulation receipts and SHA-384 plugin integrity digests verified.
- [ ] Capture the complete desktop browser interaction path with console-clean evidence.
- [ ] Capture the complete mobile browser interaction path with console-clean evidence.
- [ ] Prove exact replay and reload identity for one baseline and one intervention.
- [ ] Bind rendered rack, network, and thermal signals to scene and pixel evidence.
- [ ] Retain deployment identity and human review before any public release promotion.
