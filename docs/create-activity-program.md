# Create interaction composition

Create now carries a versioned `activityProgram` inside its existing WorldSpec.
The composition system consumes reusable contracts rather than recognizing complete scenes.
Version 3 currently executes those contracts through six qualified planar procedural
providers: walking, sitting, standing, holding, drinking and placing. Providers own
joint trajectories, constrained-body reactions and conservative liquid state.
Versions 1 and 2 remain executable through their original trajectories and declared numerical policies. Existing
user `InteractionIR` remains responsible for selection, dragging, and controls.
No COSMI model, diffusion inference, SMPL-X assets, or new world format is used.

Each `simulatte.interactionContract.v1` declares participant slots and required
capabilities, resource ownership, compatible shared requirements, entry conditions,
exit relationship effects, and editable parameters. Phase 1 validates the component
against its qualified provider. Language forms come from that admitted inventory;
Phase 4 binds resources and checks overlap without a named-action exception.
Phase 5 evaluates temporal facts such as hand occupancy, object ownership, posture
and support. Facts persist between components, and acquisition requires release
from the previous owner. Scene Proof independently derives relationships from
executed participant state and checks the declared effects.

Definite references such as “the person” and “the cup” reuse a unique compatible
prior identity across activity requests. Ambiguous references remain unsupported;
a second actor cannot acquire the same cup by silently creating another object.
Inline “before” and reversed “after” clauses establish temporal dependencies,
while explicit overlap remains simultaneous. Ordering that requires unsupported
multiple predecessors is refused; an explicit authored predecessor can resolve it.
The separate typed-card synthesis helper binds relation/event occurrences to
source-local participants and retains unresolved bindings instead of selecting
the first two graph nodes. These are bounded language rules, not general semantic
understanding. Focused activity tests check executed placement, ownership,
ambiguity, temporal order, and export/reimport; they do not establish browser
visual quality or unfamiliar-prompt coverage.

An identified library can extend the inventory through
`createSpecFromPrompt(prompt, { activityComponentLibrary: library })`. For example:

```js
const inventory = SimulattePhysicsModel.activityCapabilityInventory();
const steady = structuredClone(inventory.components.find(row => row.id === 'hold'));
steady.id = 'steady';
steady.languageForms = ['steady', 'steadies', 'steadying'];
steady.contract.requirements = [
  { key: '{actorId}:attention', value: 'object:{objectId}' },
];
const library = {
  schema: 'simulatte.activityComponentLibrary.v1',
  id: 'attentive-grip.v1',
  components: [steady],
};
const spec = SimulattePhysicsModel.createSpecFromPrompt(
  'a person steadies a book in the left hand while walking',
  { deterministicRuntime: true, activityComponentLibrary: library },
);
```

This declaration composes the existing grip provider with a shared attention
requirement. It does not create a new trajectory or claim a cognitive model.
Different simultaneous attention targets can be refused even when hands are free.
Provider-required participants, capabilities, channels, entry conditions and
observable effects remain mandatory. Language forms must be unambiguous.
The library is retained in compiler configuration and phase artifacts, so worker
compilation, authored revisions, export and reimport use the same declarations.

To add a genuinely different motion or consequence model, qualify its execution
implementation and observations before admitting it as a provider. Current library
extensions reuse available providers; they cannot invent teleportation, arbitrary
articulated behavior, or three-dimensional rigs. Object profiles remain bounded
language interpretation defaults. Explicit capability declarations can qualify
unfamiliar object identities, but their geometry must still satisfy the provider.

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

The Activity panel derives object fields from capability metadata, participant
choices from capability requirements, and action controls from declared parameters.
The current inventory supplies geometry, container fill, hand selection, duration
and temporal predecessor edits. Swap hands revises all hand actions together.
These controls author node parameters through the existing append-only WorldSpec
edit path. `params.activityOverrides` on the actor maps stable action IDs to
`hand`, `durationSeconds`, `afterActionId`, `objectId`, and `supportObjectId`.
Phase 4 resolves those edits against retained source requests, rebuilds schedules
and owned channels, and refuses cycles, missing participants, and conflicting
simultaneous writers. Phase 5 rebuilds attachments and consequences. Repeated
edits retain previous overrides and node identities. Export and reimport retain
the accepted program rather than generating new motion.

Phase 1 declares bounded object profiles and capability names. Phase 5 checks
`graspable-object`, `seat-support`, `liquid-container`, and `support-surface`
instead of treating a familiar noun as sufficient interaction evidence. An
authored `params.activityCapabilities` array replaces the interpreted profile;
capability provenance records its user authority. Declaring a capability does
not establish compatible drawing geometry or physical validity. The existing
planar geometry, rig, support, and liquid restrictions still apply.

An authored replacement with unresolved activity requirements stops before
drawing and preserves the accepted world. Empty drinking containers and sampled
unreachable joint targets also stop publication. The path check samples 33
positions per action, including backward-difference acceleration during
unrotated liquid-container motion. Loss of positive effective normal gravity
refuses that prescribed trajectory. It is a bounded rejection check, not complete contact,
force, liquid, or pixel proof. Scene Proof independently evaluates the executed
sequence and drawing. Failed drafts remain editable in the panel; applied
revisions restart execution from fresh state.

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
node --test tests/activity-revisions.test.cjs
node tools/audit-activity-revisions.mjs
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

The revision browser audit uses the five-action sit/hold/drink/place/stand
composition at those same viewports. It revises hands, seat height, cup fill,
table position, and duration through the Activity panel, checks the entire revised
execution and pixels, and verifies that unsupported revisions retain the accepted
world before rendering. It also checks export/reimport identities. Its source-bound
report and screenshots go under `artifacts/activity-revisions/`; the mobile
viewport is emulated.

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
`simulatte-activity-dynamics-proof.js` in Phase 8. Capability profiles live in
Phase 1; source-bound revision grounding lives in Phase 4. The application
coordinates revisions through `activity-editor.js` and the existing managed
WorldSpec compilation path. Generic binding and compatibility live in
`simulatte-activity-contracts.js`; temporal relationships and capability-derived
authoring metadata live in `simulatte-activity-composition.js`.

`tests/activity-composition.test.cjs` covers library extension, object and actor
capabilities, shared requirements, resource-sharing limits, persistent ownership,
observed relationship failures and retained compiler identity. Run
`node tools/audit-activity-composition.mjs` for local desktop and emulated mobile
WebGPU execution: two composition families, declared extension, hand and geometry
edits, eight phases, sequence/pixel checks and exact-identity reimport. Its report
under `artifacts/activity-composition/` binds the runtime source hashes. This is
browser evidence, not deployment or unfamiliar-user observation.
