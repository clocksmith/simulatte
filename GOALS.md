# Simulatte Goals

## Authority and status

This file owns Simulatte's durable product direction. These goals are not claims
that every contract or workflow is implemented today.

- [README.md](README.md) describes the current product and repository surfaces.
- [STYLE_GUIDE.md](STYLE_GUIDE.md) owns the eight-phase pipeline and engineering
  contracts.
- [docs/simulatte/experiences/README.md](docs/simulatte/experiences/README.md)
  records current profile implementation and evidence status.

## Product thesis

Simulatte compiles a bounded natural-language brief into a versioned,
declarative `WorldSpec` that a user can inspect, edit, execute, export, and
replay. Every run produces `WorldProof` that connects the original prompt and
subsequent edits to realized entities, dynamics, controls, safety decisions,
and rendered evidence.

Simulatte Create is the primary product. World profiles are governed
conformance packs that prove the same compiler and runtime contracts across
domains. Plugins extend those contracts through explicit capabilities.

The compiler must justify its ownership. Generating Three.js code, scene JSON,
or instructions for an established engine is an eligible control. Simulatte
owns compilation only where typed intent preservation, controlled editing,
governed execution, or bound proof provides a material advantage over that
control.

## Product object: WorldSpec

`WorldSpec` is the canonical public simulation program. It has:

- a schema and semantic version;
- canonical serialization and a content hash;
- source prompt and compiler configuration;
- entities, properties, quantities, relations, and negation;
- initial state and environment;
- dynamics, constraints, solvers, and terminal conditions;
- controls, events, and actions;
- safety rules;
- cameras, visuals, and presentation;
- governed-pack and plugin dependencies;
- seeds and required determinism classes;
- unsupported requirements and unresolved ambiguity;
- field-level provenance;
- validation, migrations, import, export, and compatibility checks.

Stable execution semantics are part of the artifact contract. A valid document
that changes meaning without a versioned migration is not a valid `WorldSpec`
implementation.

## Authorship and editing authority

After a user edits the compiled program, the prompt is no longer the sole source
of authority. Simulatte retains an append-only authoring graph containing:

- prompt-authored requirements;
- compiler inferences;
- user overrides;
- governed-pack contributions;
- plugin contributions;
- runtime-generated state.

Each authored field identifies its authority. User edits create patches that
record the author, target path, previous value, new value, rationale, and
affected obligations. Recompilation does not erase accepted overrides without
an explicit reconciliation decision.

The authored `WorldSpec` controls execution. Runtime state transitions do not
silently rewrite its declared intent.

## Primary user journey

The first complete product journey is:

```text
brief
  -> WorldSpec draft
  -> inspect and edit
  -> validate
  -> execute
  -> inspect proof failures
  -> targeted edit
  -> replay
  -> publish or export
```

The decisive milestone is one coherent round trip:

```text
prompt
  -> editable WorldSpec
  -> execution
  -> failed critical obligation
  -> targeted user edit
  -> successful replay
  -> bound WorldProof
```

Users see a result before they need to understand the internal phases. They can
still trace any object, relation, action, or failure through the exact phase
artifacts when they inspect it.

## Product structure

- Create owns prompting, `WorldSpec` editing, validation, execution, proof,
  replay, and export. The current Blank route is an implementation surface, not
  the long-term product identity.
- World profiles are conformance packs, examples, and execution proofs. They do
  not define separate product architectures.
- Governed packs contribute domain data and behavior through declared
  `WorldSpec` and runtime contracts.
- Plugins extend the compiler or runtime through explicit capabilities,
  provenance, budgets, and revocation.
- The runtime compiles, simulates, renders, and proves the authored artifact.

City, country, shipping, orbital, and star profiles support platform claims
only when they consume the same public `WorldSpec`, use the same edit, replay,
and proof workflow, and carry current-build evidence.

## WorldProof

Scene proof is one component of `WorldProof`. The complete proof separates:

1. Intent proof: critical prompt requirements are extracted or explicitly
   refused.
2. Semantic proof: accepted entities, relations, quantities, and negation retain
   provenance.
3. Compilation proof: `WorldSpec` lowers into valid simulation and visual
   programs.
4. Simulation proof: dynamics, constraints, invariants, and terminal conditions
   behave within declared tolerances.
5. Interaction proof: controls and events produce their declared state
   transitions.
6. Safety proof: safety gates run and their decisions are reproducible.
7. Visual proof: required visible obligations are recognizable in rendered
   evidence.
