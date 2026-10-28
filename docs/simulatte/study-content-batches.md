# Remaining Lucyd content batches

Owner: [composable study contract](composable-study-contract.md). Current inventory: [generated manifest](../../public/data/system-diagram/composable-solutions/manifest.json).

There are 14 converted problems, 28 approaches and 235 authored stages. The canonical catalogue has 46 problem IDs, leaving 32. Use eight batches of four. Each ordinary problem needs two structurally different approaches with at least eight meaningful stages each. That adds at least 512 stages; preserving the current 235 would produce at least 747, not exactly 736. L002 needs a real project or explicitly illustrative worked examples, not invented personal experience.

| Batch | Assigned IDs | Focus |
|---|---|---|
| 01 | L012, L015, L017, L020 | Stories, presence, streaming chat and social-feed delivery |
| 02 | L018, L021, L027, L031 | RAG, agent recovery, tool/retrieval repair and reusable nested backends |
| 03 | L022, L030, L044, L045 | Partitioned counting, event-time processing, metadata transactions and DAG scheduling |
| 04 | L023, L024, L028, L029 | Permissions, scheduled ingestion, identity/approval and paired-record reconciliation |
| 05 | L016, L019, L026, L046 | Web scaling, global CDN, replica recovery and tenant compute quotas |
| 06 | L033, L035, L042, L043 | Query grid, CachedFile, concurrent TTL cache and WAL durability |
| 07 | L036, L037, L038, L039 | Lazy arrays, ropes, ordered firewall rules and comment lexing |
| 08 | L025, L040, L041, L002 | Slow subscribers, blocking queues, rate limiting and project architecture review |

Do not silently merge or renumber overlaps. Explain the distinct scope: L017 emphasizes streamed responses and cancellation rather than repeating L004's human messaging; L019 adds global delivery steering and regional failure beyond L010's playback; L020 needs a clearly authored ranking/freshness dimension beyond L011; L031 teaches versioned composition and contract evolution. Any added follow-up is authored practice, not a claim that a company asked it.

## Repository and mandatory reading

Use `https://github.com/clocksmith/simulatte.git`, not Gamma, 256one or Hatch. Work inside the Simulatte project. Read the nearest AGENTS and CATSCAN instructions before editing.

1. `AGENTS.md`, `STYLE_GUIDE.md`, `GOALS.md`, root `CATSCAN.md`.
2. `tools/CATSCAN.md`, `tools/simulatte/CATSCAN.md`, `tests/CATSCAN.md`.
3. `docs/simulatte/composable-study-contract.md` and `study-spatial-layout.md`.
4. `public/data/system-diagram/problems.json`: the assigned IDs, original prompts, exercise types, follow-ups and source provenance. Extract only the four assigned entries; it is a large file.
5. `tools/simulatte/study-contract.cjs`, `study-solution-author.cjs`, and `study-schema.cjs`: executable format and authoring helpers.
6. `tools/simulatte/study-content-notifications.cjs`: two complete newer examples. Also inspect `study-content-client-state.cjs` and `convert-priority-study.cjs` for composition and boundary identity.
7. `tools/simulatte/study-reference/` for bounded reference tests. `public/simulatte/system-diagram/study/composable-study.js` is the browser consumer, not a competing authoring format.

The accepted format is `simulatte.composableStudy.v2`. Do not invent another schema, a standalone Excalidraw-only format or an alternative component library.

## Each batch owns only its content

Create:

- `tools/simulatte/study-content-batch-01.cjs`, replacing 01 with the assigned batch number. Export exactly four zero-argument problem-builder functions.
- `tests/study-batch-01.test.cjs`.
- Unique `tools/simulatte/study-reference/batch-01-*.mjs` and `batch-01-*.test.mjs` files when testing mechanisms.

Do not edit the workspace, renderer, shortcuts, fonts, other batches, shared schema, validator, registry or generated manifest. Do not push or deploy a batch. The integrator registers its author module in `build-study-solutions.cjs`, regenerates catalogue JSON once, verifies all geometry and handles publication. This prevents eight patches from all changing the same manifest and registry line.

## Authoring acceptance

For every problem:

- Preserve its L-number and distinguish the original sourced prompt from authored follow-ups. Keep optional company attribution in the canonical catalogue. Technical citations support mechanisms, not interview provenance.
- State requirements, boundaries, assumptions and correctness conditions. Use primary technical sources and inline their URLs/support descriptions in the document's references.
- Supply two approaches with different structural tradeoffs. A timeout change or extra cache setting is a stage detail, not an alternative architecture.
- Give each approach at least eight stages. Begin with a small, nonempty request path. Grow the architecture through justified insert, expand, replace, merge, disconnect and reconnect operations where appropriate. Do not force every operation into every problem.
- Each stage needs its exact graph, ordered operations, question, reason, invariants and check IDs. Replay must reproduce the graph. Keep component identities stable; expansion retains a parent with explicit typed exposed-port mappings. Add a new immutable binding and rebind rather than retroactively changing earlier stages.
- Include typed request/response contracts, state ownership, API/data shapes, pseudocode, tradeoffs and given/when/then acceptance cases. Algorithms and APIs name real owner components in the final graph.
- Distinguish a specification claim from an executed reference test. Never label distributed correctness, durability, throughput or cloud behavior proven by a small in-memory test.
- Coding problems use data-structure state, ownership and concurrent transitions. Do not disguise a rope, lexer or blocking queue as a cluster of microservices. L002 must remain honest about which project facts are known.

## Checks before packaging

The batch test must import its own author module directly, because the shared builder deliberately does not register unmerged batches yet. For each exported builder:

1. Call `validateProblem(document, library)` from the shared contract and author modules.
2. Parse it with the browser `composable-study.js` adapter and verify the two approaches, meaningful stages and acceptance references.
3. Call `audit([document])` from `tools/simulatte/audit-study-spatial.cjs` and require `report.ok`. This checks every stage and each collapsed subsystem using the same layout and routing system as the workspace.
4. Execute the batch's reference tests and ensure every declared evidence name resolves to an actual passing test.
5. Inspect rendered representative diagrams, especially the busiest final stages. Source checks alone are not visual proof; record browser verification honestly if unavailable.

Do not weaken existing gates or hand-edit generated graphs to conceal replay errors. Report unresolved cases instead of asserting completion.

## Create one Git patch per batch

Use a separate checkout for each independent author. Follow direct-to-main locally; no feature branch is needed to create a patch. Do not place a second checkout inside the live Simulatte checkout.

```sh
git clone https://github.com/clocksmith/simulatte.git simulatte-batch-01
cd simulatte-batch-01
git switch main
git pull --ff-only

# Author the assigned four problems and their focused tests.
node --test tests/study-batch-01.test.cjs
# Run the exact reference test paths added by this batch as well.

git add tools/simulatte/study-content-batch-01.cjs \
  tests/study-batch-01.test.cjs
# Explicitly add only this batch's reference source/test files, if present.
git diff --cached --check
git commit -m "Author Lucyd study batch 01"
git format-patch -1 --stdout > ../lucyd-batch-01.patch
```

Replace 01 consistently for each batch. Keep all batch edits in that one commit. Supply the patch plus the four IDs, approach/stage counts, commands/results, base commit (`git rev-parse HEAD^`) and unresolved gaps. Do not send only a ZIP of rendered scenes or leave source files in a temporary scratchpad.

The integrator applies with `git am /absolute/path/lucyd-batch-01.patch`, adds `batch-01` to the author list, runs the shared builder and complete spatial audit, checks the browser, then commits and pushes generated output. Applied Downloads patches can be removed after the commit and content membership are verified.
