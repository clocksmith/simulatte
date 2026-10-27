# CATSCAN: Lucyd study workspace

Parent: [Lucyd](../CATSCAN.md)

## Target

Study authored system-design solutions stage by stage on an open Excalidraw canvas, drawing freely while the authored progression stays intact.

## Authority

- Owns the workspace page, stage projection onto the canvas, per-stage learner overlays, typed-connection choices, browser autosave and workspace import/export.
- Does not own authored solutions; the composable study contract and its content owners do.
- Does not own Excalidraw behavior; the vendored 0.17.6 build does.

## Scope

This directory, served at `/simulatte/system-diagram/study/`.

## Contracts

- Input: [composable study contract](../../../../docs/simulatte/composable-study-contract.md) documents listed in the [manifest](../../../data/system-diagram/composable-solutions/manifest.json).
- Output: `simulatte.studyWorkspace.v1` files from [workspace-store.js](workspace-store.js); behavior in the [workspace specification](../../../../docs/simulatte/study-workspace-spec.md).

## Invariants

- Replay matches the contract validator exactly; mismatched stage graphs are refused, never repaired.
- Authored documents are never edited. Learner changes live only in the overlay of the stage where they were made.
- Navigation never enters undo history; undo never crosses a stage.
- Drawn arrows become typed connections only through matching ports.
- Imports validate before replacing anything, name the failing location and keep unknown fields.
- Study controls never trigger canvas shortcuts. Open canvas; notes open on demand.

## Acceptance

- Evidence: [workspace tests](../../../../tests/study-workspace.test.cjs) and the [gesture audit](../../../../tools/simulatte/audit-study-workspace.cjs) recorded in [acceptance](../../../../docs/simulatte/study-workspace-acceptance.md).
- Emulated touch is not physical-device proof.

## Non-goals

Executing or proving the architectures, generating solution content, real-time collaboration, or replacing the simulation editor.

## Freedom

Any implementation is permitted within these contracts.
