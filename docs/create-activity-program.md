# Create activity programs

Create now carries a versioned `activityProgram` inside its existing WorldSpec.
Version 3 composes planar procedural walking, sitting, standing, holding, drinking and placing through
declared joint channels, constrained-body reactions and conservative liquid state.
Versions 1 and 2 remain executable through their original trajectories and declared numerical policies. Existing
user `InteractionIR` remains responsible for selection, dragging, and controls.
No COSMI model, diffusion inference, SMPL-X assets, or new world format is used.

The fixed eight phases retain their authority:

| Phase | Activity responsibility |
| --- | --- |
| Runtime | Declare component contracts, a meter-based planar skeleton, analytic IK, provenance, execution limits, and qualification gaps. |
| Language | Extract source-bound participants, hands, simultaneous/sequential actions, durations, and prohibitions. |
| Retrieval | Supply components from the predecessor's declared inventory, including ordinary action-slot evidence. |
| Grounded Intent | Bind participant identities, schedule requests, and reject competing hand, object, and locomotion writers. |
| Simulation | Compile and validate the immutable program; execute joints, support, gait, and attachment transforms; publish shared state channels. |
| Visual | Bind literal geometry to participant/joint identities with one meter-to-scene projection, and project bindings into VisualIR and the scene packet. |
| Render | Submit snapshot transforms; disable independent participant animation; bind current participant pixels and submitted geometry to program identity. |
| Scene Proof | Check the retained sequence and drawing evidence separately; complete behavior and participant pixels are both required. |

`hold` reserves one hand. `walk` owns root and leg channels. `sit` establishes
pelvic support on a declared seat. `drink` raises a cup outside the torso, moves it to the mouth, tilts, and returns; a
qualified same-hand, same-object hold/drink combination shares ownership through
an explicit rule. Conflicting simultaneous actions are refused together instead
of being silently reordered. Default height, duration, hand, and object dimensions
are recorded as assumptions; accepted node parameter edits recompile them.

Runtime uses bounded analytic two-bone IK. Foot stance anchors stay fixed until
their gait cycle changes. Attachments publish object transforms from the declared
hand. Repeated walking accumulates displacement. Participant mutation through user
controls is rejected while the activity state owns it; selection remains available.
Walking starts and stops smoothly to respect the declared support friction.
Restart creates fresh state and retained history. Serialization preserves the
program, its identity, authoring, and phase sources without importing stale proof.
Legacy WorldSpecs without an activity program retain their existing execution.

Acceptance is deliberately bounded. Contact separation, held-object/torso/ground
penetration, bone lengths, stance sliding, identities/counts, handedness, timing,
locomotion, and cup lift/tilt are measured over the retained sequence. Incomplete
or truncated history cannot pass. The collision model uses object circles and
torso rectangles; it does not validate finger, head, or seat mesh penetration.
Versions 2 and 3 check linear and angular momentum, gravity and constraint impulses,
load and friction limits, water mass, positivity and CFL bounds. Every liquid
transfer identifies its object, action, hand, time, opening and destination;
Scene Proof independently checks the opening and mouth geometry and reconciles
event volumes against state changes. Empty or detached cups cannot prove drinking.

Placement releases a held object onto a declared support after a smooth hand trajectory. Sitting and standing explicitly transfer pelvic support without moving planted feet. Definite repeated references bind to one unique prior participant; ambiguous references and individually unidentified plural participants still refuse. They cannot borrow success from a rendered preview.
Changing the object held by a hand requires a qualified release transition.
The supported transitions use procedural motion; they do not implement COSMI inference.

Run qualification from the repository root:

```sh
node --test tests/activity-program.test.cjs tests/activity-dynamics.test.cjs
npm run qualify:activity
npm run qualify:activity:dynamics
npm run audit:activity
npm run qualify:cosmi
```

The qualification command executes four primitives, two development compositions,
and three different composition families. After inspection, the latter are
diagnostic regressions, not sealed or unseen evaluation. It compares frozen legacy
participant and geometry projections against commit `8819730c` in a temporary
archive, preserving the checkout and cleaning up afterward. Node timings and
bounded resource counts do not establish browser performance or physical GPU use.
For compact and retained-phase exports, the same imports must remain accepted
or rejected as on that commit. Accepted exports must step and roundtrip without
changing their sealed identity or adding an activity program. Existing physics
validation refusals remain enforced.

The browser command uses ordinary Create prompts in the local retrieval lane at
1440×1000 and 390×844, requiring complete trajectory and Scene Proof acceptance.
It exercises Pause, Restart, replayed motion, and browser serialization/reimport.
Screenshots, state, pixel proofs, and summaries go under
`artifacts/activity-program/`; these are local execution evidence, not deployment.

The body model is prescribed motion with lumped actor mass, constrained rigid
objects, water momentum and bounded grip/support reactions. It does not solve
articulated muscle or segment dynamics. Liquid uses conservative depth-averaged
finite-volume fluxes in an extruded rectangular container, with translation,
Euler, centrifugal and Coriolis acceleration. It assumes hydrostatic depth
profiles; loss of positive effective normal gravity rejects execution. It does
not model 3D wetting, turbulence, splashes or swallowing physiology. Water is
998.2 kg/m³; the default drink starts with a declared 55% fill. Authored mass,
capacity and fill parameters override recorded defaults.

Version 3 uses 1,280 liquid cells, positivity-limited second-order reconstruction,
a half-step predictor, adaptive CFL steps and a maximum body step of
1/240 second. CFL bounds include the predicted face states. Private scratch
arrays avoid allocating new face and reconstruction objects at each substep.
Sixteen rendered columns average those cells without changing
volume. This preview is a projection of simulated water, not a separate animation.
The numerical qualification report records independent stationary weight and
Ritter dam-break references, three container geometries/fills, 320/640/1,280/2,560-cell
sip refinement, and body steps of 1/120, 1/240 and 1/480 second.
The acceptance budget for the default grid is a change below both 5% and 1 gram
when its resolution doubles. The measured 1,280-to-2,560-cell change is 0.902 grams
(1.30%). This qualifies numerical refinement for inspecting the declared model;
it does not establish empirical calibration or an exact real-world sip prediction.
Version 2 retains its original first-order policy and cell bounds. Diagnostic examples
remain separate from sealed/unseen scientific evaluation.

COSMI inference is externally blocked. The official repository at commit
`bc23c06d4e2048062a25629438234358e1effdbc` contains a README, license and teaser,
with no model code or checkpoints. Its README states that these will be released.
`qualify:cosmi` fetches and records the exact current commit, file tree and release
assets, writes `artifacts/activity-program/cosmi-acquisition.json`, and exits 2
while acquisition/qualification is blocked. This is not an inference result.
Requesting `activityMotionProvider: 'cosmi'` fails at Runtime with
`COSMI_ARTIFACTS_UNAVAILABLE`; it cannot silently select procedural motion.

Released checkpoints, model implementation, licensed SMPL-X assets and a qualified
Doppler execution path are required for genuine COSMI motion. Create retains
composition and simulation authority. Sources: [COSMI repository](https://github.com/ptrvilya/cosmi),
[COSMI paper](https://arxiv.org/abs/2610.03252),
[Clawpack shallow-water reference](https://www.clawpack.org/riemann_book/html/Shallow_water.html).

Owners: `simulatte-activity-program.js`, `simulatte-activity-dynamics.js`,
`simulatte-activity-liquid.js` in Phase 5, and
`simulatte-activity-dynamics-proof.js` in Phase 8.
