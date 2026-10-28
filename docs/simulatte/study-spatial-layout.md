# Study diagram composition

Owner: [study workspace](../../public/simulatte/system-diagram/study/CATSCAN.md).

The workspace at `/lucyd` projects the exact authored stage graph. Geometry is a presentation result, not an edit to the solution or its contracts. Old physical entrypoint URLs remain compatible.

[Spatial policy](../../public/data/system-diagram/spatial-policy.json) governs dimensions, clearance, routing costs and search limits. [Font metrics](../../public/data/system-diagram/study-font-metrics.json) derive from the vendored Nunito subsets. Unknown glyphs reserve one em; the browser audit separately checks restored text bounds.

## Composition

1. Build the union of one approach's component identities and projected endpoint pairs across its stages. ELK 0.12.0 lays out compound nodes with a fixed seed and stable ordering. A separation pass reserves routing clearance. The same identity retains its coordinates while the approach evolves.
2. Expanded subsystems enclose their children. Follow declared exposed-port mappings to render external arrows to the visible internal endpoint. Collapse projects those endpoints back to the visible boundary. No duplicate mapped boxes or extra mapping arrows are invented.
3. Assign separate attachment slots. Route orthogonal paths around component boxes, subsystem titles, prior labels and occupied connection segments. A bounded deterministic search penalizes bends and perpendicular crossings; it refuses coincident segments.
4. Wrap labels using actual font advances and reserve their bounds before routing subsequent connections. Labels remain native editable Excalidraw arrow labels. Component labels remain bound to their shapes.
5. Check unintended box overlaps, arrows through unrelated boxes or subsystem titles, label collisions, and coincident connection segments. Report perpendicular crossings separately; they are not junctions or a claim of planar graphs.

The camera keeps authored text at a reading zoom instead of shrinking an entire large architecture into tiny labels. Stages focus on changed components when a complete fit would become too small. Native pan, zoom and Fit all remain available. Learner overlays are preserved and are outside authored-geometry qualification; moving components can deliberately change their layout.

## Reproduction and publication

```sh
# Requires Python fontTools and Brotli; official third-party distributions are pinned by integrity.
python3 tools/simulatte/vendor-study-layout.py
node tools/simulatte/build-study-solutions.cjs
node tools/simulatte/audit-study-spatial.cjs
node tools/simulatte/audit-study-spatial.cjs --check
LUCYD_PLAYWRIGHT_MODULE=/path/to/playwright node tools/simulatte/audit-study-spatial-browser.cjs http://127.0.0.1:4173/lucyd
```

The source audit covers every authored stage and each individually collapsed subsystem. Its receipt hashes documents, policy, font metrics and geometry implementation. World deployment refuses stale or failing spatial proof; it does not rerun the campaign for unchanged inputs. The browser audit independently checks restored Excalidraw geometry and text bounds after real stage navigation. These are bounded machine checks, not a substitute for reviewing screenshots or proof of readability on every physical device.

The two new authored problem sets are L006 Saved-search email digests and L008 Recurring subscription payments. Each has two eight-stage approaches, explicit API/message shapes, state ownership, pseudocode, tradeoffs, technical background citations and acceptance scenarios. Their reference tests exercise bounded state transitions, not a real mail provider, payment processor or distributed deployment.

Default node/label sizes are 18/16px, with a minimum automatic reading zoom of 0.85. Text bypasses the upstream nearest-neighbor element bitmap cache and draws into the device-resolution canvas. Other element caching remains native. The workspace uses normal canvas image resampling instead of CSS pixelated scaling.
