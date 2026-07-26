# Simulatte experiences

Owner contract: `public/data/application-profiles/profile-claim-inventory-v1.json`.

This directory is the canonical human-readable description of every Simulatte
experience. Each page answers the same questions in the same order. Runtime
profiles, governed data, source code, tests, and evidence receipts remain the
executable sources of truth.

| Experience | Tier | Status | Real data | Simulation | Comparison | Browser proof |
|---|---|---|---|---|---|---|
| [Cable Trader](cable-trader.md) | City | verified | Connector standards context | Synthetic cable demand and redistribution | Optimized redistribution vs local inventory | 8/8 |
| [Neighborhood Bulk Pool](neighborhood-bulk-pool.md) | City | verified | Warehouse identities and addresses | Synthetic pooling, handoffs, costs, and waste | Four pooling policies | 8/8 |
| [Safety Explorer](safety-explorer.md) | City | verified | NYC reported collision rows | Fixed sparse-count shrinkage over route evidence | Baseline K vs sensitivity K | 8/8 |
| [Sun Walker](sun-walker.md) | City | verified | NYC geometry, 2015 trees, historical weather analog | Arrival-time solar exposure and occlusion | Fastest vs shade-selected route | 8/8 |
| [Food Recall](food-recall.md) | Country | verified | Governed environmental and logistics fields where identified | Synthetic lots, contamination, illness, and recall | Recall intervention vs no recall | 8/8 |
| [Grid Resilience](grid-resilience.md) | Country | verified | Historical EIA and NOAA rows | Interface-constrained dispatch and restoration | Economic baseline vs resilience policy | 10/10 |
| [Maritime Trade](maritime-trade.md) | World | verified | Governed port identities and calibration artifacts | Routes, queues, cargo, emissions, and disruption | Configured voyage vs undisrupted baseline | 10/10 |
| [Subsea Network](subsea-network.md) | World | verified | FCC regulatory cable identities | Traffic allocation, failures, fairness, and repairs | Weighted throughput vs proportional fairness | 8/8 |
| [Orbital Transfer Planner](orbital-transfer-planner.md) | Solar System | verified | Pinned ephemeris state vectors | Lambert search and independent propagation | Selected transfer vs Hohmann screen | 8/8 |
| [Asteroid Defense](asteroid-defense.md) | Solar System | verified | Pinned JPL benchmark identity only | Synthetic observations, orbit clones, and intervention | No intervention vs selected policy | 10/10 |
| [Interstellar Relay Network](interstellar-relay-network.md) | Star Chart | verified | Gaia DR3 astrometry; derived HYG snapshot | Hypothetical terminals, routing, channels, and operations | Direct classical link vs selected route | 8/8 |
| [Exoplanet Survey](exoplanet-survey.md) | Star Chart | proposed | Proposed Gaia and NASA archive inputs | Proposed blinded injection and recovery | Proposed survey-policy comparison | Not tested |

## Reading status

| Status | Meaning |
|---|---|
| `proposed` | Product and implementation contract only; no registered profile |
| `scaffolding` | Some files exist, but the public execution path is incomplete |
| `implemented` | A registered runtime path executes, but complete evidence is absent |
| `verified` | Focused tests and the declared browser evidence matrix pass |
| `deployed` | Verified behavior was also checked on the hosted production URL |

The current evidence index is
[`artifacts/profile-evidence/index.json`](../../../artifacts/profile-evidence/index.json).
It binds 94 passing runs to commit `a5713c1c13abacbc626b8e96c95e4c64fc779ca9`
and worktree identity
`facdee0932717326829d2b3704ee5bf44b2192d43d8badcbc9496d60792c2698`.
This page does not claim a production deployment check.

## Truth vocabulary

| Origin | Meaning |
|---|---|
| `observed` | A governed source row records an external observation or official identity |
| `derived` | A deterministic transformation combines parent evidence |
| `modeled` | An equation or algorithm estimates behavior from declared assumptions |
| `simulated` | A run produces state or events from models, scenarios, and seeds |
| `scenario` | An authored input, policy, failure, asset, or hypothetical condition |

Origin, temporal status, and uncertainty are independent. A derived value can
use observed parents and still have missing uncertainty. Mixed observed and
scenario inputs never silently inherit the `observed` label.
