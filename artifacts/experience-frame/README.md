# World experience frame evidence

Run `node tools/simulatte/audit-experience-frame.mjs` from the repository root.
`report.json` binds the public sources, catalog routes, viewport dimensions,
measured canvas and toolbar bounds, camera availability, reset behavior,
field comparison branch switches, and document scrolling. Captures show seven
representative experiences at desktop, tablet, and phone sizes.

All 17 catalog entries use the same frame and control positions. Object actions
and measurements follow the canvas instead of changing its usable bounds.
Field experiment branches share the same viewport; their display selector does
not alter the numerical state. Supported camera choices remain simulation-owned.

Browser evidence uses headed Chrome with explicit software WebGPU and emulated
touch input. It does not qualify physical-device performance or unfamiliar-user
understanding. `SIMULATTE_FRAME_ORIGIN` can target an independently deployed
World URL; `SIMULATTE_FRAME_OUT` chooses the evidence destination.

`SIMULATTE_FRAME_RESUME=1` reuses passing cases only when the source commit and
all modified public-file hashes and timestamps exactly match the recorded run.
It reruns failed cases and requires complete catalog coverage before success.

The Solar camera regression has separate before/after records in
`solar-camera-state.before.json` and `solar-camera-state.json`. They check
selection, focus, keyboard navigation, and unchanged numerical state at all
three viewport sizes. `SIMULATTE_FRAME_ROUTES` filters catalog paths;
`SIMULATTE_FRAME_REPORT` chooses a separate report name. Filtered checks retain
the earlier layout captures instead of overwriting them.
