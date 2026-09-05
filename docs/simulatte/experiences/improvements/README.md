# Simulatte experience improvement ledgers

Owner contracts: `public/shared/plugins/`,
`public/data/application-profiles/`, and the canonical experience pages in the
parent directory.

These files separate three kinds of information:

1. Current state records the reviewed implementation and evidence boundary.
2. Improvement sweeps record dated changes and their verification.
3. Frontier improvements define the next standard required for a combined
   10/10 consistency and interest score.

Frontier descriptions are targets, not implementation claims. The canonical
experience pages remain the source for behavior that executes today.
Active direction is the data-first workbench in [GOALS.md](../../../../GOALS.md).
Prompting is optional, and existing domain profiles remain available. The
[former consolidation roadmap](../../prompt-to-world-roadmap.md) and the roles
and scores below retain earlier review context; they do not authorize archival
or establish current-build qualification.

| Experience | Historical proposed role | Baseline consistency | Baseline interest | Deep frontier review |
| --- | --- | --- | --- | --- |
| [256-GPU AI Supercluster](gpu-supercluster.md) | **Hero Datacenter Simulator** | 10/10 | 10/10 | Authored / Active |
| [Sun Walker](sun-walker.md) | **Hero City Simulator** | 9/10 | 8/10 | Authored / Active |
| [Maritime Trade](maritime-trade.md) | **Hero Planetary Simulator** | 8/10 | 9/10 | Authored / Active |
| [Orbital Transfer Planner](orbital-transfer-planner.md) | **Hero Orbital Simulator** | 9/10 | 8/10 | Authored / Active |
| [Interstellar Relay Network](interstellar-relay-network.md) | **Hero Interstellar Simulator** | 10/10 | 10/10 | Authored / Active |
| [NYC Development Atlas](nyc-development-atlas.md) | Secondary City Pack | 6/10 code audit | 6/10 code audit | Authored |
| [Asteroid Defense](asteroid-defense.md) | Solar Conformance Pack | 9/10 | 10/10 | Pending |
| [Subsea Network](subsea-network.md) | World Conformance Pack | 8/10 | 8/10 | Pending |
| [Cable Trader](cable-trader.md) | *Archival Candidate* | 8/10 | 7/10 | Authored |
| [Neighborhood Bulk Pool](neighborhood-bulk-pool.md) | *Archival Candidate* | 8/10 | 9/10 | Authored |
| [Food Recall](food-recall.md) | *Archival Candidate* | 8/10 | 8/10 | Pending |
| [Grid Resilience](grid-resilience.md) | *Archival Candidate* | 9/10 | 9/10 | Pending |

## Shared 10/10 release gate

- [ ] Every visible control changes model input, policy, or playback state.
- [ ] Animation, side metrics, comparison branches, and settlement describe the
      same deterministic run.
- [ ] Overview, Follow, POV, Top, Free, and Compare behave consistently when
      supported and remain disabled when unavailable.
- [ ] Domain entities, movement, constraints, and consequences are recognizable
      in rendered pixels.
- [ ] Desktop and mobile browser reviews bind current screenshots to build and
      run receipts.
- [ ] A new user can explain the decision, causal outcome, and comparison
      without reading implementation documentation.
