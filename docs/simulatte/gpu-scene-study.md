# GPU Cluster scene-first comparison

Owner: [World application](../../public/simulatte/app/CATSCAN.md).
Implementation: [GPU scene composition](../../public/simulatte/app/gpu-scene.js).

Status: working prototype and study protocol. No unfamiliar-user observations
have been collected by the implementation agent. Automated interaction checks
are not evidence of comprehension.

Start `npm run serve` in `simulatte/`. Compare these routes on the same build:

- Current: <http://localhost:4173/datacenter>
- Proposed: <http://localhost:4173/datacenter?frame=scene>

The prototype uses the shared World UI library in
`public/shared/design/world-ui/`: restrained monochrome controls, Space Grotesk
labels, IBM Plex Mono measurements and green for active states. GPU owns scene
composition; the library owns geometry, typography, states and surfaces.

## Rendered-state contract

- Open directly into a running workload; readiness and failures remain visible.
- Desktop: identity/status/Menu above the scene, playback/Speed/time dock at
  bottom-left, Camera/Reset view dock at bottom-right.
- Mobile: identity/Menu above the scene and one bottom dock for Pause, Camera and
  the selected action. Speed remains in Menu and Reset view in Camera.
- Selecting a rack exposes its actual condition and Slow rack / Restore rack.
  One primary action per inspector; focus remains an explicit secondary action.
- Preserve dependent-rack highlighting and executed measurements. Productive
  compute share excludes communication, waiting and slowdown; it is not a
  hardware-utilization measurement. Metrics retain interval, freshness and validity.
- Pointer, touch and Menu's non-spatial selector reach the same objects/actions.
- Desktop inspector anchors beside the rack without overlap when space permits;
  otherwise it docks at the right edge. Mobile details use a bottom sheet above
  the persistent action dock. Expanded facts scroll within that surface.
- Keep 44-pixel targets, 4-pixel control radii, visible focus, menu keyboard
  navigation, drawer containment, Escape/return focus, reduced-motion support,
  and no horizontal overflow. Shared components own these rules.
- Keep Restart, Replay, cancellation and configuration semantics in their
  existing owners. Preserve the original frame and its audit.
- The component catalog exercises every primitive in both themes, including
  selected, pending, disabled and error states. The CSS ownership check rejects
  new native-control overrides and shared-internal selectors outside the library;
  existing legacy selectors are frozen until their owners migrate.

## Unfamiliar-user procedure

Recruit people who have not used these simulations or seen this proposal. Use
anonymous participant identifiers and record prior familiarity with GPU training.
Do not explain the simulation or reveal menu locations before the first tasks.
Obtain agreement before recording their screen or voice; written notes suffice.

Use equal numbers of current-first and proposed-first sessions. Use independent
fresh navigations and the same default scenario, browser size and input device.
Record first exposure separately: learning from the first interface contaminates
the second. Include desktop mouse/keyboard and phone touch; an emulated phone
in the automated audit is not a substitute for a person using a real phone.

Present one task at a time, exactly as written:

| Task | Participant prompt | Successful observation |
| --- | --- | --- |
| 1 | What do you think this simulation represents? | Identifies a shared training job with cooperating racks, not unrelated computers. |
| 2 | Pick one rack and tell me what it is doing. | Selects a rack and describes its displayed activity. |
| 3 | Change something that affects the job. | Applies a live rack slowdown without moderator instruction. |
| 4 | What happened because of your change? | Connects slower work to waiting dependencies and a measured consequence; does not equate the percentage with hardware utilization. |
| 5 | Restore the rack's speed. | Uses Restore rack, without resetting the entire run. |
| 6 | Restart the simulation. | Finds Restart and observes that live changes clear. |
| 7 | Replay recorded changes. | In a fresh run, makes a change and finds Replay; distinguishes it from Restart. |

Start timing when each prompt is read; stop on completion or explicit abandonment.
Record elapsed seconds, success, assistance, wrong controls, backtracking,
accidental resets and the participant's actual explanation. If help is requested,
record the unaided outcome first, then the exact help. Do not count an assisted
completion as unaided. Thirty seconds is a hypothesis to compare, not an acceptance
claim or a reason to erase slower successes.

Explanation rubric: 0 = absent/incorrect; 1 = describes visible colors or values;
2 = correctly identifies rack activity and dependency; 3 = explains the causal
change using both dependency and measurement. Keep verbatim explanations beside
the score so another reviewer can check the judgment.

Use one CSV row per task; do not put names or contact information in the repository:

```csv
participant,order,variant,source_commit,build_stamp,device,viewport,input,task,seconds,completed_unaided,mistakes,assistance,explanation,explanation_score,notes
```

Record source with `git rev-parse HEAD`, modified files with `git status --short`,
and the page's `meta[name=simulatte-build]` value. Save screenshots with the session
record when permitted. Compare completion and mistake counts by task and device,
then distributions of time and explanation scores. Keep first-exposure results
separate from crossover results. Report individual failures and uncertainty;
a prettier screenshot alone does not justify promotion.

## Decision after observation

Retain or revise the GPU prototype based on observed failures. Only then decide
which behavioral components belong in the shared frame. Motorcycle, then Sun Walker,
are subsequent migrations, not included in this change. Do not infer catalog-wide
acceptance from this GPU-only comparison.

## Machine evidence

Run `node tools/simulatte/audit-gpu-scene.mjs`. It writes source-bound checks and
screenshot hashes to `artifacts/gpu-scene-first/report.json`; screenshots stay
local. `node --test tests/gpu-scene.test.cjs` checks placement geometry. The browser
journey covers running, selecting, pausing, live slow/restore, dependent racks,
measurements, expanded details, Menu, non-spatial selection, Restart and Replay.
These checks do not complete the human study above.

Run `node tools/simulatte/audit-world-ui.mjs` for shared component states, keyboard
behavior and asynchronous action regression checks. It writes
`artifacts/world-ui-catalog/report.json` and local screenshots.
