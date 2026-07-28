# Food Recall improvement ledger

Owner contract: [Food Recall current experience](../food-recall.md).

## Current state

| Field | State |
|---|---|
| Consistency baseline | 8/10 |
| Interest baseline | 8/10 |
| Runtime status | Implemented |
| Current strength | Traceable lots, shipment progression, refrigeration failures, illness, and recall execute |
| Primary gap | Custody causality and intervention timing need a more legible narrative |
| Browser evidence | Prior commit only; current worktree not reviewed in a browser |
| Frontier review | Pending experience-by-experience review |

## Improvement sweeps

| Date | Sweep | Result | Evidence |
|---|---|---|---|
| 2026-07-27 | Shared playback, semantic presentation, and side-metric consistency | Code complete; browser proof pending | Repository tests 740/740, JavaScript shape tests 46/46, plugin and boundary checks passed |

## Frontier improvements

The initial frontier direction is an outbreak investigation where every lot
retains causal custody from production through shipment, sale, illness, recall,
and disposal. The user should detect signals, choose recall scope and timing,
watch preventable exposures diverge from the baseline, and understand both the
human cost of delay and the economic cost of overly broad action.

## Acceptance gates

- [ ] Lot identity, quantity, custody, temperature, and disposition are conserved.
- [ ] Recall controls change future exposure without rewriting prior events.
- [ ] Baseline and intervention share hidden contamination truth.
- [ ] The deep frontier review defines investigation and policy tension.
- [ ] Current desktop and mobile browser reviews prove causal legibility.

