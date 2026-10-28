# Study workspace gesture acceptance

Owner: the [study workspace](../../public/simulatte/system-diagram/study/CATSCAN.md) at `/lucyd`.
Data contract: [composable study contract](composable-study-contract.md). Behavior: [workspace specification](study-workspace-spec.md).
Authority: the user's supplied Excalidraw-style interaction specification, October 27, 2026.

The existing `/system-diagram` simulator is a separate surface and is not judged by these requirements.

## Resolved boundary

The first review found an unfinished scaffold (`study.html` loading two missing scripts), a parser without `reconnect`, whole-approach edits and permanent side columns. That scaffold was removed. That release embedded the vendored Excalidraw 0.17.6 canvas with floating controls and an on-demand study sidebar. Its adapter replays every contract operation, including v2 `rebind` and replacement labels, identically to the validator. Learner edits live in per-stage overlays of a `simulatte.studyWorkspace.v1` envelope; the authored document is never modified.

Latest full baseline: `LUCYD_PLAYWRIGHT_MODULE=… node tools/simulatte/audit-study-workspace.cjs` wrote [workspace-acceptance.json](../../artifacts/composable-study/workspace-acceptance.json) with 88 of 89 checks passing, using Chromium 143 at 1440x900 and iPhone 13 touch emulation, against all twelve published problems. Source-level checks: `node --test tests/study-workspace.test.cjs` (10 tests).

Focused layer-shortcut correction: [workspace-shortcuts.json](../../artifacts/composable-study/workspace-shortcuts.json) passes 16/16 editing and keyboard-focus checks, including both Cmd+Option+bracket front/back shortcuts. The pinned upstream one-step actions accepted Option and won priority over the advertised front/back actions. [The reproducible patch](../../tools/simulatte/patch-study-excalidraw.cjs) excludes Option from those two one-step predicates. Native action implementations, Help text, drawing controls, geometry and styling remain unchanged. Three [regression tests](../../tests/study-layer-shortcuts.test.cjs) verify Mac behavior, Windows/Linux Ctrl+Shift behavior, and reconstruction of the exact upstream bytes. This is focused evidence, not a rerun of the full baseline.

The same 16 checks pass on production in [workspace-shortcuts-live.json](../../artifacts/composable-study/workspace-shortcuts-live.json). [Release identity](../../artifacts/live-release/2026-10-27T23-26-34-630Z/report.json) verifies build `fc3da85d0294455d47e4f1010fa60501a729317b-8b43a5af0a02`. The deployed engine SHA-256 matches `vendor/versions.json`; its response uses `Cache-Control: no-cache`.

Live: the same audit with `--url https://simulatte.world/simulatte/system-diagram/study/` against build `cec9b10e` wrote [workspace-acceptance-live.json](../../artifacts/composable-study/workspace-acceptance-live.json): 88 of 89 pass, with the same single failure. Two earlier live runs exposed a real race, a slow problem load overriding later navigation; it is fixed and now has its own check.

## Required interaction evidence

Every row needs a recorded action and observed result. A button, source function, passing data test or screenshot alone does not pass it.

| Area | Required checks | Recorded evidence (latest run) |
| --- | --- | --- |
| Open canvas | Floating tool/menu/history controls; contextual properties; compact problem/approach/stage overlays; no permanent navigation columns. | 5/5: canvas fills the window; floating tools, menu, history, zoom and study controls; properties only with a selection; study notes on demand at 294px. |
| Drawing | Shape preview and commit; freehand; multipoint lines/arrows; tool persistence; Escape and pointer cancellation. | 7/7: preview during drag, commit, Shift square, freehand, multipoint line and arrow, Q persistence, Escape mid-drag. Trusted touch cancellation is under Touch. |
| Shortcuts/focus | Supplied tool keys; shortcuts scoped to canvas; text, inputs and dialogs suppress drawing commands. | 4/4: every tool key except 9 (opens the OS picker); typing in pickers, labels and dialogs never switches tools or deletes. |
| Selection | Click, Shift-add, marquee, deeper grouped selection, forgiving connector hits, contextual actions and keyboard equivalents. | 8/8: click, Shift-add, empty-click clear, 4px-off connector hit, context menu without movement, marquee, Cmd-click inside a group, select-all. |
| Transforms | Resize, rotation, Shift constraints, center resize, multi-selection, bound labels/connectors, coherent undo. | 8/8: corner resize, one-step undo, Shift ratio, Alt centre resize, rotation, Shift 15° snap, shared-bounds multi-resize, label and connectors follow. |
| Camera | Hand, Space-drag, middle drag, focal zoom, fit all/selection, temporary modifiers, empty-scene stability and pinch. | 9/9: hand, Space-drag restoring the tool, middle drag, pointer-anchored zoom, keyboard zoom, fit all, fit selection, empty-scene fit, no undo steps from camera. Pinch is under Touch. |
| Text/style | In-place labels, multiline editing, commit/cancel, Unicode/whitespace, wrapping, contextual style and stable redraw appearance. | 5/5: multiline Unicode and double spaces, wrapping with Cmd+Enter commit, undo as cancel, swatch restyles the selection, seed stable across zoom. |
| Connections | Endpoint/point editing, binding feedback and suppression, rerouting, arrow labels/heads, typed-port rejection. | 6/6: binding feedback, Cmd suppression, endpoint reroute to another shape, arrow label, compatible ports become a typed connection saved in the stage overlay, incompatible ports are explained and refused. |
| Editing/history | Copy/cut/paste/delete, duplicate, Alt-drag, group/ungroup, ordering, undo/redo. Grouping does not invent subsystem ownership. | Full baseline 10/11; the overlapping Option handler is now fixed. Focused editing recheck passes all 12 checks, including both front/back shortcuts and grouping without ownership changes. |
| Study progression | Exact graph replay, stable IDs, all operation types, change summaries, collapsible subsystem mappings, supplied engineering explanations. | 7/7: all 203 stages of 12 problems draw exactly their graph, unchanged components stay put, additions marked, every operation summarised with its question, subsystem collapse and expand, a delayed problem load never overrides a later choice, four rapid Next clicks advance exactly four stages. |
| Import/export | Preview and atomic replacement; failure retains current work; complete metadata and supported extensions round-trip; independent approach/stage edits; visible autosave status. | 11/11: stage-only edits, independent approaches, undo never crosses a stage, autosave status and reload, workspace and authored exports, preview and exact reimport with an unknown extension field, invalid file names its location and keeps work, per-stage reset, image survives navigation and export/reimport. Large scene: 2,000 learner elements imported in 92 ms; stage steps took 52/92 ms; a 20-step drag took 866 ms. |
| Touch | Reachable controls; navigation versus drawing; cancellation; usable handles at different zooms. | 7/7 (emulated): controls in view with nothing clipped, stage controls by tap, one-finger swipe never draws, pinch zoom, touch drawing, handle resize while zoomed, trusted touchcancel leaves nothing behind. Not physical-device proof. |

