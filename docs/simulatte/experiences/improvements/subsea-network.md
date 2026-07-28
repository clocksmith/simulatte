# Subsea Network improvement ledger

Owner contract: [Subsea Network current experience](../subsea-network.md).

## Current state

| Field | State |
|---|---|
| Consistency baseline | 8/10 |
| Interest baseline | 8/10 |
| Runtime status | Implemented |
| Current strength | Traffic allocation, failures, demand loss, repair transit, fairness, and restoration execute |
| Primary gap | Abstract capacity and fairness outcomes need more tangible user consequences |
| Browser evidence | Prior commit only; current worktree not reviewed in a browser |
| Frontier review | Pending experience-by-experience review |

## Improvement sweeps

| Date | Sweep | Result | Evidence |
|---|---|---|---|
| 2026-07-27 | Shared playback, semantic presentation, camera, and side-metric consistency | Code complete; browser proof pending | Repository tests 740/740, JavaScript shape tests 46/46, plugin and boundary checks passed |

## Frontier improvements

The initial frontier direction is a visible communications emergency where
cable cuts, route capacity, regional demand, congestion, repair ships, service
priority, and allocation fairness interact. Users should understand which
traffic is rerouted, degraded, or lost, why the chosen policy favors particular
regions or services, and how restoration changes the network over time.

## Acceptance gates

- [ ] Traffic demand is conserved as served, delayed, degraded, or unserved.
- [ ] Cable capacity and failures constrain every routing policy.
- [ ] Repair travel and restoration produce visible chronological changes.
- [ ] The deep frontier review defines human-scale consequences.
- [ ] Current desktop and mobile browser reviews prove rerouting clarity.

