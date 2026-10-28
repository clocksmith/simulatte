# Composable study solutions

Owner: [study contract validator](../../tools/simulatte/study-contract.cjs).
Authoring: [study-solution-author.cjs](../../tools/simulatte/study-solution-author.cjs).
Generated entrypoint: [manifest.json](../../public/data/system-diagram/composable-solutions/manifest.json).

## Interface handoff

Consume `simulatte.composableStudy.v2`. All twelve generated problems use this shared contract. The accompanying `components.json` resolves versioned base definitions. `problem.schema.json` describes the shape; the validator also checks references, typed endpoints, containment and exact operation replay. The validator retains v1 compatibility for its original operations. V2 adds explicit subsystem rebinding and optional replacement labels; content version `1` is independent of schema version.

The interface owns workspace state, editing, rendering, import/export and navigation. Keep authored solution documents intact within its workspace envelope. Editor settings, user edits and playhead do not belong at the root of this strict authored schema. Loading or exporting must not drop unknown workspace fields or silently repair invalid authored graphs.

The existing public `problems.json` remains the authority for problem IDs, prompts and interview attribution. These solution artifacts refer to its `Lnnn` IDs. `studyLabel` and `scope` describe explicitly authored study extensions, not replacement interview claims. Technical references are background citations.

| Field | Contract |
| --- | --- |
| `contracts[]` | Versioned request/response field descriptors; semantic type IDs connect compatible ports. Descriptors are design specifications, not executable JSON Schema validators for network packets. |
| `components[]` | Versioned reusable responsibilities, state ownership, typed ports and base definition references. |
| `subsystems[]` | Versioned exposed port mappings to direct internal components. |
| `solutions[]` | Alternatives with selection criteria, assumptions, tradeoffs, APIs, pseudocode and acceptance cases. |
| `stages[]` | Ordered question, forcing requirement, operations, exact graph, invariants and acceptance-case references. |
| `stage.explanation`, `notes`, `code`, `followupIds` | Optional stage-specific teaching material. Code blocks carry `id`, `kind` (`api` or `pseudocode`), `language`, `text`. Preserve them. |

Acceptance cases have `given`, `when`, `then`, `relatedRequirementIds`. A case is a specification unless it names actual `evidence: {kind: "reference-test", testFile, testName}`. Reference-model tests establish only their tested mechanism. They do not prove distributed deployment, latency or complete production correctness.

## Operations and identities

Start from `initialGraph`, then apply every stage's operations in order. Compare the result with that stage's `graph`. Do not reconstruct graphs from prose or infer missing connections.

- `insert`: add the supplied node, preserving its ID and definition version.
- `connect` / `disconnect`: add a fully typed edge or remove a named edge.
- `reconnect`: replace a named edge's endpoints/contract while preserving its ID and recording a reason.
- `replace`: preserve node identity and compatible ports while changing its definition. Record state migration explicitly.
- `expand`: retain the parent node as a subsystem boundary. Add children with `parentId`, internal edges and exposed port mappings. An expanded view may hide the boundary's box, but must retain its identity in data.
- `rebind` (v2): `{op, nodeId, subsystemId, reason}` changes only an already-expanded boundary's referenced binding definition. Keep the prior definition immutable for earlier stages. Validate the new mapping against current direct children and typed outer ports. Do not edit a shared subsystem definition in place.
- `merge`: consume distinct nodes in one containment scope, retain their IDs in `lineageIds`, reconnect external edges, and remove internal edges. Expanded subsystems require explicit boundary migration; do not flatten them implicitly.

The authoring helper projects cross-boundary links through explicit exposed ports. Stored JSON includes those mappings. Consumers must route through them instead of connecting directly into a collapsed subsystem. Layout coordinates are suggestions; there is no visual-quality claim from graph validation.

## Content-owner handoff

Both batches are integrated. `study-content-priority.cjs` exports the five priority builders. The preserved `priority-study-source/*.cjs` files are authoring intake, not another runtime contract. `study-priority-contracts.cjs`, `study-priority-guides.cjs` and `study-priority-repairs.cjs` own typed mechanisms, explicit experiments and engineering corrections. `convert-priority-study.cjs` lowers them into the same shared format as the second batch. Nothing requires the temporary scratchpad or local intake backup at build time.

The priority batch contains L004, L003, L009, L011 and L013, with ten approaches and 91 stages. The second batch contains L034, L032, L007, L005, L001, L010 and L014, with fourteen approaches and 112 stages. Total: twelve problems, twenty-four approaches, 203 stages. L034 explicitly studies notebook snapshot/update/reconnect behavior; L032 explicitly adds saved filters to autocomplete. L008 remains billing subscriptions and L006 remains saved-search email alerts.

The workspace owner must add `rebind` and `reconnect` to its replay adapter, accept the v2 schema, and apply `replace.label` when supplied. Load the manifest and listed documents instead of hard-coding seven files. Keep stage-specific user overlays in the workspace envelope. This delivery does not change drawing or controller files.

## Generate and verify

```sh
node tools/simulatte/build-study-solutions.cjs
node tools/simulatte/build-study-solutions.cjs --check
node --test tests/composable-study.test.cjs tests/composable-priority.test.cjs tools/simulatte/study-reference/*.test.mjs
node tools/simulatte/audit-composable-study.cjs
```

These are conceptual architecture documents, not `systemDiagram` kernel documents. They convert losslessly through the [shared architecture model](architecture-model.md), and the simulation editor opens each approach as unbound design stages; the runnable Lucyd catalogue is unchanged. Consumer integration, edited-workspace round trips and Excalidraw rendering need their own checks. No UI or deployment completion follows from generating this bundle.

The audit owns `artifacts/composable-study/audit.json` and its raw TAP receipts. Optional `--priority-archive <directory>` verifies the preserved first batch's reference tests and hashes; `--consumer <module>` verifies parsing; `--workspace <module>` verifies pure-data workspace round trips with separate stage overlays and preserved metadata. These checks establish no browser gestures, clipboard or file-download behavior.
