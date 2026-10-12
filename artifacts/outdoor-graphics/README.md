# Outdoor graphics qualification

Owner: World application, Motorcycle Noise, Solar Drive and shared drawing resources.

Changes: a shared atmospheric sky consumes camera, sun direction and declared cloud
cover; Sun Walker uses its accepted solar position, Solar uses its route timestamp
and cloud parameter, and Motorcycle uses its existing authored directional light.
These are simulated conditions, not observed current weather. Solar roofs retain
source elevations; visible walls extend down to the street presentation surface.
Street-level shadow frusta follow the camera scale. Motorcycle actor shadows
are bounded to the nearest 64 actors within 120 m; all traffic remains simulated. Traffic geometry retains source
identities, with detailed wheels, riders and reusable articulated figures.

`report.json` records desktop and touch-emulated mobile street views. The audit
requires ready execution, valid shadows, scene variation in captured pixels, and no
Motorcycle recovery failures. `solar-drive/browser-receipt.json` records the full
Solar controls, comparison, replay and export/reimport check with twelve captures.
Solar receipt paths retain the original temporary capture locations; archived files
have the same names and bytes. Browser execution uses explicitly requested software
WebGPU, not physical-device performance evidence.

Reproduce with `node tools/simulatte/audit-outdoor-graphics.mjs` and
`node tools/simulatte/audit-solar-drive.mjs`. Regression: `node --test
tests/outdoor-rendering.test.cjs`. Fast suite: 204 tests. Focused renderer, Solar,
Sun Walker and Motorcycle suites: 91 tests.
