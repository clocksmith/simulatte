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
  intervention. Sun Walker and Orbital preview through isolated instances of their
  existing model runtime, keeping the displayed solution and preview distinct.

GPU rack slowdown is a supported live intervention. Other inspectors expose
existing model controls: Sun Walker route preference, Subsea failures and repair
policy, Grid storage policy, Orbital objective weights, and Interstellar packet
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
`--mobile`. Each route checks activity, selection, a supported action, camera
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
