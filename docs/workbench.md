# Data-first workbench

Intent owner: [GOALS.md](../GOALS.md). Browser owner:
[World application](../public/simulatte/app/CATSCAN.md).

## Workflow

1. Select Use your data from the hexagon homepage (#data), then paste CSV/JSON, open a file, fetch a public URL, or use the example.
2. Inspect source rows and confirm field mappings. Declare units, duration, and steps.
3. Prepare a WorldSpec. This does not execute the program.
4. Run. Inspect points, scrub the timeline, and read the output table.
5. Edit positions, velocities, labels, or parameters. Apply records user authority;
   Run executes the changed program and compares final points with the preceding run.
6. Replay executes again and compares the exact program and complete trajectory.
7. Export the program or result. Reimporting a program verifies its identity.

The initial adapter accepts flat CSV/JSON records with explicitly selected x/y
columns. ID and label columns are optional. Unmapped velocity is an explicitly
displayed constant zero. Mapped missing values, duplicate IDs, malformed records,
unsupported semantics, and excessive work reject. Input is bounded to 8 MiB,
10,000 rows, and 64 columns. Execution bounds are canonical in
[data-world-spec.js](../public/shared/contracts/data-world-spec.js).

## Reusable components

| Job | Owner | Consumers |
| --- | --- | --- |
| Bounded file, text, and URL decoding; source SHA-256 | [input-source.js](../public/shared/contracts/input-source.js) | Data workbench, Create import, profile import |
| Program identity, edits, export and import | [world-spec.js](../public/shared/contracts/world-spec.js) | All program workflows |
| Explicit table mapping and execution validation | [data-world-spec.js](../public/shared/contracts/data-world-spec.js) | Workbench preparation and execution |
| Ordered stages, cancellation, stale-result rejection | [pipeline-runner.js](../public/shared/core/pipeline-runner.js) | Data execution; independently callable for typed pipelines |
| State evolution | [point-motion.js](../public/shared/core/simulation/point-motion.js) | Data execution and replay |
| Execution identity and comparison | [data-run.js](../public/shared/core/simulation/data-run.js) | Initial run, edited run, replay |
| Scene drawing, projection, picking and resize | [point-scene-view.js](../public/shared/render/point-scene-view.js) | Data scene inspection |
| Draft state and downloads | [program-editor.js](../public/shared/design/program-editor.js) | Workbench, Create editor, profile editor |
| Bounded, text-only table rendering | [data-table.js](../public/shared/design/data-table.js) | Source preview and output inspection |
| Page coordination | [data-workbench.js](../public/simulatte/app/data-workbench.js) | Optional #data view |

The root eagerly loads only workbench code. Profile runtime loads on selection
through the existing build-bound loader; selected plugins still pass integrity
checks. Prompt compilation retains Runtime, Language, Retrieval, Grounded Intent,
Simulation, Visual, Render, and Scene Proof in exactly that order. These are not
renamed into the data pipeline's stages.

## Evidence and limits

The data adapter models constant velocity in two dimensions. It does not infer
forces, collisions, scientific meaning, or safety from a table. It explicitly
uses Canvas 2D; this is not a WebGPU fallback or a Doe execution claim. Equal
coordinate distances retain equal screen scale, with bounds fixed across the
trajectory. Coordinates remain accessible in the table.

Data execution receipts are not WorldProof. Exact replay demonstrates repeated
execution agreement, not independent scientific validation or visual recognition.
Imported prompt/profile WorldSpecs require their declared runtime; the data
adapter rejects them rather than executing a different interpretation. Their
existing editors and domain-specific controls remain, sharing the input reader,
program contract, draft, and export primitives. They have not all migrated onto
the data pipeline runner or point renderer.

User files stay local. Fetch URL is explicit, omits credentials and referrers,
requires server CORS permission, and bounds streamed bytes. Reading input does not
activate governed data or deploy a release. Existing governed acquisition and
immutable artifact storage remain separate, with their existing verification gates.

## Validation

```bash
node --test tests/data-workbench.test.cjs
npm run audit:workbench
npm run check:fast
npm test
```

The browser audit retains desktop/mobile screenshots, actual downloaded programs,
reimport/replay results, malformed-input recovery, route loading, and build identity.
Local verification does not establish deployed state or human visual acceptance.

Browser audits share [browser sessions](../tools/simulatte/browser-session.mjs)
for executable selection, startup, bounded diagnostics, and cleanup. Domain
probes and verdicts remain separate. The visual audit separates
[page setup](../tools/visual-audit-page.mjs),
[execution](../tools/visual-audit-run.mjs),
[artifact inspection](../tools/visual-audit-diagnostics.mjs),
[pixel measurement](../tools/visual-audit-pixels.mjs), and
[verdicts](../tools/visual-audit-report.mjs).

Application coordination follows the same ownership rule:
[route mounting](../public/simulatte/app/app-shell.js),
[plugin presentation](../public/simulatte/app/city-plugin-session.js),
[run controls](../public/simulatte/app/city-run-controls.js),
[journey recording](../public/simulatte/app/journey-recorder.js), and
[prompt proof observation](../public/blank/app/prompt/prompt-proof-session.js)
have explicit inputs and lifecycle boundaries. These modules do not change the
simulation algorithms or proof policies they coordinate.

The data and visual audits retain a recognized previous output directory under
a unique sibling name and record its path in the new report. An unrecognized
nonempty output is refused, not erased. Dated results, source snapshots, rejected
candidates, and human reviews remain evidence, not duplicated implementation.
