# 256-GPU AI Supercluster

Owner contract: `public/shared/plugins/gpu-supercluster/index.js`.

## Status

- Status: implemented
- Tier and world: Datacenter, `datacenter-supercluster-v1`
- Plugin ID: `gpu-supercluster`
- Profile ID: `gpu-supercluster-v1`
- Default scenario: `gpt4-3d-parallelism`
- Contract version: plugin v4 contribution
- Runtime path: native v4 plugin host
- Evidence status: deterministic source and unit contracts only

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
- Comparison view: Baseline and intervention runs expose timing, thermal, network, and utilization differences.

## What is real, derived, modeled, or simulated?

The declared rack count, accelerator count, link classes, control ranges, and scenario identities are governed profile inputs. Topology, collective timing, thermal state, throttling, utilization, and settlement values are deterministic model outputs. The rack drawing and animated network pulses project those outputs. They are not measurements from a deployed cluster, vendor benchmark results, or physical datacenter telemetry.

## How does the simulation work?

- The profile selects one governed scenario, seed, control set, and comparison policy.
- The plugin builds racks, accelerators, cooling loops, and hierarchical network links from the declared topology.
- The collective solver computes communication steps and transfer cost for the selected algorithm and tensor size.
- The thermal model advances coolant and junction temperatures from load, flow, and degradation inputs.
- The runtime applies straggler, packet-drop, and thermal-throttle effects before settling each step.
- The plugin emits state, comparison, settlement, and replay receipts for the declared run.

## How do comparison and playback work?

- A baseline run retains the default controls and seed.
- An intervention changes one or more declared controls while retaining the comparison identity.
- Comparison rows keep step latency, utilization, temperature, cooling, and network effects separate.
- Playback replays the retained state and event sequence without recomputing a different scenario.
- Reload evidence is valid only when profile, plugin, seed, controls, and terminal receipts match.

## What can and cannot be claimed?

- The source can claim deterministic execution of the declared topology and solver contracts.
- Unit evidence can claim the tested collective, thermal, topology, and contribution behavior.
- A run can compare two modeled scenarios under the same profile and seed.
- A receipt can identify the inputs, runtime path, state transitions, and modeled result it records.
- The simulation cannot claim measured H100, NVLink, InfiniBand, facility, or training performance.
- The visualization cannot prove physical rack placement, cooling behavior, or network traffic.
- A successful modeled run cannot establish production safety, capacity, cost, or energy efficiency.
- Public promotion requires separately retained browser, replay, deployment, and human evidence.

## What is verified?

- The profile and plugin manifests resolve through the public registries.
- The plugin integrity digest binds its declared source closure.
- Topology tests cover 32 racks and 256 accelerator identities.
- Solver tests cover collective selection and deterministic timing relationships.
- Thermal tests cover cooling controls and threshold-driven throttling.
- Current checks do not constitute physical browser, GPU, deployment, or human proof.

## Where is it implemented?

- [Application profile](../../../public/data/application-profiles/gpu-supercluster-v1.json)
- [Plugin manifest](../../../public/shared/plugins/gpu-supercluster/plugin.json)
- [Plugin entrypoint](../../../public/shared/plugins/gpu-supercluster/index.js)
- [Topology model](../../../public/shared/plugins/gpu-supercluster/cluster-topology.js)
- [Collective solver](../../../public/shared/plugins/gpu-supercluster/collective-solver.js)
- [Thermal model](../../../public/shared/plugins/gpu-supercluster/thermal-model.js)
- [Runtime contribution](../../../public/shared/plugins/gpu-supercluster/v4-contribution.js)
- [Contract tests](../../../tests/gpu-supercluster.test.cjs)
