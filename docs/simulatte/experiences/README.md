# Simulatte experiences

Owner contract: `public/data/application-profiles/profile-claim-inventory-v1.json`.

This directory is the canonical human-readable description of every Simulatte
experience. Each page answers the same questions in the same order. Runtime
profiles, governed data, source code, tests, and evidence receipts remain the
executable sources of truth.

The aspirational consistency and interest work is tracked in
[one improvement ledger per experience](improvements/README.md), so current
state, dated improvement sweeps, and frontier targets remain distinct from
behavior that executes today.

| Experience | Tier | Status | Real data | Simulation | Comparison | Browser proof |
|---|---|---|---|---|---|---|
| [Cable Trader](cable-trader.md) | City | implemented | City routes and cable-family standards context | Reel, project, transfer, disruption, and arrival logistics | Cheapest, fastest, and fairness-first policies | Current browser proof pending |
| [Neighborhood Bulk Pool](neighborhood-bulk-pool.md) | City | implemented | Warehouse identities and addresses | Synthetic pooling, handoffs, costs, and waste | Four pooling policies | Prior commit only |
| [NYC Development Atlas](nyc-development-atlas.md) | City | implemented | NYC neighborhood, sale, DOB, building, and PLUTO records | Historical building stages and conditional price and development ensembles | Business as usual vs selected development policy | Not tested |
| [Sun Walker](sun-walker.md) | City | implemented | NYC geometry, 2015 trees, historical weather analog | Arrival-time solar exposure and occlusion | Fastest vs shade-selected route | Prior commit only |
| [Food Recall](food-recall.md) | Country | implemented | Governed environmental and logistics fields where identified | Synthetic lots, contamination, illness, and recall | Recall intervention vs no recall | Prior commit only |
| [Grid Resilience](grid-resilience.md) | Country | implemented | Historical EIA and NOAA rows | Interface-constrained dispatch and restoration | Economic baseline vs resilience policy | Prior commit only |
| [Maritime Trade](maritime-trade.md) | World | implemented | Governed port identities and calibration artifacts | Routes, queues, cargo, emissions, and disruption | Configured voyage vs undisrupted baseline | Prior commit only |
| [Subsea Network](subsea-network.md) | World | implemented | FCC regulatory cable identities | Traffic allocation, failures, fairness, and repairs | Weighted throughput vs proportional fairness | Prior commit only |
| [Orbital Transfer Planner](orbital-transfer-planner.md) | Solar System | implemented | Pinned ephemeris state vectors | Lambert search and independent propagation | Selected transfer vs Hohmann screen | Prior commit only |
| [Asteroid Defense](asteroid-defense.md) | Solar System | implemented | Pinned JPL catalog and benchmark rows | Synthetic observations, orbit clones, and intervention | No intervention vs selected policy | Prior commit only |
| [Interstellar Relay Network](interstellar-relay-network.md) | Star Chart | implemented | Gaia DR3 astrometry; derived HYG snapshot | Hypothetical terminals, routing, channels, and operations | Direct classical link vs selected route | Prior commit only |
| [Exoplanet Survey](exoplanet-survey.md) | Star Chart | proposed | Proposed Gaia and NASA archive inputs | Proposed blinded injection and recovery | Proposed survey-policy comparison | Not tested |

## Reading status

| Status | Meaning |
|---|---|
| `proposed` | Product and implementation contract only; no registered profile |
| `scaffolding` | Some files exist, but the public execution path is incomplete |
| `implemented` | A registered runtime path executes, but complete evidence is absent |
| `verified` | Focused tests and the declared browser evidence matrix pass |
| `deployed` | Verified behavior was also checked on the hosted production URL |

The existing evidence index is
[`artifacts/profile-evidence/index.json`](../../../artifacts/profile-evidence/index.json).
It binds 94 passing runs to commit `a5713c1c13abacbc626b8e96c95e4c64fc779ca9`
and worktree identity
`facdee0932717326829d2b3704ee5bf44b2192d43d8badcbc9496d60792c2698`.
Those receipts do not verify the current worktree. Current browser and
production deployment checks have not been rerun.

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
