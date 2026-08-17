# 256-GPU AI Supercluster

Owner contract: `public/shared/plugins/gpu-supercluster/index.js`.

## Status

- Status: implemented
- Tier and world: Datacenter, `datacenter-supercluster-v1`
- Plugin ID: `gpu-supercluster`
- Profile ID: `gpu-supercluster-v1`
- Default scenario: `gpt4-3d-parallelism`
- Contract version: plugin v4 contribution

## What is it?

256-GPU AI Supercluster simulates distributed transformer training across 32 liquid-cooled 42U server racks. It computes intra-node NVLink crossbars, inter-rack 800G InfiniBand Rail-Optimized Spine-Leaf networks, Ring-AllReduce and Double-Binary Tree gradient collectives, thermodynamics ($Q = \dot{m} C_p \Delta T$), and thermal throttling barriers.

## What does it actually do?

1. Build 3D datacenter facility topology with 32 racks, 256 H100 accelerator dies, and hot/cold aisle containment corridors.
2. Model hierarchical interconnects: intra-node $900\text{ GB/s}$ NVLink and inter-node $800\text{ Gbps}$ InfiniBand.
3. Solve synchronous collective communication transfer times for Ring-AllReduce, Tree-AllReduce, and 2D Torus.
4. Calculate pipeline bubble execution overhead ($F_{\text{bubble}} = \frac{PP-1}{PP+M-1}$) and model FLOPs utilization (MFU).
5. Solve facility thermal dissipation ODEs, coolant flow delta-T, and die junction temperatures.
6. Trigger dynamic clock frequency throttling when die temperatures exceed $80^\circ\text{C}$.
7. Model straggler tail-latency propagation across synchronous AllReduce collective barriers.

## What can the user control?

| Control | Default | Allowed values | Material effect |
|---|---:|---|---|
| Collective Algorithm | Ring-AllReduce | Ring, Double-Binary Tree, 2D Torus | Changes network step latency and communication pattern |
| Tensor Size | 14.2 GB | 0.1 to 1000 GB | Changes gradient bucket payload and transfer duration |
| Straggler Throttle | 0% | 0% to 95% | Throttles single GPU node, visualizing tail-latency barrier drag |
| Coolant Flow | 120 L/min | 10 to 500 L/min | Modulates fluid heat absorption capacity and loop temperatures |
| CDU Degradation | 0% | 0% to 90% | Simulates pump failure, surging temperatures past $80^\circ\text{C}$ throttling |
| Link Packet Drops | 0.0 | 0.0 to 0.5 | Simulates network flakiness and retransmission penalties |

## What does the user see?

- Initial view: 3D isometric datacenter facility with 32 server racks, cold/hot aisles, and CDU cooling units.
- During execution: Glowing die-level thermal heatmaps (cyan $\to$ amber $\to$ magenta), spinning CDU pumps, and pulsing fiber-optic AllReduce waves.
- Selection and inspection: Per-rack power draw, junction temperatures, NVLink bandwidth, and MFU efficiency.
- Final settlement: Total step latency ($ms$), effective cluster TFLOPS, PUE, and immutable simulation receipts.
