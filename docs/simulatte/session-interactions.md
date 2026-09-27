# Existing simulation interaction sessions

The shared session exposes commands and operation receipts. Runtime adapters own
model state and publish preparation, execution, rendering and measurement state.
Idle sessions show **Waiting for input**. Commands receive an abort signal and a
generation guard; replacement scenarios cancel older work. Adapters must check
that guard before publishing asynchronous results and cancel their providers.

The selected-object inspector is available with Advanced closed. Its controls
use the same session commands as the surrounding interface. Measurements update
existing nodes, preserving selection, focus, inspector scrolling and open panels.

- **Reset view** changes only the camera.
- **Restart simulation** starts the accepted scenario again with its current
  parameters, retaining the camera.
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
playback duration and replay are bound to that displayed program.

## Evidence

Run `node tools/simulatte/audit-session-interactions.mjs` and repeat with
`--mobile`. Each route checks activity, selection, a supported action, camera
focus, pause/resume, state preservation and replay with Advanced closed. Scene
screenshots include pixel checks. Add `--profile=forms` for Create and Your Data.
Reports and screenshots are in `artifacts/session-interactions/` with source hashes.

The browser audit uses headed Chrome on an isolated Xvfb display and explicit
SwiftShader. It proves local browser behavior with software rendering; it is not
hardware performance, deployment or human-review evidence. `SIMULATTE_XVFB` can
select an installed Xvfb; the default also supports the existing solar-drive audit
binary. Source regression tests cover cancellation races, stale commits, camera
bounds/insets, model-time presentation, and pending data revisions.
