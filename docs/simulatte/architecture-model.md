# Shared architecture model

Owner: [architecture-model.js](../../public/simulatte/system-diagram/architecture-model.js) and [architecture-adapters.js](../../public/simulatte/system-diagram/architecture-adapters.js). Evidence: [architecture tests](../../tests/architecture-model.test.cjs).

The Lucyd simulation editor (`/system-diagram`) and the Excalidraw study workspace (`/lucyd`) read one versioned model, `simulatte.architecture.v1`. Each authored format converts to it and back without loss, so either view can open the other's approaches. Canonical sources stay where they are: `problems.json` for runnable approaches and the [composable study documents](composable-study-contract.md) for design approaches. Conversion happens when a problem opens; there is no third generated copy.

## Shape

| Record | Holds | Never holds |
| --- | --- | --- |
| `definitions` | Contracts, versioned components with typed ports, boundary bindings for expanded subsystems | Layout or run settings |
| `graph` | Node identity, label, component reference, containment (`parentId`, `boundaryId`, `lineageIds`), groups, typed connections | Positions, kernels, parameters |
| `simulation` | Optional binding: per-node simulator class, parameters and overrides; per-edge parameters; seed, horizon, faults, user classes, subsystem definitions | Semantics a view could change by drawing |
| `presentation` | Per-view layout (`lucyd`, `study`): positions, group frames, notes, camera | Anything that affects results |

Study records (`simulatte.architectureStudy.v1`) group one problem's approaches from both sources. Each solution keeps its origin, authored metadata, ordered stage commands and the exact stage model.

## Shared commands

`insert`, `remove`, `connect`, `disconnect`, `reconnect`, `replace`, `expand`, `rebind`, `merge`, `relabel`, `regroup`, `setGroups`, `move`, `bind`, `unbind`. Editing applies one command and validates the result. Stage replay applies a stage's commands and validates once at the end, as the study contract does. Snapshot catalogues derive their commands with `diff`; replay must reproduce every stored stage graph.

Simulator ports use the contract `*`, which accepts any design contract; the simulator validator still checks payload types. Lifted simulator connections use contract `lucyd.message` and mode `message`.

## Views

| Conversion | Result |
| --- | --- |
| `fromSystemDiagram` / `toSystemDiagram` | Exact for every v4/v5 stage. Lowering refuses while any component lacks a binding; expanded boundaries route through exposed ports to bound children. |
| `fromStudyDocument` / `toStudyDocument` | Exact for every composable study document. |
| `toDesignDiagram` / `fromDesignDiagram` | Projects a design graph into v5 unbound responsibilities for the simulation editor. Study IDs that the simulator cannot use are mapped; a repeated port pair gets alias ports. Positions, labels, removals, refinements and new simulator nodes map back. |

The simulation editor appends each study approach as `<title> (design)`. `?problem=L004&approach=design-push` opens one directly, and the study workspace menu links to the approach on screen.

## Limits

- The study workspace does not yet draw Lucyd's runnable approaches; it links to them in the simulation editor.
- Edits made to a design approach in the simulation editor stay in that editor's branch state; they are not written back into the authored study document.
- Alias ports for repeated port pairs map back to one study port, so refining both aliases to different simulator ports keeps only one binding.
- Converting a design approach establishes structure only. Simulation needs every responsibility bound and produces synthetic results.
