# Blank core

One shared library, separate products. Blank/Create, the World data workbench,
and the other simulations retain their own UI, domain policy, datasets, and
model or rendering adapters.

## Onion boundaries

| Layer | Owns | Must not depend on |
| --- | --- | --- |
| Domain contracts | WorldSpec identity, authorship, compiler envelopes | Pages, loaders, providers |
| Runtime | Ordered plugins, cancellation, stale-result rejection | Product selection or UI |
| Capability adapters | Bounded compiler execution, data simulation, renderer sessions | Application boot |
| Products | Domain plugins, permitted resources, controls, observation | Another product's page lifecycle |

Canonical implementations are in this package. Existing classic-script paths
are generated compatibility builds, not separately maintained algorithms.
The compiler's local model-to-phase adapter stays with Blank; GPU renderer
backends and profile-specific physics stay with their owning products.

## Public surface

| Import | Public operations |
| --- | --- |
| @simulatte/blank-core | createRuntime |
| @simulatte/blank-core/compiler | createCompiler, compilerContract |
| @simulatte/blank-core/world | parseWorldSpec, validateWorldSpec, serializeWorldSpec, editWorldSpec, worldSpecSchemaURL |
| @simulatte/blank-core/data | decodeInput, compileDataWorld, createDataSimulation, compareDataRuns |
| @simulatte/blank-core/render | createRendererSession |

Execution instances expose run, cancel, close. The renderer exposes only its
declared drawing operations, readiness, status, and close. Internal factories
are deliberately absent from package exports.

Native ESM imports require no globals, application boot, build step, DOM,
signaling, account, model download, or repository-relative dependencies.
Importing an entrypoint does not perform I/O. Web Crypto is required when a
consumer requests hashing or a bound compiler operation.

## Plugin contract

A runtime plugin has id, validateInput, run, and validateOutput. Validators may
be async; throwing or returning false rejects the boundary. run receives only
the preceding validated output and { runId, signal }. Product composition
explicitly supplies the ordered plugin array and injects needed capabilities.
There is no global registry, service locator, discovery, or code-install API.

createRuntime requires explicit onProgress and yieldTask ports. The scheduler
does not advance simulation time. Results contain runId, output, and ordered
artifacts. Errors retain the failed stage and earlier completed artifacts.
Containers are frozen; domain contracts own immutable payload snapshots.

The compiler additionally requires eight ordered phase implementations, a
versioned policy, a producer identity, and per-run declared resource handles.
It owns deadlines, residency and evidence bounds, exact predecessor binding,
lease lifetime, and publication guards. Plugins own their numerical, model,
or rendering operations. compilerContract describes the fixed protocol.
The package does not include pretrained weights or choose models.

## Data consumer

```js
import { decodeInput, compileDataWorld, createDataSimulation }
  from '@simulatte/blank-core/data';
import { serializeWorldSpec } from '@simulatte/blank-core/world';

const input = await decodeInput(csv, { name: 'positions.csv' });
if (input.kind !== 'table') throw new Error('Expected tabular input');
const program = compileDataWorld(input, {
  mapping: { id: 'id', label: null, x: 'x', y: 'y', vx: 'vx', vy: 'vy' },
  duration: 10, steps: 100, units: 'm',
});
const simulation = createDataSimulation({ onProgress: reportProgress });
const result = await simulation.run(program);
const exportedProgram = serializeWorldSpec(program);
await simulation.close();
```

This adapter is bounded, constant-velocity 2D point motion, not a general
physics solver. Its receipts explicitly retain scientificValidation:
not-performed and visualRecognition: not-reviewed. Other products provide
their own simulation plugins; they do not inherit this domain.

examples/index.html uses the actual packaged data and WorldSpec APIs for
preparation, execution, user edits, and replay comparison without application
imports. It is an executable consumer, not a passing acceptance report.

## Ownership

Instances have independent run state and cancellation. Valid new runs supersede
earlier runs on the same execution instance. Cancellation prevents publication,
not arbitrary external effects. Plugins must cooperate with cancellation and
retain leases until their submitted work settles. close drains runtime plugin
promises; a never-settling plugin needs host-owned isolation or termination.
Compiler phase deadlines cannot forcibly preempt JavaScript or GPU work.

The host owns borrowed devices, model sessions, storage, and callbacks.
Renderer adapters own their allocations and disposal. Neither signatures,
plugin agreement, nor deterministic replay establishes scientific validity.

Plugins are trusted application code. This is not a sandbox or permission
system for downloaded code. Products supply authorization and isolation.

## Compatibility and artifacts

The package includes ESM, declarations, the WorldSpec schema, and generated
classic/CommonJS assets. Existing pages consume the library's classic build
through preserved paths. tools/sync-blank-core-compat.mjs projects the canonical
factory bodies into those builds; it contains no simulation algorithms.
The runtime entrypoint generator invokes it, so normal entrypoint freshness
checks also reject stale library projections.

The schema's canonical source remains public/shared/contracts/world-spec.schema.json;
the package copy is generated. All packaged runtime imports remain internal.
No bundler, transpiler dependency, or runtime compilation is required.

Publication and deployment are separate operations. From the repository root,
`npm run check:blank-core` packs the allowlisted files, installs that archive in
a clean temporary consumer, verifies every public entrypoint and the hidden
internal boundary, and executes runtime, data/edit/replay, and renderer
lifecycles. Existing product regressions remain separate acceptance layers. A
passing package check is not a qualified-release or deployment claim.
