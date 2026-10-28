# CATSCAN: Lucyd study workspace

Parent: [Lucyd](../CATSCAN.md)

## Target

Study solutions on an editable Excalidraw canvas.

## Authority

- Owns page controls, stage projection, learner overlays, autosave and import/export.
- Does not own authored solutions; the composable contract does.
- Pinned Excalidraw 0.18.1 owns native gestures; patches are recorded in `vendor/modern/versions.json`.

## Scope

This directory, canonical route `/lucyd`; legacy entrypoints remain compatible.

## Contracts

- Input: [composable contract](../../../../docs/simulatte/composable-study-contract.md), [catalogue](../../../data/system-diagram/composable-solutions/manifest.json).
- Output: `simulatte.studyWorkspace.v1` in [workspace-store.js](workspace-store.js); [workspace specification](../../../../docs/simulatte/study-workspace-spec.md).
- Approaches open in the simulation editor through the [architecture model](../../../../docs/simulatte/architecture-model.md).

## Invariants

- Replay exactly matches the validator; refuse mismatched graphs.
- Never edit authored documents. Keep learner overlays independently per stage.
- Navigation never enters undo history; undo never crosses stages.
- Diagram selection starts at stage one; explicit deep links and imported workspace views retain their requested stage.
- Nunito defaults; measure advances and render at display resolution.
- Answers, reveal state and self-assessment persist with learner work; review never implies automated grading.
- Compound layouts, routes and text clearance are deterministic and checked; geometry never changes meaning.
- Only matching ports create typed connections.
- Validate imports before replacement; retain unknown fields and current work on failure.
- Opt-in parent embedding accepts validated same-origin documents, preserving overlays. Hosted use has no model provider.
- Page Up/Down skips typing, dialogs and gestures.
- Study mode shows a centered guide with 50–75-word explanations and safe background links. Notes are viewport-bounded at 480px.
- Theme defaults to System and tracks OS changes; explicit Light/Dark overrides persist.
- Controls isolate canvas shortcuts.

## Acceptance

- Evidence: [Workspace tests](../../../../tests/study-workspace.test.cjs), [gesture audit](../../../../tools/simulatte/audit-study-workspace.cjs), [reading audit](../../../../tools/simulatte/audit-study-reading.cjs), [spatial policy](../../../../docs/simulatte/study-spatial-layout.md), and [acceptance receipts](../../../../docs/simulatte/study-workspace-acceptance.md). Emulated touch is not physical-device proof.

## Non-goals

Architecture execution/proof, content generation, collaboration, or replacing the simulation editor.

## Freedom

Any implementation is permitted within these contracts.
