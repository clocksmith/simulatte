# Existing simulation interaction sessions

The shared session exposes commands and operation receipts. Runtime adapters own
model state and publish preparation, execution, rendering and measurement state.
Idle sessions show **Waiting for input**. Commands receive an abort signal and a
generation guard; replacement scenarios cancel older work. Adapters must check
that guard before publishing asynchronous results and cancel their providers.
Commands marked `serial` share a runtime mutation queue: cancellation rejects
promptly, but a replacement waits for non-abortable work to drain before touching
the same runtime. Camera and pause commands remain available during that wait.

The running interface keeps Camera, Pause/Resume, and Advanced beside the scene.
Timelines, stepping, restart, replay, and detailed results live in Advanced.
The selected-object inspector is available with Advanced closed. Its controls
use the same session commands as the surrounding interface. Measurements update
existing nodes, preserving selection, focus, inspector scrolling and open panels.
Preview identity binds both accepted controls and the session generation. A new
scenario or replay invalidates it; measurement updates preserve it.

- **Reset view** changes only the camera. Camera navigation canonicalizes the URL
  without dispatching execution; its parameters come from accepted runtime inputs,
  never a measurements panel or an unapplied control draft.
- **Restart simulation** starts the accepted scenario again with its current
  parameters, retaining the camera. GPU restart clears recorded rack slowdowns;
  replay retains those supported interventions.
- **Replay recorded run** uses the existing runtime's recorded configuration and
  supported intervention history. It does not promise pixel-identical playback.
- Motorcycle's **Replay traffic** deliberately names its narrower capability:
  the seeded traffic repeats with current acoustic treatments. Exported acoustic
  snapshot replay remains in Advanced.
- **Apply and restart** explicitly recalculates a scenario. It is not a live
  intervention. Sun Walker and Orbital prepare an identified alternative in their
  existing plugin. Preview leaves accepted playback untouched; applying promotes
  that candidate without another route or transfer search.

GPU rack slowdown is a supported live intervention. Other inspectors expose
existing model controls: Sun Walker route preference, Subsea resource failures, Grid storage policy, Orbital objective weights, and Interstellar packet
transmission. A recalculation can retain the same chosen route when the model
finds no better alternative. The inspector reports model values rather than
inventing a visible consequence.

Create calls the actual build, pause, resume and restart controller. Your Data
keeps the accepted displayed program separate from a draft or pending replacement;
playback duration and replay are bound to that displayed program. Failed and
cancelled execution produces failed and cancelled command receipts, respectively.

World currently advertises Motorcycle Noise, GPU Cluster, and Sun Walker. The
remaining profiles, Create, and Your Data stay implemented and unadvertised.

## Evidence

Run `node tools/simulatte/audit-session-interactions.mjs` and repeat with
`--mobile`. Each route requires direct selection of its intended object, then checks a supported action, camera
focus, pause/resume and state preservation with Advanced closed, then replay
from Advanced. It checks that the compact controls remain visible. Scene
screenshots include pixel checks. Add `--profile=forms` for Create and Your Data.
For dormant profiles and Your Data, the audit removes the launch gate only in its
local browser; this is not evidence of public navigation to those workflows.
Reports and screenshots are in `artifacts/session-interactions/` with source hashes.

The browser audit uses headed Chrome on an isolated Xvfb display and explicit
SwiftShader. It proves local browser behavior with software rendering; it is not
hardware performance, deployment or human-review evidence. `SIMULATTE_XVFB` can
select an installed Xvfb; the default also supports the existing solar-drive audit
binary. Source regression tests cover cancellation races, stale commits, camera
bounds/insets, model-time presentation, and pending data revisions.


## Selected-object accuracy pass

Plugins now declare selectable objects and their actions in the existing v4
contribution. Sun Walker exposes the walker, destination, routes, and sampled
walked segments. Shadow envelopes do not compete for clicks. Segment inspection
identifies its modeled occluder and arrival sampling instant. Route alternatives
show time, direct-sun exposure, and detour differences; zero differences remain
explicit when the bounded search keeps the same route. Orbital alternatives
include trajectory, departure, arrival, flight time, and delta-v.

Numerical evidence is separate from appearance: rectangle fixtures independently
compute shadow length as height / tan(elevation), including long shadows outside
the footprint diameter. A 63-metre straight route crosses an analytically known
30-metre shadow interval; reducing sample spacing from 24 to 0.5 metres converges
to the expected exposure and preserves distance/arrival accounting. Unequal-edge
fixtures require proportional distance/time weights instead of equal weights per
sample. Each selectable exposure interval uses its sampled sidewalk geometry. Missing
heights remain unknown. Shadow display and active exposure use the same sample
instant. Displayed building shadows remain convex envelopes, so concave outlines
and courtyard detail are not qualified by the rectangle reference. Historical
tree coverage and weather analogs are unchanged, not new observations.

The Sun Walker model source hash is generated from the ordered concatenation of
`sun-route-simulation.js`, `sun-exposure.js`, and `environment.js`. Plugin source
integrity additionally binds presentation and shadow drawing.

Use `--public` to test only the three launched simulations without modifying the
launch gate. `--base-url=https://simulatte.world/ --public` runs those journeys on
the served site. `--hardware` requires a non-software adapter and must fail when
none is available. Mobile uses CDP touch input and orientation emulation; this is
not physical-device qualification. Native keyboard selection, repeated playback
interaction, and paused background/resume augment the existing camera/focus/
scroll regressions. Each journey defaults to a 60-second repeated pause/resume soak;
`--soak-seconds` sets an explicit 0..600-second duration. This bounded check is not
an endurance qualification.
Deployment requires authenticated Firebase access and a separate served-build
identity check; local captures do not establish a production release.


Preview evidence records receive candidate-qualified identities before the host
creates its existing provenance receipt. The accepted contribution remains
unchanged. Browser preview acceptance requires the compositor to represent the
alternative layer, not just report a completed calculation. Amber alternatives
use a narrower comparison stroke over the accepted route when geometry coincides.
