# Solar Drive

Owner: `public/simulatte/solar-drive/`. Model:
`public/shared/core/simulation/solar-drive.js`. Entry: `/simulatte/solar-drive/`.

The opening bicycle travels the frozen 1.49 km delivery-bike graph route from
Union Square to Washington Square. Ride shows the assembled machine, route
progress, local building outlines, speed, battery remaining and available solar
power. Inspect reveals components without advancing or restarting execution.
Selection preserves the camera; Focus remains a separate action.

Shade the panel adds a visible cover and forks the prior state into a comparison
without that change. Both branches use their own position along the same route
and logical clock. The intervention's step and authored edit are exported and
replayed. Restart restores accepted initial inputs and clears live interventions;
Replay executes recorded interventions; Verify replay compares reproduced state.

## Inputs and limits

`tools/simulatte/build-solar-route.mjs` compiles the existing NYC delivery-bike
street graph and retained building geometry. USGS EPQS responses are frozen in
`tools/simulatte/data/solar-route-elevation-v1.json`, with raw-byte hashes and DEM
acquisition dates. The route uses three-dimensional arc distance and derives
grade from its horizontal and vertical increments. Ground position, heading,
panel transform, sun timestamp and displayed buildings share those inputs.

Nine panel-plane rays evaluate direct-beam building occlusion at the panel's
height, including road inclination and collector tilt. Diffuse light uses an
isotropic approximation with no diffuse sky occlusion. Partial cover uses area
averaging, not electrical string/bypass-diode behavior. Buildings with unresolved
heights on a relevant ray fail explicitly. Trees, facade details, live traffic
and observed street weather are excluded. The ten-second intersection stop is
an authored scenario, not a measured signal schedule.

`tools/simulatte/build-solar-reference.py` extracts 57 daily records from the
published Sun Trip 2021 spreadsheet. The approximate opening sizes are its
reported 500 W solar array, 1,080 Wh battery and 60 kg unloaded vehicle. The
reported configuration is a recumbent bike with a trailer, not this representative
upright assembly. Panel efficiency, derived area/mass, motor rating and curve,
rider load, drag, rolling resistance and weather remain engineering assumptions.

Alternating source rows declare disjoint development and evaluation populations.
No parameter is fit to either. Advanced compares this run's gross DC electrical
demand per distance with the reserved population's recorded consumption. Different
routes, pedaling, loads and weather prevent a matched accuracy verdict. Energy
conservation and timestep refinement provide numerical evidence separately.

The earlier scalar/hill drive cycles and scooter/car presets remain explicit
engineering inspection modes. Legacy 1.0.0 bench WorldSpecs retain their program
identity and parameters. Flywheel storage is an experimental alternative with
its mass, initial energy, conversion and parasitic costs counted.

## Verification

```bash
node tools/simulatte/build-solar-route.mjs
python3 tools/simulatte/build-solar-reference.py
node --test tests/solar-drive.test.cjs
node tools/simulatte/audit-solar-drive.mjs
```

Browser evidence binds desktop and emulated mobile WebGPU execution, mode
preservation, a live panel-cover comparison, recorded-action replay,
export/reimport, controls and pixels. Physical hardware, physical phones and
unfamiliar-user observations require their own evidence.
