# Lucyd design and study model

Lucyd starts with a blank editable design. Choosing a problem selects its prompt;
Play solution opens an authored approach. Previous/Next retain independent edits
for each approach and stage. Back to my diagram restores the user's architecture.
Saved browser sessions include these public study snapshots; private snapshots
are included only in encrypted saves, backups and exports.

`public/data/system-diagram/problems.json` is the public authoring authority.
`problem-model.js` validates the `simulatte.lucydProblems.v4` collection:

```text
problem: id, title, description, optional attribution, classified provenance,
         ordered followups[], explicit solutions[]
solution: id, title, boundary, decision, optional prelude and workload, ordered stages[]
stage: id, kind, title, explanation, challenge, observe[], exact diagram, checks[]
       optional tradeoffs and explicit workload experiment
```

Attribution is metadata and does not select a separate runtime. Published exercises
require the linked company source; candidate reports remain reports; authored
practice never implies a company verified the question or architecture. All thirty-one public problems have two authored approaches:62 public approaches
and496 runnable stages. Fifteen encrypted problems have30 approaches and240
runnable stages. Each of the92 approaches has eight runnable stages and a separate
optional conceptual prelude; the shipped collection contains92 preludes. That is
46 problems,92 approaches and736 runnable stages. Approaches differ in executable
kernels or connections, not only labels or numeric tuning. Decision metadata
states when to choose an approach and its costs. Source-compatible alternatives
retain the baseline commands; keyset/lease/provider protocols state their logical
comparison boundaries and extra coordination work.

Run `node tools/simulatte/build-lucyd-compat.cjs` after editing canonical content.
The older prompt/journey/solution registries and diagram exports are compatibility
outputs, verified by the same command with `--check`. No runtime fetches those
registries for study selection.

Every approach pins its baseline source IDs, class parameters, seed and horizon.
A stage that changes the input workload carries an explicit workload contract and
comparison boundary. Boundary-input and burst experiments do not claim identical
arrivals to baseline architecture experiments.
Each stage starts a fresh engine. This is a replay of configured demand, not a claim
that closed-loop clients issue every request at identical times after different
responses. Exact matched-arrival comparisons still require actual trace evidence.
Faults and repairs injected through Failures are recorded at simulation time and
participate in runner replay verification. Source tests execute each stage and
require useful successful requests as well as structural validity.

After unlock the encrypted collection uses the same v3 problem model and chooser.
Legacy v1/v2/v3 imports remain readable; published v4 problems require two approaches and eight runnable stages per approach. The new bounded command kernels replace the former generic web-service placeholders for data-structure practice.
The shipped collection has been re-encrypted in v4 while preserving its existing
key-derivation salt, so earlier encrypted browser saves retain compatibility.
Notes remain inside ciphertext. Lock unregisters private problems and clears
reference diagrams, stage snapshots, histories, request details and playback.
The deployment child refuses plaintext inspection/export of private designs.

## Design levels

Evolution has six layers: 0 Sketch, 1 Simulation, 2 Specification, 3 Deployment,
4 Operation and 5 System. Inspection depth is a separate axis: context, capabilities,
architecture, internals and implementation. A requirements stage uses the sketch
layer; the executable stages use simulation. These are not six editors or compiler
phases, and they do not change the fixed eight compilation phases.

A v4 document remains strict. Version `simulatte.systemDiagram.v5` adds optional
`intent: {outcome, users, constraints, success}` and `concepts[]`. A conceptual node
uses `classId: concept.<id>`; its definition declares `id`, `label`,
`responsibility` and ordered ports `{id, direction, payloadType}`. It has no kernel
or simulation parameters until explicitly refined. Dashed nodes and inspector
status show unbound responsibilities. Simulation refuses with the unresolved names.

Refinement adds `binding: {classId, ports: {externalPortId: concretePortId}}` to
the concept definition. Validation checks every mapping, distinct targets,
directions and declared payload types. Node and external port IDs, position and
links remain unchanged. A concrete class or version-pinned subsystem supplies
behavior. `diagram.executable()` translates a completely bound v5 design into
validated v4; execution/deployment never treats an unbound label as a service.
Independent conceptual instances should use distinct definitions when they need
different refinements. Editor commands and serialized documents preserve intent,
contracts and bindings through save/reload and undo/redo.

The optional [deployment extension](lucyd-deployment.md) owns implementation
bindings and manifests. Simulated concurrency and service time do not become
Kubernetes resource settings. Production behavior and measured feedback require
real implementations and separate observations.

## Stage acceptance and observations

`study-contract.js` rejects published problems with fewer than two approaches or
approaches with fewer than eight runnable stages,
missing challenges/observations, missing executable checks or repeated diagrams
whose only differences are names, labels, layout or notes. Optional preludes contain v5 intent and do not count as runnable stages.
Executable stages retain strict v4.
Details exposes What to observe and Check this stage using actual engine output;
checks are pending/running until the horizon completes. Manual edits can fail
a reference check without being discarded. Node records expose the actual nested
command/result JSON on demand.

The study session records stage identities and curriculum version4. Legacy
v2/v3 index-based branch edits map through retained stage identities;
private session contents remain encrypted. Private conceptual drafts are separate
from executable study stages and keep their original schema.

`classes/study.json` and the three `kernels-study-*` packs own bounded command
models for cache/search, pagination, versioned documents, lazy pipelines, indexed
text, ordered prefix rules, comment lexing, queues, counters, WAL recovery,
optimistic metadata commits, task dependencies and tenant slots. Inputs come
from `study-commands.js`; expected results stay in tests and authored checks.
The realtime chat path adds connection sessions, expiring presence and parallel
fan-out to two device inboxes. A disconnected device misses a pushed message;
a later cursor read recovers it from ordered history. Delivery and durable
acceptance remain distinct.

These finite models are not thread-safety proofs, distributed consensus, real
heap-loss/disk guarantees or production implementations. Fault retention/reset
behavior is explicit per kernel; timing parameters remain synthetic assumptions.

## Study layout and request inspection

The Components rail and the Properties rail share one two-state rail component,
with an expanded drag width up to 360px. Algorithm exercises have a separate category. Problem selection still
starts blank; a worked approach begins with a conceptual sketch. The execution
dock alone owns Simulate. Approach selection and full explanations live in
Details; Properties opens from the header. Node names wrap, and connection
captions avoid node bodies or remain available on selection.

Mobile uses a two-line caption and a whole-graph overview. Larger architectures
need touch pinch and pan for readable component details. Fit reserves the caption,
rail and execution dock instead of hiding nodes behind them. Request rows show
operation and endpoints; selecting one exposes retained input, structured results,
attempts and effects. Opening Requests pauses playback for stable inspection.
Public locked collection labels do not identify the private interview material.

## Structural and workload evidence

`tools/simulatte/compare-lucyd-approaches.cjs` compares fresh no-fault executions
of each final architecture. Its bounded graph signature ignores labels, instance
IDs, layout and numeric policies; different algorithms have separately tested
executable kernels. This is structural evidence, not a proof that an architecture
is best. Source identity hashes distinguish38 identical configured-source pairs
from eight protocol/policy comparisons. Closed-loop arrival times remain response
dependent, and no production speedup is inferred. Private comparison output
omits kernel names, workload hashes and per-problem metrics.
