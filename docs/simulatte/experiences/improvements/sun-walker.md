# Sun Walker improvement ledger

Owner contract: [Sun Walker current experience](../sun-walker.md).

## Current state

| Field | State |
|---|---|
| Consistency baseline | 9/10 code candidate |
| Interest baseline | 9/10 code candidate |
| Runtime status | Implemented, browser review pending |
| Current strength | A moving walker actor, progressive segment exposure, camera Follow and POV targets, and snapshot-bound exposure metrics execute |
| Primary gap | Desktop and mobile browser proof for camera attachment, exposure color legibility, HUD agreement, and frame pacing |
| Browser evidence | Not run for the current worktree |
| Frontier review | Authored; visual acceptance pending |

## Improvement sweeps

| Date | Sweep | Result | Evidence |
|---|---|---|---|
| 2026-07-27 | Camera-target audit and shared playback consistency | Follow and POV target the walker; browser proof pending | Repository tests 740/740, JavaScript shape tests 46/46, plugin and boundary checks passed |
| 2026-07-27 | Presentation layer set and visual storytelling rebuild | Follow and POV target the moving actor. Completed samples color walked segments and feed snapshot-bound inspector metrics. | `tests/sun-walker-visual-storytelling.test.cjs`, `tests/sun-walker-v4.test.cjs` |

## Frontier improvements

The initial frontier direction is a perceptually convincing walk where sun,
shade, arrival time, geometry, route choice, and cumulative exposure remain
synchronized. Users should feel the difference between faster and cooler
routes through changing shadows, street enclosure, heat burden, and walker
progress, then understand the quantitative tradeoff through matching metrics
and comparison playback.

## Acceptance gates

- [ ] Browser Follow and POV remain attached while the actor advances between samples.
- [ ] Walked-segment colors remain legible and agree with the current exposure state.
- [ ] Inspector totals match visible direct, shade, unknown, and night progression.
- [ ] Departure time and detour changes produce recognizable route and exposure changes.
- [ ] Desktop and mobile browser reviews prove the embodied journey without clipping or frame stalls.
