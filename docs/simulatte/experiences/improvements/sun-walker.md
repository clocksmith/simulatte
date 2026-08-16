# Sun Walker improvement ledger

Owner contract: [Sun Walker current experience](../sun-walker.md).

## Current state

| Field | State |
|---|---|
| Strategic role | **Hero City Simulator** (Rank 2 Core Surface per [Roadmap](../../prompt-to-world-roadmap.md)) |
| Consistency baseline | 9/10 code candidate |
| Interest baseline | 9/10 code candidate |
| Runtime status | Implemented; current desktop and mobile browser proof passes |
| Current strength | One moving walker, progressive segment exposure, visible projected shadows, and overview/follow camera targets execute |
| Primary gap | Direct user review of shadow legibility and route choice |
| Browser evidence | Current audits verify 15 projected shadow layers, one pedestrian, overview/follow intent, and immediate controls |
| Frontier review | Authored; visual acceptance pending |

## Improvement sweeps

| Date | Sweep | Result | Evidence |
|---|---|---|---|
| 2026-07-27 | Camera-target audit and shared playback consistency | Follow and POV target the walker; browser proof pending | Repository tests 740/740, JavaScript shape tests 46/46, plugin and boundary checks passed |
| 2026-07-27 | Presentation layer set and visual storytelling rebuild | Follow and POV target the moving actor. Completed samples color walked segments and feed snapshot-bound inspector metrics. | `tests/sun-walker-visual-storytelling.test.cjs`, `tests/sun-walker-v4.test.cjs` |
| 2026-08-16 | Hero City consolidation & spatial corridor sharding roadmap | Authored consolidation plan: decouple from monolithic 53.5MB NYC dataset, stream bounding-box corridors (`nyc-training-corridor-v1.json` at 5.5KB), and adopt binary encoding. | [Strategic & Performance Consolidation Roadmap](../../prompt-to-world-roadmap.md) |

## Frontier improvements

The initial frontier direction is a perceptually convincing walk where sun,
shade, arrival time, geometry, route choice, and cumulative exposure remain
synchronized. Users should feel the difference between faster and cooler
routes through changing shadows, street enclosure, heat burden, and walker
progress, then understand the quantitative tradeoff through matching metrics
and comparison playback.

## Acceptance gates

- [x] Browser overview and Follow remain attached while the actor advances between samples; POV is intentionally unavailable.
- [ ] Decouple world boot from 53.5MB monolithic JSON and stream active corridor geometry dynamically.
- [ ] Walked-segment colors remain legible and agree with the current exposure state.
- [ ] Inspector totals match visible direct, shade, unknown, and night progression.
- [ ] Departure time and detour changes produce recognizable route and exposure changes.
- [ ] Desktop and mobile browser reviews prove the embodied journey without clipping or frame stalls.
- [ ] Projected shadow fills and outlines remain distinct from buildings, parks, and route lines.
- [ ] Direct user review confirms that the display reads as one person seeking shade.
