# Sun Walker

Owner contract: `public/shared/plugins/sun-walker/index.js`.

## Status

- Status: implemented
- Tier and world: City, `nyc-core-autonomy-v1`
- Plugin ID: `sun-walker`
- Profile ID: `sun-walker-v1`
- Default scenario: `village-union-shade`
- Contract version: plugin v4 contribution
- Last verified source: focused tests plus local desktop and mobile browser audits on 2026-07-28
- Evidence: 15 projected shadow layers, one pedestrian actor, overview at rest, follow while moving, and no POV intent

## What is it?

Sun Walker guides one modeled walker along the shadiest eligible route using arrival-time solar position,
building occlusion, optional historical tree-canopy geometry, and a pinned
historical weather analog. It reports clear-sky building-occlusion guidance and
explicit unknown exposure. It does not measure current shade or thermal comfort.

## What does it actually do?

1. Load candidate City routes, buildings, trees, and the historical weather analog.
2. Sample each route at bounded distance intervals.
3. Compute arrival time and solar position for every sample.
4. Test direct sun, building occlusion, canopy attenuation, night, and unknown conditions.
5. Accumulate travel, direct-sun, shade, unknown, and beam-equivalent quantities.
6. Select a route within absolute and relative detour limits.
7. Compare the selected route with the fastest candidate.

## What can the user control?

| Control | Default | Allowed values | Material effect |
|---|---:|---|---|
| Departure instant | Scenario value | Valid local datetime | Changes solar position at every sample |
| Maximum absolute detour | 600 seconds | 0 to 86,400 | Caps added travel time |
| Maximum relative detour | 0.25 | 0 to 10 | Caps detour as a route-time ratio |
| Direct-sun preference | 100 | 0 to 100 | Changes route-selection objective; the default strongly prioritizes shade |
| Walking speed | 1.4 m/s | Positive configured range | Changes arrival time and sun sampling |
| Historical tree canopy | Enabled | On or off | Includes or removes modeled crown attenuation |
| Historical weather analog | Enabled | On or off | Includes or removes pinned beam attenuation |
| Walk preset | Village to Union Square | Four route scenarios | Changes endpoints, time, and candidate routes |

## What does the user see?

- Initial view: A bird’s-eye frame of the shade-selected route and the projected building-shadow polygons.
- During playback: The camera follows one visible walker while route segments accumulate direct sun, building shade, canopy shade, night, and unknown exposure.
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
- Governing algorithm: Solar-position equations plus geometric occlusion and bounded route scoring.
- Progression: Samples advance in route order using simulated arrival times.
- Randomness: Profile seeds select deterministic routes and departure conditions.
- Invariants: Exposure classes remain exclusive and totals equal simulated travel time.
- Settlement: Every route sample is classified or unknown and both comparison branches close.

## How do comparison and playback work?

- Baseline branch: The fastest candidate route.
- Intervention branch: The highest-ranked route under sun and detour controls.
- Shared inputs: Departure, candidate set, geometry, environmental participation, speed, and evidence hashes.
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

## What is verified?

- Unit tests: passing in `tests/sun-walker-v4.test.cjs`
- Deterministic replay: verified
- Comparison execution: verified
- Desktop browser: overview, follow, shadows, one pedestrian, and controls pass locally
- Mobile browser: overview, shadows, one pedestrian, and immediate control application pass locally
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
