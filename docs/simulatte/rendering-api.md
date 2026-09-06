# Rendering API

Owner: [shared rendering contract](../../public/shared/render/CATSCAN.md).
Implementation: [renderer-session.js](../../public/shared/render/renderer-session.js).

The four scene renderers expose the same session lifecycle. They retain their
own compiled inputs and evidence formats. This is a rendering API, not a
Unity/Unreal-compatible engine, editor, physics API, or asset importer.

## Session lifecycle

```js
const session = rendererApi.createSession({ canvas, scene, signal });
await session.ready;
session.render(frame);
const receipt = session.receipt();
if (session.capabilities.capture) await session.capture();
await session.dispose();
```

`status().state` is `initializing`, `ready`, `failed`, or `disposed`.
Calls before readiness, after failure, or after disposal throw. Initialization
failure rejects `ready`. Disposal is idempotent, aborts initialization, and
releases late allocations. A device failure invalidates the session; an
asynchronous capture cannot return successfully after invalidation.

`capabilities` explicitly declares `setScene`, `render`, `resize`, `setCamera`,
`pick`, `capture`, and `receipt`. Unsupported operations throw
`renderer_operation_unsupported`. No renderer silently switches GPU backends.

## Scene adapters

| Factory | Creation input | Update and frame input | Optional operations |
| --- | --- | --- | --- |
| `SimulatteAutonomyCanvas.createSession` | `SimulatteWorldRenderScene.create(worldModel, options)` | `setScene({ presentations, ...settings })`; `render({ snapshot, receipt, timeMs })` | resize, camera, capture |
| `SimulatteWebGpuRenderer.createSession` | canvas and renderer options | `setScene(exactPhase6RenderExecutionInput)`; `render({ scene, timeMs })`, with scene omitted to reuse it | resize, pick |
| `SimulatteRecursiveWorldWebGpuRenderer.createSession` | `SimulatteRecursiveWorldScene.compileScene(worldSpec)` | `render({ observation, timeMs })` | resize, camera, capture |
| `SimulatteTierSceneRenderer.createSession` | canvas | `setScene({ tier, data, view, drawOverlay })`; `render()` | resize, camera, capture |

World and Recursive World geometry is compiled at creation. Create a new
session to replace that base scene. World `setScene` updates plugin presentation
data, not the governed world. Create consumes the exact phase-6 artifact and
returns its native phase-7 output. Its pixel evidence remains governed by the
phase-7 readback and phase-8 proof path, not a generic screenshot shortcut.

World camera input selects exactly one `targetId` or `mode`. Recursive camera
input names a `targetId` plus view-controller transition settings. Tier cameras
accept finite `zoom`, `panX`, `panY`, `rotX`, `rotY`, and `rotZ`; zoom is positive.
Tier `resize({ width, height })` sets backing dimensions. GPU adapters resize
from canvas layout and their configured pixel ratio.

Applications own animation loops, fetching, controls, and HUDs. World sessions
render on explicit calls by default. The legacy World factory preserves its
automatic animation loop. Existing World, Create, and Recursive factories and
their native interfaces remain available with an attached `.session`.

## Add geometry without editing GPU execution

[mesh-library.js](../../public/shared/render/mesh-library.js) validates and
detaches immutable, indexed-by-ID triangle-list assets. Each mesh declares
`id`, `positions`, optional `normals`, and optional material defaults. Positions
must fit float32, triangles must be nondegenerate, and declarations are bounded.
This is not a glTF loader or a programmable shader interface.

```js
const meshes = [{
  id: 'sail',
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  material: { color: [0, 1, 1, 1], roughness: 0.4 },
}];
const scene = SimulatteWorldRenderScene.create(worldModel, { meshes });
const renderer = SimulatteAutonomyCanvas.createSession({ canvas, scene });
```

World actor geometry can use `kind: 'sail'` through the declared asset library.
Built-in actor IDs cannot be replaced. Geometry extensions remain isolated to
their scene; they do not modify a global registry. Upstream governed plugin
presentation validation still owns which actor declarations are admitted.

Recursive render programs use `simulatte.recursive-render-program/v2` to declare
`meshes` and primitives shaped as
`{ id, kind: 'mesh', meshId: 'sail', center: [0,0,0], size: [1,1,1] }`.
Missing assets and attempts to replace `box` or `sphere` fail. Version 1 retains
its existing box, sphere, and polyline contract. Recursive rendering consumes
mesh positions and color; World also consumes normals and material lighting.

## Implement another backend

Provide one adapter to `SimulatteRendererSession.create` with `backend`,
`capabilities`, and `initialize({ signal, fail })`. Initialization returns the
declared methods plus `dispose`. Report terminal device errors through `fail`.
Release partial resources if initialization fails, and honor the abort signal.
Scene validation and receipts remain adapter-owned. No shared lifecycle code
needs to change to add a backend.

## Reproduce checks

```bash
npm run test:renderers
npm run audit:renderers -- /tmp/simulatte-renderers-desktop 1100x700
npm run audit:renderers -- /tmp/simulatte-renderers-mobile 390x844
npm run audit:simulatte:browser -- --out /tmp/simulatte-world-renderers
```

The dedicated browser audit checks Create, Tier, and Recursive session rendering,
nonuniform captured pixels, custom-mesh submission, and disposal. It retains
the device, browser, source hashes, report, and captured images. The existing
World audit exercises its application, cameras, replay, and performance gates.
Neither command substitutes for human visual adjudication or deployment proof.
