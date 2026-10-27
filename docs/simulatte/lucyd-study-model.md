# Lucyd design and study model

Lucyd starts with a blank editable design. Choosing a problem selects its prompt;
Play solution opens an authored approach. Previous/Next retain independent edits
for each approach and stage. Back to my diagram restores the user's architecture.
Saved browser sessions include these public study snapshots; private snapshots
are included only in encrypted saves, backups and exports.

`public/data/system-diagram/problems.json` is the public authoring authority.
`problem-model.js` validates the `simulatte.lucydProblems.v2` collection:

```text
problem: id, title, description, optional attribution, classified provenance,
         ordered followups[], explicit solutions[]
solution: id, title, boundary, optional workload, ordered stages[]
stage: id, title, explanation, exact diagram, optional challenge and tradeoffs
```

Attribution is metadata and does not select a separate runtime. Published exercises
require the linked company source; candidate reports remain reports; authored
practice never implies a company verified the question or architecture. Eight
sourced prompts currently have no authored solution and retain `solutions: []`.
Thirty-one public problems include fifteen attributed prompt records and sixteen
existing generic practice designs. Twenty-four approaches contain forty-eight
runnable stages. The additional social-feed approach reuses its established
fan-out-on-read stage rather than inventing an answer to an unsolved sourced prompt.

Run `node tools/simulatte/build-lucyd-compat.cjs` after editing canonical content.
The older prompt/journey/solution registries and diagram exports are compatibility
outputs, verified by the same command with `--check`. No runtime fetches those
registries for study selection.

Every multi-stage solution pins source IDs, class parameters, seed and horizon.
Each stage starts a fresh engine. This is a replay of configured demand, not a claim
that closed-loop clients issue every request at identical times after different
responses. Exact matched-arrival comparisons still require actual trace evidence.
Faults and repairs injected through Failures are recorded at simulation time and
participate in runner replay verification. Source tests execute each stage and
require useful successful requests as well as structural validity.

After unlock the encrypted collection uses the same v2 problem model and chooser.
Legacy private v1 exercises normalize to one approach and one exact diagram stage.
The shipped collection has been re-encrypted in v2 while preserving its existing
key-derivation salt, so earlier encrypted browser saves retain compatibility.
Notes remain inside ciphertext. Lock unregisters private problems and clears
reference diagrams, stage snapshots, histories, request details and playback.
The deployment child refuses plaintext inspection/export of private designs.

## Design levels

The intended progression has six levels in one design: 0 Intent, 1 Conceptual
architecture, 2 Executable simulation, 3 Implementation contracts, 4 Deployment,
and 5 Operation. Observations inform every level. This is not a six-phase compiler
or six separate editors, and it does not change the fixed eight compilation phases.

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
