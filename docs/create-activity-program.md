# Create activity programs

Create now carries a versioned `activityProgram` inside its existing WorldSpec.
This is the first executable migration slice: planar procedural walking, sitting,
holding, and cup lifting/tilting compose through declared joint channels. Existing
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
pelvic support on a declared seat. `drink` controls a cup's lift and tilt; a
qualified same-hand, same-object hold/drink combination shares ownership through
an explicit rule. Conflicting simultaneous actions are refused together instead
of being silently reordered. Default height, duration, hand, and object dimensions
are recorded as assumptions; accepted node parameter edits recompile them.

Runtime uses bounded analytic two-bone IK. Foot stance anchors stay fixed until
their gait cycle changes. Attachments publish object transforms from the declared
hand. Repeated walking accumulates displacement. Participant mutation through user
controls is rejected while the activity state owns it; selection remains available.
Restart creates fresh state and retained history. Serialization preserves the
program, its identity, authoring, and phase sources without importing stale proof.
Legacy WorldSpecs without an activity program retain their existing execution.

Acceptance is deliberately bounded. Contact separation, held-object/torso/ground
penetration, bone lengths, stance sliding, identities/counts, handedness, timing,
locomotion, and cup lift/tilt are measured over the retained sequence. Incomplete
or truncated history cannot pass. The collision model uses object circles and
torso rectangles; it does not validate finger, head, or seat mesh penetration.
Force dynamics and liquid transfer remain unvalidated.

Placement/release, standing up or sitting down between root actions, unresolved
repeated-object references, and individually unidentified plural participants
produce explicit refusals. They cannot borrow success from a rendered preview.
Changing the object held by a hand requires a qualified release transition.
These are missing executable capabilities, not implemented COSMI behavior.

Run qualification from the repository root:

```sh
node --test tests/activity-program.test.cjs
node tools/qualify-activity-program.mjs
node tools/audit-activity-program.mjs
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

COSMI could later supply motion behind this contract after artifacts, licensing,
skeleton mapping, contacts, latency, and browser resource use are qualified.
Create continues to own composition and simulation authority.