## Remaining gaps

- The Option-layer shortcut conflict is fixed and verified by scripted browser input. Physical keyboard/layout variants remain unverified.
- Excalidraw's image tool opens the File System Access picker, which scripted Chromium cannot answer; images were verified by dropping a PNG file.
- Authored geometry now has separate spatial and browser checks below. Learner edits can change that geometry; graph validation alone makes no visual-quality claim.
- No physical touch device, screen-reader or performance-campaign evidence.

The contract/content owner maintains solution data and cross-checks.

Current spatial work: [composition contract](study-spatial-layout.md). The source geometry receipt and browser receipt are separate from the historical gesture baseline above; do not combine their counts.

## Current composition and font release

The study workspace now uses Excalidraw 0.18.1 and its native newer font picker. The [vendor record](study-canvas-vendor.md) describes pinned files, licenses, local dependency imports and the retained shortcut compatibility fix.

- [Source spatial audit](../../artifacts/composable-study/spatial-audit.json): 235 stages, 522 expanded/individually collapsed views; all pass. This is generated geometry evidence.
- [Browser spatial audit](../../artifacts/composable-study/spatial-browser-audit.json): all 235 stages pass restored element geometry and text-containment checks. The reading zoom is at least 0.85; large diagrams require native panning or explicit Fit all. Perpendicular crossings are recorded separately from overlaps.
- [Drawing/editing](../../artifacts/composable-study/workspace-modern-drawing-editing.json): 23/23, including keyboard focus, drawing and advertised layer shortcuts.
- [Files/touch](../../artifacts/composable-study/workspace-modern-files-touch.json): 19/19, including independent stage edits, undo boundaries, JSON/image round-trips, 2,000 learner elements, pinch and cancellation. Cancellation removes the draft via the newer `newElement` API. The audit pans to off-screen targets and measures drag distances in scene coordinates at the current zoom.
- [Fonts](../../artifacts/composable-study/modern-fonts.json): 8/8, including native font selection, legacy font IDs and JSON persistence.

The earlier `workspace-modern-focused*.json` receipts retain the failing upgrade attempts. They are superseded by the two passing focused receipts above, not counted as additional acceptance. Emulated touch remains distinct from physical-device evidence. Source tests include 33 contract tests, 13 workspace/spatial tests, 3 modern-vendor tests and 66 bounded reference-model tests; these are separate evidence layers.

Stage keyboard navigation: [shortcut audit](../../artifacts/composable-study/stage-shortcuts.json) passes 8/8 checks for visible hints, next/previous movement, stage boundaries and typing/dialog/gesture guards. Two focused unit tests exercise modifier and state guards. The live font check in [modern-fonts-live.json](../../artifacts/composable-study/modern-fonts-live.json) passes all eight checks and verifies the production engine hash. Font checks await actual font readiness rather than assuming a network download finishes within a fixed delay.

