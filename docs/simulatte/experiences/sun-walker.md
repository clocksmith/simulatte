# Sun Walker

Owner contract: `public/shared/plugins/sun-walker/index.js`.

## Status

- Status: implemented
- Tier and world: City, `nyc-core-autonomy-v1`
- Plugin ID: `sun-walker`
- Profile ID: `sun-walker-v1`
- Default scenario: `village-union-shade`
- Contract version: plugin v4 contribution
- Verification commands: `node --test tests/sun-walker-routing.test.cjs tests/sun-walker-v4.test.cjs tests/sun-walker-visual-storytelling.test.cjs tests/plugin-camera-follow.test.cjs tests/plugin-actor-motion.test.cjs` and `node tools/simulatte/audit-sun-walker.mjs`
- Browser evidence: `artifacts/sunwalker/20261005-routing-playback/browser.json` binds source hashes, viewport, rendering state, slider comparisons, and screenshots. This is local browser evidence, not field calibration.

## What is it?

Sun Walker guides one modeled walker along the shadiest eligible route using arrival-time solar position,
building occlusion, optional historical tree-canopy geometry, and a pinned
historical weather analog. It reports clear-sky building-occlusion guidance and
explicit unknown exposure. It does not measure current shade or thermal comfort.

## What does it actually do?

1. Find the shortest walking path over eligible graph edges without evaluating shade.
2. Search the graph again for the slider's time/sun-exposure cost, using the shortest-path distances as a lower bound.
3. Compute solar position and building/canopy occlusion at arrival times along each explored path.
4. Retain arrival-time labels at intersections; coalesce competing labels in one-second buckets to bound the search. Refuse explicitly if the search limit is exhausted.
5. Evaluate the selected complete paths with the same exposure equations used during search and playback.
6. Compare added walking time and reduced sun exposure against the fixed shortest baseline. Unknown exposure is conservatively penalized, never counted as free shade.

## What can the user control?

| Control | Default | Allowed values | Material effect |
|---|---:|---|---|
| From (A) / To (B) | Washington Square / Union Square | Distinct mapped landmark places | Recomputes candidate routes and arrival-time exposure |
| Time versus shade | Balanced | Shortest walk to strongest shade preference | Changes graph search, not just which precomputed card is selected |
| Departure instant | Scenario value | Valid local datetime | Changes solar position at every sample |
| Maximum absolute detour (Advanced) | 86,400 seconds | 0 to 86,400 | Optional tighter bound; the former hidden ten-minute cap is removed |
| Maximum relative detour (Advanced) | 100 | 0 to 100 | Optional tighter bound; the former hidden 25% cap is removed |
| Direct-sun cost weight | 1 | 0 to 100 | Slider maps to walking time plus weighted seconds in direct sun; zero selects the shortest baseline |
| Walking speed | 1.4 m/s | Positive configured range | Changes arrival time and sun sampling |
| Historical tree canopy | Enabled | On or off | Includes or removes modeled crown attenuation |
| Historical weather analog | Enabled | On or off | Includes or removes pinned beam attenuation |
| Walk preset | Village to Union Square | Four route scenarios | Changes endpoints, time, and candidate routes |

## What does the user see?

- Initial view: Individual building geometry and surface shadows from the calculated sun position, with editable endpoints and whole-route shade/sun percentages.
- During playback: Whole route, top-down follow, and first-person views share the same modeled walker. Adjacent accepted poses interpolate for display without changing model state. Pause, seek, and replacement use exact accepted positions.
- Route comparison: Shortest walk and Your route report duration and whole-route shade/sun percentages. Unknown exposure and night remain separate. Identical paths explicitly say “Same route at this preference.”
- Selection and inspection: Causal building rows, environmental evidence, sample times, and accumulated quantities.
- Final view: A bird’s-eye route summary keeps the fastest baseline and shade-selected route legible.
- Final settlement: Direct sun, beam-equivalent exposure, building shade, canopy shade, unknown time, and detour.

## What is real, derived, modeled, or simulated?

| Item | Origin | Source | Time status | Uncertainty | Used for |
|---|---|---|---|---|---|
| Street and building geometry | observed | Governed NYC world | snapshot | Missing or uncertain heights retained | Route and occlusion |
| Tree identities | observed | NYC 2015 tree rows | historical | Seasonal canopy state missing | Canopy anchors |
| Crown envelopes | modeled | Species and size assumptions | forecast | Geometric approximation | Canopy attenuation |
| Weather field | observed | Pinned 2024 Central Park row | historical | Analog, not route-time measurement | Optional attenuation |
| Solar position | derived | Timestamp and location equations | forecast | Equation and input limits | Sample illumination |
| Building occlusion | modeled | Ray and geometry test | forecast | Geometry coverage limits | Shade classification |
| Route exposure | simulated | Progressive sample accumulation | forecast | Unknown samples preserved | Selection and comparison |

## How does the simulation work?

- State: Route sample cursor, arrival time, exposure class, causal occluders, and accumulated quantities.
- Governing algorithm: Shortest-path walking baseline, followed by arrival-time graph search with geometric sun exposure and one-second label coalescing. No three-candidate shortlist or forced 25% detour gate precedes the shade search.
- Progression: Samples advance in route order using simulated arrival times.
- Randomness: Profile seeds select deterministic routes and departure conditions.
- Invariants: Exposure classes remain exclusive and totals equal simulated travel time.
- Settlement: Every route sample is classified or unknown and both comparison branches close.

## How do comparison and playback work?

- Baseline branch: The shortest eligible walking path, independent of shade preference.
- Intervention branch: The highest-ranked route under sun and detour controls.
- Shared inputs: Departure, eligible walking graph, geometry, environmental participation, speed, and evidence hashes.
- Clock and replay: Branches use synchronized simulated departure time and deterministic sample order.
- Invalid comparison: Different candidates, environment, departure, or unsettled exposure evidence blocks deltas.

## What can and cannot be claimed?

Can claim:

- Solar position is recomputed at each simulated arrival time.
- Building rows and causative occluders remain inspectable.
- Canopy and weather participation are explicit controls.
- Unknown geometry or exposure remains visible.

Cannot claim:

- The display measures current shade or weather.
- Historical trees prove current canopy shape.
- Output represents thermal comfort or heat illness risk.
- A selected route is universally optimal.
- One-second temporal label coalescing proves continuous-time global optimality.

## What is verified?

- Unit tests: passing in `tests/sun-walker-v4.test.cjs`
- Deterministic replay: verified
- Comparison execution: verified
- Desktop/mobile browser coverage: `audit-sun-walker.mjs` checks shadows, top-down and first-person cameras, both endpoint edits, route switching, pause, invalid endpoint preservation, and horizontal overflow.
- Known unresolved failures: current canopy and route-time weather are not observed

## Where is it implemented?

- [Plugin entry](../../../public/shared/plugins/sun-walker/index.js)
- [Configuration](../../../public/shared/plugins/sun-walker/default-config.json)
- [Route simulation](../../../public/shared/plugins/sun-walker/sun-route-simulation.js)
- [v4 contribution](../../../public/shared/plugins/sun-walker/v4-contribution.js)
- [Profile](../../../public/data/application-profiles/sun-walker-v1.json)
- [Governed environment](../../../public/data/sun-walker/sun-walker-environment-v1.json)
- [Focused tests](../../../tests/sun-walker-v4.test.cjs)
- Evidence output: `artifacts/profile-evidence/index.json`
