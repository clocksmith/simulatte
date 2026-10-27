# Composable study solutions

Owner: [study contract validator](../../tools/simulatte/study-contract.cjs).
Authoring: [study-solution-author.cjs](../../tools/simulatte/study-solution-author.cjs).
Generated entrypoint: [manifest.json](../../public/data/system-diagram/composable-solutions/manifest.json).

## Interface handoff

Consume `simulatte.composableStudy.v1`. This is the shared authoring contract for both content batches. The accompanying `components.json` resolves versioned base definitions. `problem.schema.json` describes the shape; the validator also checks references, typed endpoints, containment and exact operation replay.

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
- `merge`: consume distinct nodes in one containment scope, retain their IDs in `lineageIds`, reconnect external edges, and remove internal edges. Expanded subsystems require explicit boundary migration; do not flatten them implicitly.

The authoring helper projects cross-boundary links through explicit exposed ports. Stored JSON includes those mappings. Consumers must route through them instead of connecting directly into a collapsed subsystem. Layout coordinates are suggestions; there is no visual-quality claim from graph validation.

## Content-owner handoff

Author the first five problems as `study-content-*.cjs` modules beside the helper, exporting pure problem-building functions. Keep existing stage explanations and code using the optional stage fields. Add typed contracts, explicit questions, given/when/then cases, and resolvable reference-test evidence. Adapt destructive expansions into identity-preserving subsystem refinements. Do not guess missing API or state semantics during conversion.

The first five problem owners retain L004, L003, L009, L011 and L013. The second batch owns L034, L032, L007, L005, L001, L010 and L014. L034 explicitly studies notebook snapshot/update/reconnect behavior; L032 explicitly adds saved filters to autocomplete. L008 remains billing subscriptions and L006 remains saved-search email alerts.

## Generate and verify

```sh
node tools/simulatte/build-study-solutions.cjs
node tools/simulatte/build-study-solutions.cjs --check
node --test tests/composable-study.test.cjs
node tools/simulatte/audit-composable-study.cjs
```

These are conceptual architecture documents, not `systemDiagram` kernel documents. The running Lucyd simulation catalogue is unchanged. Consumer integration, edited-workspace round trips and Excalidraw rendering need their own checks. No UI or deployment completion follows from generating this bundle.

The audit owns `artifacts/composable-study/audit.json`. Optional `--priority-archive <directory>` verifies the preserved first batch's reference tests and hashes; optional `--consumer <module>` verifies data parsing against a supplied interface adapter. Neither option establishes visual or clipboard behavior.
