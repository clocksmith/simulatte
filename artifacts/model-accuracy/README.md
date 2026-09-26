# Model accuracy and opening experience

Working-tree implementation over `26319c21b`, after scoped `rdpull` reported already current. These are local results, not a deployed release. Browser reports include HEAD, timestamps, and hashes of modified public sources. The later orbital capture supersedes the orbital rows in the full catalog capture.

[Validation index](validation.json) records the exact test command, artifact hashes, and successful source-hash checks for each exercised component.

## Implemented behavior

- GPU data-parallel collectives route through declared physical links. Ring reduction, complementary binary trees, and two-dimensional torus forwarding have explicit byte and dependency schedules. Concurrent transfers share each directed link's capacity. Nodes within the same rack have gateway links too. This is a conservative synchronous store-and-forward model, not calibrated NCCL throughput. Tensor-parallel transfer time remains an analytical aggregate estimate.
- GPU workload integration stops at completion and intervention events, retaining fractional work. Sampling resolution cannot discard work or move an intervention. The 400 observation steps are sized from eight predicted iteration durations, allowing a straggler introduced during communication to affect subsequent computation. A configured node resolves to its actual rack.
- Rack drawing, selection, and physics use the same contribution coordinates and identities. Removed the independent facility backdrop, invented transfer pulses, and unused GPU presentation implementation. Transfer markers follow model progress; they no longer obscure racks. Scenario configuration now resides inside Advanced across the catalog. Fresh city profiles start their existing playback controller automatically; stored sessions and explicit paused entry remain respected.
- Motorcycle live estimates sum coherent path pressures within each source, then combine independent sources as energy. Harmonic frequencies remain unrounded. The detailed solver uses a stable emission sample grid and exposes geometry-step resolution for convergence checks.
- Building and street-edge identities remain stable. Six buildings with missing heights retain visible outlines and coverage records instead of fabricated acoustic barriers. Illustrative vegetation remains outside acoustic geometry.
- Worker measurements bind scenario, request, sampled time, configuration, and observer identity. Tracked microphones and maps can accept their own earlier sample while moving; changed subjects, zoom, manual viewpoints, or configuration invalidate incompatible responses. Frame CPU, worker computation, delivery latency, and ambient heap are recorded separately.
- Motorcycle opens following nearby traffic. Street ribbons have one face set with consistent upward normals, removing bright intersection triangles. Lighting and park boundaries are less saturated.
- Orbital interpolation now constrains a cubic using both endpoint positions and velocities. Propagation and both presentation adapters use the same implementation. Model provenance includes the interpolation source hash; `plugins:sync` and `plugins:check` maintain and verify model hashes.

## Accuracy evidence

[Reference results](references.json) contain 31 evaluation cases with source hashes. Calibration is explicitly empty: no parameters were fitted to these evaluation cases and no empirical prediction interval is claimed.

| Reference | Result |
| --- | --- |
| Four-rank ring at three capacities | Exact analytical byte/time agreement; capacity halving doubles serialization time |
| Water-loop heat balance at three flows | Maximum discrepancy 0.0044 K, within output rounding |
| 365-day inventory ledger reconstructed from individual exchanges | Zero-item discrepancy at every recorded hub/cable snapshot |
| Circular Kepler orbit, 16 / 32 / 64 RK4 steps | Endpoint errors 0.01110 / 0.0004525 / 0.00002085 AU |
| Stationary acoustics, three distances with and without a wall | Maximum live-versus-waveform discrepancy 0.0085 dB in the six reported cases |
| Moving acoustics, 3 / 9 / 18 m/s with and without a wall | Absolute discrepancy 0.027–0.168 dB over matched one-second energy windows |
| JPL Earth reference, finite body mass, 1 / 0.5 / 0.25-day steps | 30-day endpoint errors 6.63 / 1.18 / 0.85 km |

The planetary fixture uses the published `GM_sun + GM_earth` central parameter and includes lunar perturbations. The spacecraft verifier remains massless. Its Earth comparison retains approximately 62 km of discrepancy; omitting lunar perturbations retains approximately 27,140 km. Smaller integration steps cannot repair an omitted force. [Before-interpolation results](references-before-hermite.json) retain the earlier approximately 385 km massless comparison. These differing force models must not be combined into a single accuracy claim.