Production verification at `https://simulatte.world/lucyd`: all 235 stages pass the browser spatial audit, and all 8 stage-shortcut checks pass in [stage-shortcuts-live.json](../../artifacts/composable-study/stage-shortcuts-live.json). The [release receipt](../../artifacts/live-release/2026-10-28T00-20-23-220Z/report.json) verifies deployed build `6cbe64d4fa40a3637b140f1d60ffc6e134583925-08d2c07e8d17`. The legacy study URL redirects to `/lucyd` while preserving the query, and `/lucyd` uses `Cache-Control: no-cache`.


## Nunito and Study readability

[Reading audit](../../artifacts/composable-study/reading.json): 20/20 checks pass in Chromium with DPR1/light, DPR2/dark and a 390px touch viewport. It verifies Nunito for authored diagrams and new text, direct display-canvas text draws at normal and fractional zoom, backing-store resolution, normal image resampling, contrast, centered stage selection, mode toggling, saved-problem/approach stage-one resets and mobile bounds. Tested tab/supporting-text contrast is at least 7.57:1 light and 8.96:1 dark. Notes defaults to 480px (472px measured content width), bounded by the viewport. The guide moves outside Excalidraw's desktop-only Footer so it also appears on phones.

Explicit deep links and workspace imports retain their requested view. Selecting a problem or approach starts at stage one while preserving edits. The current spatial audits pass all 235 stages and 522 expanded/collapsed views using Nunito metrics and 18/16px node/connection text. These are browser and geometry checks, not physical-device font qualification.

Production reading check: [reading-live.json](../../artifacts/composable-study/reading-live.json) passes all 20 checks against `/lucyd`, including direct Nunito drawing at fractional zoom, both display scales, both theme contrasts, stage-one selection resets, the guide and mobile layout. [Release identity](../../artifacts/live-release/2026-10-28T00-51-56-243Z/report.json) verifies build `31534f345b00590360dc24957bf9bbca5f53bdbe-f169ef1bf86d`.

## Complete eight-batch catalogue integration

The current catalogue contains 46 problems, 92 approaches and 747 stages. [Patch intake](../../artifacts/composable-study/patch-intake.json) records the archive hash, all eight applied batch commits, 67 verified archive members, the forward integration path and Downloads cleanup. The generated catalogue retains the newer Nunito metrics rather than replacing them with historical package receipts.

[Source geometry](../../artifacts/composable-study/spatial-audit.json) passes all 747 stages and 1,392 expanded/individually collapsed views. Dense URL-counting labels use deterministic detours without smaller text or omitted edges. The checker now also rejects self-crossing paths. Source and browser campaigns refuse receipts if their input hashes change during execution.

[Contract and reference audit](../../artifacts/composable-study/audit.json) passes 33 contract tests and 100 bounded reference-model tests. The CachedFile correction leases a block before asynchronous publication, closing the completion/eviction pinning gap. These tests do not establish production concurrency, database durability, or cloud capacity. The eight batch integration test files pass 25 checks; the focused routing regression passes six tests when run with batch 03.

[Browser geometry audit](../../artifacts/composable-study/spatial-browser-audit.json) passes all 747 stages against the current source and font metrics, with zero page/HTTP/checker errors. Dense L022 final-stage screenshots were inspected at reading zoom and Fit all. Large architectures still need panning at reading zoom; perpendicular crossings are reported separately and are not junctions.

Deployment: [release receipt](../../artifacts/live-release/2026-10-28T01-18-20-625Z/report.json) verifies build `4075073ab863dd8f1bfa0344de3aca1c1c4ee7e1-928751d7128d`. [Live catalogue verification](../../artifacts/composable-study/catalogue-live.json) matches all 46 problem documents, 92 approaches and 747 stages byte-for-byte, plus the shared-model adapters and current routing/runtime assets. [Production reading](../../artifacts/composable-study/reading-live.json) passes all 20 checks with zero page errors. Shared-model navigation is included; bidirectional editing and runnable-diagram drawing in the study view remain separate unfinished work.

## Longer stage explanations and System theme

The [explanation audit](../../artifacts/composable-study/explanations.json) covers all 747 stages: each generated `explanation` contains 50–75 visible words and clickable background links. All 53 distinct links returned successful HTTP responses. This is URL availability evidence, not interview provenance or proof of the designs. [Authoring composition](../../tools/simulatte/study-explanations.cjs) retains the stage rationale and invariant, adds relevant technical background and existing scenario/context, and refuses incomplete paragraphs rather than padding or truncating them. [Stage overrides](../../tools/simulatte/study-explanation-overrides.cjs) explain selected publication and shutdown boundaries directly. Graphs, contracts and operation sequences are unchanged.

[Guide browser evidence](../../artifacts/composable-study/guide-ui.json) passes 11 checks: linked teaching text, saved-caption refresh without lost notes, Study-button alignment with zoom/history, scrolling without stage changes, default System, live OS changes, persistent Light/Dark overrides, return to System, and phone bounds/scrolling. The System/Light/Dark menu uses the shared theme preference key. Existing explicit choices remain overrides; a fresh preference defaults to System. Explanations appear in both the bottom guide and Notes and remain part of JSON exports. Saved documents refresh only if every field except teaching text still matches the published document; customized imported designs remain intact.
