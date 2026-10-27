# Study workspace gesture acceptance

Owner: the interface implementation under `public/simulatte/system-diagram/`.
Data contract: [composable study contract](composable-study-contract.md).
Authority: the user's supplied Excalidraw-style interaction specification, October 27, 2026.

This records an inspection of unfinished files, not acceptance of a finished interface. The existing `/system-diagram` simulator is a separate surface and is not judged by these new workspace requirements.

## Current blocking boundary

At inspection, the local server returned HTTP 200 for `study.html`, `composable-study.js` and `study-workspace.css`. The HTML references `study-canvas.js` and `study-workspace.js`; both files were absent and returned HTTP 404. Interaction acceptance is blocked until those dependencies exist and load. None of the gestures below has browser proof from this review.

Source probes establish two additional gaps:

- `SimulatteComposableStudy.apply` rejects the shared contract's `reconnect` operation as unsupported. Supporting the seven current documents does not cover this required operation.
- `editInstance(document, solutionId, nodeId, patch)` has no stage argument. Editing L034's `client` label changes all eight stages in the push approach. Stage-specific user edits need separate overlays in the workspace envelope; they must not silently alter the authored progression.

The stylesheet declares permanent 250px and 300px columns beside the canvas. The latest specification instead requests an open drawing surface with compact study overlays and on-demand panels. Existing rail goals/charters must be reconciled explicitly with this new surface when the interface owner implements it.

## Required interaction evidence

Every row needs a recorded action and observed result. A button, source function, passing data test or screenshot alone does not pass it.

| Area | Required checks | Current evidence |
| --- | --- | --- |
| Open canvas | Floating tool/menu/history controls; contextual properties; compact problem/approach/stage overlays; no permanent navigation columns. | Source layout conflicts. |
| Drawing | Shape preview and commit; freehand; multipoint lines/arrows; tool persistence; Escape and pointer cancellation. | Blocked by missing scripts. |
| Shortcuts/focus | Supplied tool keys; shortcuts scoped to canvas; text, inputs and dialogs suppress drawing commands. | No interaction proof. |
| Selection | Click, Shift-add, marquee, deeper grouped selection, forgiving connector hits, contextual actions and keyboard equivalents. | No interaction proof. |
| Transforms | Resize, rotation, Shift constraints, center resize, multi-selection, bound labels/connectors, coherent undo. | No interaction proof. |
| Camera | Hand, Space-drag, middle drag, focal zoom, fit all/selection, temporary modifiers, empty-scene stability and pinch. | No interaction proof. |
| Text/style | In-place labels, multiline editing, commit/cancel, Unicode/whitespace, wrapping, contextual style and stable redraw appearance. | No interaction proof. |
| Connections | Endpoint/point editing, binding feedback and suppression, rerouting, arrow labels/heads, typed-port rejection. | Data parser validates endpoint types; reconnect is missing. |
| Editing/history | Copy/cut/paste/delete, duplicate, Alt-drag, group/ungroup, ordering, undo/redo. Grouping does not invent subsystem ownership. | No interaction proof. |
| Study progression | Exact graph replay, stable IDs, all operation types, change summaries, collapsible subsystem mappings, supplied engineering explanations. | Seven files parse; reconnect unsupported; rendering unverified. |
| Import/export | Preview and atomic replacement; failure retains current work; complete metadata and supported extensions round-trip; independent approach/stage edits; visible autosave status. | Parse/serialize helpers exist; whole-approach edits conflict with stage independence. |
| Touch | Reachable controls; navigation versus drawing; cancellation; usable handles at different zooms. | No physical-device or emulated interaction proof. |

## Interface-owner completion order

1. Finish the referenced entry scripts and resolve every boot error.
2. Match the requested drawing layout and implement core gestures before secondary features.
3. Support the complete shared operation contract. Preserve authored documents and store per-stage user edits separately.
4. Run one supplied multi-stage solution through import, stage selection, editing, export and reimport. Compare IDs, contracts, definitions, subsystem mappings, explanations and ordered operations exactly; compare user overlays separately.
5. Run the gesture checks with mouse, keyboard and touch. Record failures as failures, including focus and cancellation cases.
6. Commit by owned paths and report the runnable URL, evidence and remaining gaps. Data validation does not establish rendering, simulation execution or architectural correctness.

The contract/content owner maintains solution data and cross-checks. This audit does not duplicate the interface owner's implementation.
