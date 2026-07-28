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

| Experience | Baseline consistency | Baseline interest | Deep frontier review |
|---|---:|---:|---|
| [Cable Trader](cable-trader.md) | 8/10 | 7/10 | Authored |
| [Neighborhood Bulk Pool](neighborhood-bulk-pool.md) | 8/10 | 9/10 | Authored |
| [NYC Development Atlas](nyc-development-atlas.md) | 6/10 code audit | 6/10 code audit | Authored |
| [Sun Walker](sun-walker.md) | 9/10 | 8/10 | Pending |
| [Food Recall](food-recall.md) | 8/10 | 8/10 | Pending |
| [Grid Resilience](grid-resilience.md) | 9/10 | 9/10 | Pending |
| [Maritime Trade](maritime-trade.md) | 8/10 | 9/10 | Pending |
| [Subsea Network](subsea-network.md) | 8/10 | 8/10 | Pending |
| [Orbital Transfer Planner](orbital-transfer-planner.md) | 9/10 | 8/10 | Pending |
| [Asteroid Defense](asteroid-defense.md) | 9/10 | 10/10 | Pending |
| [Interstellar Relay Network](interstellar-relay-network.md) | 8/10 | 9/10 | Pending |

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
