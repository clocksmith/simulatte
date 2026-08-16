# Orbital Transfer Planner improvement ledger

Owner contract:
[Orbital Transfer Planner current experience](../orbital-transfer-planner.md).

## Current state

| Field | State |
|---|---|
| Strategic role | **Hero Orbital Simulator** (Solar System Tier Hero per [Roadmap](../../prompt-to-world-roadmap.md)) |
| Consistency baseline | 9/10 |
| Interest baseline | 8/10 |
| Runtime status | Implemented |
| Current strength | Causal solver controls, candidate search, selection, propagation, and flight playback execute |
| Primary gap | Search reasoning and mission tradeoffs need more visible, interactive explanation |
| Browser evidence | Prior commit only; current worktree not reviewed in a browser |
| Frontier review | Pending experience-by-experience review |

## Improvement sweeps

| Date | Sweep | Result | Evidence |
|---|---|---|---|
| 2026-07-27 | Shared playback, semantic presentation, camera, and side-metric consistency | Code complete; browser proof pending | Repository tests 740/740, JavaScript shape tests 46/46, plugin and boundary checks passed |
| 2026-08-16 | Hero Orbital Simulator consolidation & landing showcase | Promoted as Solar System hero simulator on landing shell with direct default routing and Lambert solver validation. | `public/index.html`, `public/world-tiers.css`, `public/simulatte/app/world-runtime-script-manifest.js` |

## Frontier improvements

The initial frontier direction is an authentic mission-design loop where users
explore launch windows, time of flight, objective weights, constraints, and
candidate transfers before committing to playback. The experience should make
solver rejection, selection, independent propagation, residuals, and endpoint
divergence visually intelligible without presenting a screening model as
flight-certified navigation.

## Acceptance gates

- [ ] Solver controls change candidate generation or ranking, not labels.
- [ ] Rejected candidates retain inspectable reasons.
- [ ] Selected trajectories pass independent propagation checks.
- [ ] The deep frontier review defines a compelling design loop.
- [ ] Current desktop and mobile browser reviews prove trajectory distinction.

