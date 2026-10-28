# Study workspace specification

Owner: [study workspace](../../public/simulatte/system-diagram/study/CATSCAN.md). Evidence: [acceptance](study-workspace-acceptance.md).

The workspace embeds Excalidraw **0.17.6** (vendored, MIT) as its drawing engine. Statements are grouped by authority: what the embedded engine was observed to do, what this integration must guarantee around it, and the study semantics that exist only here. Newer Excalidraw releases differ (for example elbow arrows and fractional ordering indices); expectations below are pinned to 0.17.6.

## 1. Verified engine behavior (Excalidraw 0.17.6)

Observed by scripted mouse, keyboard and emulated touch input; rows cite [the audit](../../tools/simulatte/audit-study-workspace.cjs).

- **Tools.** H hand; V/1 selection; R/2 rectangle; D/3 diamond; O/4 ellipse; A/5 arrow; L/6 line; P/7 freehand; T/8 text; 9 image; E/0 eraser; F frame; K laser; I colour picking; Q keeps the tool after drawing. Shortcuts apply only while focus is inside the Excalidraw container (`handleKeyboardGlobally` is off).
- **Creating.** Press-drag-release with a live preview; Shift constrains proportions; afterwards the tool returns to selection and the new element is selected. Lines and arrows also accept successive clicks, finished by Escape.
- **Selection.** Strokes and filled interiors select; a transparent interior does not. Shift-click adds; Cmd/Ctrl-click selects inside a group; a marquee selects only fully enclosed elements. Clicking inside the common bounds of a multi-selection keeps it.
- **Transforms.** Arrow keys nudge 1 unit, Shift+arrow 5. Corner handles sit just outside the bounds; Shift keeps proportions, Alt/Option resizes about the centre, Shift snaps rotation to 15°. Alt-drag leaves a copy with a new id at the origin and moves the original. Cmd/Ctrl+D offsets its copy by 10 units.
- **Arrows.** An endpoint binds when released on or just outside an outline, not deep inside it; Cmd/Ctrl suppresses binding; bound endpoints follow moved shapes. Double-clicking an arrow adds a bound label.
- **Ordering.** Cmd/Ctrl+] and Cmd/Ctrl+[ move one step; the context menu's Bring to front and Send to back work. The Help-listed Cmd+Option+] did not reorder under scripted Chromium input, here or in plain 0.17.6; real-keyboard behavior is unverified.
- **Camera.** Scroll is stored in scene units: `sceneX = (clientX − offsetLeft) / zoom − scrollX`. Cmd/Ctrl+wheel zooms about the pointer; Space-drag, middle-drag and the hand tool pan; Shift+1 fits all, Shift+2 the selection; pinch zooms.
- **Rendering.** Two stacked canvases (static and interactive). Each element carries a `seed`, so its hand-drawn stroke is stable across zoom and selection. No frame-rate claim is made beyond the measured large-scene row.
- **Data.** Elements are plain objects in array (z) order. `version` increments on change; `versionNonce` is regenerated. Text has `containerId`; arrows have relative `points` and `startBinding`/`endBinding`. Copy writes an `excalidraw/clipboard` JSON payload. The image tool uses the File System Access picker in Chromium; dropping an image file inserts it too.
- **Pointer cancellation.** 0.17.6 drops the cancelled pointer but leaves an in-progress shape unfinished, so the next tap completes it.

## 2. Integration requirements (this page, pinned to 0.17.6)

- Load the vendored build and its fonts from `vendor/`; nothing from a CDN. Load Nunito before measuring and drawing the first stage. It is the default for authored diagrams and new text.
- Each stage is drawn fresh from its authored graph with stable element ids (`study:n:<node>`, `study:e:<edge>`, `study:b:<boundary>`). Learner edits are stored as an overlay: field patches to authored elements, removed ids, the learner's own elements and their image files. Text size and bound-text position are engine-derived and never stored as edits.
- Stage navigation replaces the scene without an undo step and clears engine history, so undo never reaches another stage. Edits persist in the overlay.
- Keys typed in study controls (pickers, stepper, sidebar) stop at those controls; dialogs sit outside the canvas container.
- A trusted `pointercancel` during creation ends the gesture and discards the unfinished shape.
- Phone layout: no top-right controls (they would be clipped); study notes open from the main menu.
- Read-only `SimulatteStudyInspector` exposes scene, files, app state and workspace to scripted checks; it has no mutators.

## 3. Study semantics (ours, not Excalidraw's)

- The authored `simulatte.composableStudy` document is the authority. Replay of `insert`, `connect`, `disconnect`, `reconnect`, `replace` (with optional v2 label), `expand`, `rebind` (v2) and `merge` matches the [contract validator](../../tools/simulatte/study-contract.cjs) exactly; a stage whose stored graph differs is refused with its location.
- Engine state (camera, selection, history, element geometry) is presentation. Contracts, ports, ownership, subsystems and ordered operations are semantics and are never derived from drawing.
- Changes per stage are marked: added (blue), merged (green), changed (purple), removed (optional ghost). The Stage tab lists every operation in order.
- Expanded subsystems draw as an enclosing boundary; where that boundary would cover unrelated components, the parent is drawn as a box with dotted exposed-port mappings. Collapse and expand are view settings.
- A learner arrow between two components becomes a typed connection only through an out-port and in-port with the same contract in one containment scope; otherwise the reason is shown and the arrow stays a sketch. Grouping never declares a subsystem.
- Workspace files (`simulatte.studyWorkspace.v1`) hold the untouched document, overlays keyed by approach and stage, view settings and any unknown fields. Imports validate fully before replacing work. Browser autosave reports success or failure; export is the durable copy.

Stage navigation: Page Down advances and Page Up goes back within the selected approach. The buttons show PgUp/PgDn hints on desktop and tooltips include Mac laptop Fn+arrow equivalents. Typing, open dialogs, active drawing gestures and modified key combinations retain their native behavior.

Problem and approach selections always start at stage 1, while retaining independent edits. Explicit stage links and imported workspace views remain exact. Study mode toggles a centered guide containing every stage title and the current rationale. Notes defaults to a viewport-bounded 480px panel with high-contrast tabs and body text.

Embedded read-only observers may request `overview: true` with a `lucyd.live.workspace` message. This fits the complete displayed graph below the normal reading zoom for an architecture overview; ordinary study views retain their reading minimum. Camera fitting measures the displayed overlay geometry, so a screenshot reconstruction does not fit stale authored coordinates. This changes presentation only.
