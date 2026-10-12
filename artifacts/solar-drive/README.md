# Solar Drive route qualification

Component: Solar Drive. Intent: deliberately changed to an operating route ride.
Boundary effects: the shared longitudinal model accepts bounded road/panel
inputs; Sun Walker's ray kernel supports receiver height while retaining its
default ground behavior. Create's compiler is unchanged.

Implementation source: `50bf07f4`. Hosted verifier: `aff0f0ff`.
Public release: `aff0f0ff0479c3ef72f99b0114c69222eaa4f8ec-cf4b6ccf7c1e`.

The root [browser receipt](browser-receipt.json) records local desktop/mobile
WebGPU execution. [Hosted receipt](live-aff0f0ff/browser-receipt.json) records
the same journeys on `https://simulatte.world/simulatte/solar-drive/`, with 20
served assets checked against the tested source. Both have twelve captures.
The hosted receipt retains original temporary capture paths; their matching
filenames and byte-identical images are archived under `live-aff0f0ff/`.

Checked behavior: assembled route opening, Ride/Inspect state preservation,
mid-ride panel cover without a reset, additional battery use against a forked
baseline, exact action replay, export/reimport, rejected-import preservation,
legacy engineering presets, component inspection and desktop/mobile layout.
The numerical suite also checks route completion, ten-second stop, panel-height
occlusion, energy conservation and timestep refinement.

Acceptance: 84 owner regressions, 204 fast tests, generated route/reference
checks, CATSCAN, folder contracts, deployment preflight and four general live
World/Create browser cases passed. Original replay/evidence limitations remain
in each receipt. Software WebGPU and mobile emulation do not qualify physical
GPUs, phones, hardware accuracy or unfamiliar-user learning.

The published Sun Trip measurements provide approximate reference context;
no parameter was calibrated against them. Details and reproduction commands
are in [the experience record](../../docs/simulatte/experiences/solar-drive.md).