Independent tests also check image-source reflection geometry and travel time, moving-source geometry-timestep refinement, exact interpolation of a known cubic trajectory and derivative, and a causal controller learning from independently constructed delayed broadband signals. No opposing pressure is supplied to the learned-controller test. Cross-model acoustic agreement does not establish measured street-noise accuracy. JPL comparisons use a pinned published ephemeris, not newly measured trajectories; see the [Horizons reference](https://ssd.jpl.nasa.gov/horizons/manual.html).

## Validation

- [240/240 focused tests](tests.tap), covering models, controllers, navigation, rendering adapters, playback, worker identities, manifests, and hosting surfaces.
- [24 catalog browser cases](catalog/browser.json): 12 profiles at 1440×1000 and 390×844, automatic activity, Advanced closed, scenario hidden inside Advanced, pause/resume, and camera reset preserving paused progress.
- [Final orbital captures](catalog-orbital-transfer-planner-v1/browser.json) exercise the changed interpolation and presentation implementation at both sizes.
- [GPU browser evidence](gpu/browser.json): selecting a rack, introducing a straggler, observing dependent rack waits, removing it, resize/orientation framing, preserving manual camera movement, completion, and exact workload replay.
- [Motorcycle startup](motorcycle/motorcycle-browser.json): autonomous movement, paused camera changes, moving microphone updates, and treatment changes on desktop/mobile.
- [Recovery injections](motorcycle-failures/browser.json): first-frame failure, later failure, bounded failed recovery, frozen state, explicit retry, and bounded worker counts.
- [Snapshot analysis](motorcycle-analysis/browser.json): cancellation terminates the worker without results; completion contains measured spectral bins; export/reimport after moving the camera reproduces the same readings and spectrum.
- CATSCAN, plugin integrity/boundaries, source-size, World entrypoint, and whitespace checks pass. Source-size retains 55 warnings below the 999-line maximum.

Examples: [GPU portrait](gpu/portrait.png), [Motorcycle portrait](motorcycle/motorcycle-390-initial.png), [Motorcycle onboard](motorcycle/motorcycle-390-onboard.png).

Local headless WebGL startup samples recorded median main-thread frame-call costs of 70.9 ms desktop and 61.4 ms mobile. Observer worker computations ranged from 61–284 ms; delivery latency ranged from 867–2579 ms. Ambient heap samples ranged from 151–283 MiB. These include startup and concurrent audit load; they are not isolated device benchmarks, GPU completion timings, or retained-memory leak measurements. Physical-device performance, measured acoustic/GPU calibration, and newcomer comprehension remain unqualified.

## Reproduce

```bash
node tools/simulatte/verify-model-references.mjs
node tools/simulatte/audit-opening-catalog.mjs
node tools/simulatte/audit-opening-catalog.mjs --profile orbital-transfer-planner-v1
SIMULATTE_EVIDENCE_DIR=artifacts/model-accuracy node tools/simulatte/audit-runtime-gpu.mjs
SIMULATTE_EVIDENCE_DIR=artifacts/model-accuracy node tools/simulatte/audit-runtime-motorcycle-start.mjs
SIMULATTE_EVIDENCE_DIR=artifacts/model-accuracy node tools/simulatte/audit-runtime-motorcycle-failures.mjs
SIMULATTE_EVIDENCE_DIR=artifacts/model-accuracy node tools/simulatte/audit-runtime-motorcycle-analysis.mjs
npm run catscan:check
npm run plugins:check
npm run check:source-size
npm run check:world-entrypoint
```

Earlier failing acoustic/collective cases are retained under [rejected](rejected/). GPU reports retain the [short-session failure](gpu/rejected-short-session.json) and [layout-assertion failure](gpu/rejected-layout-assertion.json). The latter incorrectly treated responsive layout insets as manual camera state; the assertion now checks camera position, zoom, and rotation.

Component: Motorcycle Noise, GPU Supercluster, Orbital Transfer Planner, World application, and evidence tools.
Intent: deliberately strengthened accuracy/evaluation goals; existing component ownership preserved.
Acceptance evidence: commands and artifacts above.
Boundary effects: World consumes model-owned geometry; shared ephemeris implementation now serves propagation and presentation. No deployment or hardware actuation.
