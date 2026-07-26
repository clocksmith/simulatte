# Interstellar Relay Network

Owner contract: `public/shared/plugins/interstellar-relay-network/index.js`.

## Status

- Status: verified
- Tier and world: Star Chart, `gaia-dr3-stellar-neighborhood-v1`
- Plugin ID: `interstellar-relay-network`
- Profile ID: `interstellar-relay-network-v1`
- Default scenario: `sol-proxima-direct`
- Contract version: plugin v4 contribution
- Last verified source: current worktree, focused tests and browser rerun
- Evidence: 8/8 profile runs; canonical prior-version receipts remain in `artifacts/profile-evidence/index.json`

## What is it?

Interstellar Relay Network lets a user send a hypothetical packet between any
selectable visible-star endpoint. It combines six governed Gaia DR3 astrometric
rows with a broader static HYG snapshot, then models routing, propagation,
operations, and advanced-channel constraints. It does not claim that terminals,
traffic, advanced channels, or an operating interstellar network exist.

## What does it actually do?

1. Load Gaia rows, 1,638 HYG visible-star rows, terminals, scenarios, operations, and channels.
2. Merge 1,637 non-Sol HYG endpoints with seven Gaia or origin entries without merging provenance.
3. Search or enforce a direct or multi-hop route under user constraints.
4. Solve moving-target light time and a channel-specific link receipt for each hop.
5. Run a seeded operational ensemble for acquisition, queueing, outages, maintenance, repair, and retries.
6. Advance one representative packet through causal transmission events in true 3D coordinates.
7. Compare against a synchronized direct classical baseline, then settle delivery and receipts.

## What can the user control?

| Control | Default | Allowed values | Material effect |
|---|---:|---|---|
| Endpoints | Scenario preset | 1,644 Gaia or HYG catalog entries | Changes distance, route geometry, provenance, and link states |
| Routing | Automatic, balanced | Direct, automatic, manual; five objectives | Changes candidate search and selected path |
| Relay constraints | Gaia default set | Required and eligible stars, 1 to 8 hops, 0.01 to 250,000 pc | Changes admissible routes and bounded search work |
| Physics lane | Classical optical | Classical, quantum-assisted, wormhole, warp | Changes channel equations and claim boundary |
| Operations | Nominal profile | Profile, 8 to 512 samples, 0 to 20 retries | Changes reliability and latency distribution |
| Packet and timing | Scenario preset | Epoch, 64 B to 1 GiB, processing delay | Changes schedule and latency |
| Terminal and astrometry | Scenario preset | Terminal archetype and target epoch | Changes budget and propagated coordinates |
| Channel parameters | Lane-specific | Memory, fidelity, pair rate, throat, warp, bandwidth, stability | Changes speculative constraint receipts |

## What does the user see?

- Initial view: The 1,638-star HYG backdrop plus active Gaia-default relay candidates in true 3D ICRS Cartesian parsecs.
- During playback: Selected links, route alternatives, packet depth, acquisition, queue, retry, transmit, receive, and delivery events.
- Selection and inspection: Route work, link budget, causality, constructibility, reliability, operational effects, omissions, and coordinates.
- Comparison view: Direct classical baseline and selected intervention use synchronized endpoints, epochs, packet, and operations seed.
- Final settlement: Latency, bottleneck rate, link margin, energy, delivery distribution, retries, failures, and claim boundary.

## What is real, derived, modeled, or simulated?

| Item | Origin | Source | Time status | Uncertainty | Used for |
|---|---|---|---|---|---|
| Stellar astrometry | observed | Six governed Gaia DR3 rows | historical | Catalog errors; covariance incomplete | Star identity and state |
| HYG endpoint coordinates | derived | HYG v4.1 magnitude-five cache | snapshot | Motion, covariance, and raw response hash missing | Broad endpoint choice |
| Propagated star positions | derived | Linear space-motion model | forecast | Missing radial velocity explicit; HYG held static | Geometry |
| Terminals and traffic | scenario | Hardware and network packs | forecast | No observed infrastructure | Link inputs |
| Route candidates | modeled | Bounded graph search | forecast | Activated catalog only | Path selection |
| Classical link budget | modeled | Diffraction and photon equations | forecast | Simplified detector and propagation | Rate and margin |
| Operations ensemble | simulated | Seeded profile model | forecast | Uncalibrated scenario distribution | Reliability |
| Quantum-assisted link | modeled | Declared channel equations | forecast | Hypothetical hardware | Alternative lane |
| Wormhole and warp metrics | scenario | Constraint sandboxes | forecast | Unsupported constructibility | Explicit failure screens |

## How does the simulation work?

- State: Propagated stars, routes, hop budgets, operations samples, packet location, active hop, events, and settlement.
- Governing algorithm: Gaia linear motion, static HYG positions, finite-light-time interception, channel budgets, bounded route search, and operational store-forward.
- Progression: Acquisition, queue, maintenance, repair, retry, transmit, receive, process, and delivery events advance one at a time.
- Randomness: Declared operations seeds reproduce samples and representative event plans.
- Invariants: Classical information never exceeds light speed; endpoint provenance stays source-specific; every hop has one validated budget.
- Settlement: Packet delivery or explicit failure closes route, operations, comparison, omission, and provenance receipts.

## How do comparison and playback work?

- Baseline branch: Direct classical optical link with the baseline terminal.
- Intervention branch: Selected route, operations, terminal, and channel.
- Shared inputs: Endpoints, seed, epoch, packet, astrometry, and operations profile.
- Clock and replay: Single-event step, pause, replay, and reload reconstruct packet state from receipts.
- Invalid comparison: Mismatched endpoints or epochs, missing budgets, causality failure, incompatible metrics, or unsettled packet blocks deltas.

## What can and cannot be claimed?

Can claim:

- Gaia source identity and HYG snapshot limitations remain explicit and source-specific.
- Route search is bounded and inspectable.
- Operational and physical-channel reliability remain separate.
- Speculative lanes expose constructibility and causality constraints.

Cannot claim:

- Interstellar terminals or traffic are observed, or HYG endpoints have Gaia-quality motion.
- Operations probabilities are calibrated service levels.
- Quantum assistance permits faster-than-light information.
- Wormhole or warp scenarios describe constructible systems.

## What is verified?

- Unit tests: passing in `tests/interstellar-relay-network-v4.test.cjs`
- Deterministic replay: verified
- Comparison execution: verified
- Desktop browser: verified
- Mobile browser: verified
- Known unresolved failures: infrastructure, operations calibration, and full covariance are absent

## Where is it implemented?

- [Plugin entry](../../../public/shared/plugins/interstellar-relay-network/index.js)
- [Configuration](../../../public/shared/plugins/interstellar-relay-network/default-config.json)
- [Route search](../../../public/shared/plugins/interstellar-relay-network/network-router.js)
- [Operations model](../../../public/shared/plugins/interstellar-relay-network/operations-model.js)
- [v4 contribution](../../../public/shared/plugins/interstellar-relay-network/v4-contribution.js)
- [Profile](../../../public/data/application-profiles/interstellar-relay-network-v1.json)
- [Focused tests](../../../tests/interstellar-relay-network-v4.test.cjs)
- [Evidence index](../../../artifacts/profile-evidence/index.json)