8. Replay proof: the declared build, assets, plugins, seed, and device class
   reproduce the required semantic and behavioral verdicts.

A screenshot does not prove dynamics. A state trace does not prove
recognizability. A receipt records evidence but does not turn one proof class
into another.

## Determinism classes

Determinism is a scoped contract, not a universal boolean.

| Class | Required meaning |
| --- | --- |
| Compiler deterministic | Identical declared inputs produce the same canonical `WorldSpec` hash. |
| Decision deterministic | Routing, selection, and safety verdicts match exactly. |
| Simulation reproducible | Fixed-step states match exactly or within declared tolerances. |
| Semantic render reproducible | Entity and obligation receipts match. |
| Pixel bounded | Pixel or perceptual differences stay within a declared policy. |
| Replay identified | Build, assets, plugins, runtime, seed, and device class are recorded. |

A profile declares and proves the classes it requires. Passing one class does
not imply the others.

## Improvement and causal diagnosis

The improvement loop remains phase-local. It identifies the earliest observable
divergence across Runtime, Language, Retrieval, Grounded Intent, Simulation,
Visual, Render, and Scene Proof. The earliest divergence is diagnostic evidence,
not automatic ownership of the defect.

Causal attribution uses artifact substitution:

1. Retain every artifact from the failing pipeline.
2. Replace the suspect phase output with a known-good artifact.
3. Replay all downstream phases.
4. Feed the suspect artifact into a known-good downstream implementation.
5. Compare both interventions with a frozen control.
6. Assign ownership only when the intervention changes the verdict.

Candidates run against separated train, selection, and held-out populations.
Frozen suites include exact counts, negation, relations, close semantic
distractors, unsupported concepts, behavior, and diverse layouts. Machine
checks cover requirement preservation, retrieval recall, graph validity,
dynamic and interaction settlement, replay, latency, and memory. Bound human
reviews cover recognizability, composition, and perceptual quality.

No aggregate score may hide a critical failure. A faster candidate that drops a
required entity fails. An attractive result that invents unsupported content
fails. Training data comes from adjudicated failure boundaries, user edits, and
human critiques.

## Initial market and value

The initial users are technical creators and developers building small,
interactive explanatory simulations. They need faster iteration than
hand-written browser simulation code and more inspectability than generated
images or video.

The first product wins by:

- turning a bounded brief into an editable program;
- exposing unsupported or ambiguous requirements;
- making targeted correction direct;
- producing a replayable browser result;
- retaining evidence for what changed and why.

Simulatte does not initially claim to replace general 3D creation tools,
scientific solvers, or enterprise digital-twin platforms. Vertical packs for
mobility, logistics, training, scientific visualization, and game prototyping
earn promotion after the compiler workflow is reliable.

## Governing metric

The north-star metric is:

> The percentage of a fixed, difficulty-stratified prompt population that
> produces a valid executable `WorldSpec` for which every critical obligation
> passes, unsupported invention stays below threshold, replay passes, and
> latency stays within budget.

The evaluation also reports these dimensions separately:

- requirement-extraction recall;
- refusal correctness;
- unsupported-content precision;
- semantic settlement;
- dynamic settlement;
- interaction settlement;
- safety settlement;
- visual settlement;
- replay success;
- latency and memory;
- edit-to-success cycles;
- retained human satisfaction.

Profile count and average obligation settlement are not success metrics by
themselves. Difficult prompts, critical failures, and unsupported concepts must
remain visible in the population and the report.

## Plugin and dependency boundaries

Pure declarative packs may run through schema and capability validation.
Executable third-party plugins require isolation, capability enforcement,
resource budgets, signatures, provenance, trust levels, and revocation before
they support marketplace claims. Manifest permissions alone are not a security
boundary.

Doppler may provide pinned local retrieval models. Doe may provide GPU
execution. Neither dependency defines Simulatte's product, and each remains an
explicit, replaceable lane with its own evidence.

## Compounding asset

The durable asset is the governed improvement corpus:

```text
brief
  -> extracted obligations
  -> compiler decisions
  -> WorldSpec
  -> user edits
  -> execution
  -> proof failures
  -> adjudication
  -> successful replay
```

This corpus binds intent, decisions, edits, execution, and verified outcomes.
It teaches which boundary failed, which intervention repaired it, and whether
the repair generalized. Prompts, screenshots, schemas, primitive libraries,
and receipt archives are useful inputs, but they do not compound without this
governed relationship.
