# Simulatte Agent Instructions

`simulatte/` hosts the Simulatte web experience on Firebase Hosting.

## Purpose

- Maintain the static site under `public/`.
- Keep interaction and presentation code simple and browser-first.
- Preserve a fast deploy path through Firebase.
- Follow [STYLE_GUIDE.md](STYLE_GUIDE.md) for Simulatte phase contracts,
  browser runtime style, receipt design, rendering boundaries, tests, and docs.

## Core Product Responsibilities

Simulatte owns the complete natural-language-to-pixels path. Treat all of these as
release responsibilities:

- Human intent fidelity: preserve prompt entities, counts, attributes, part bindings,
  materials, relations, poses, environments, actions, and negation through every phase.
- Correctness and accuracy: accept, reject, and rank evidence honestly. Never fabricate
  model work, provenance, construction support, or visual proof.
- Visual quality: required prompt obligations must be recognizable in rendered pixels.
  Fields present only in JavaScript objects do not prove visible output.
- Data quality: lexicons, indexes, construction cards, manifests, schemas, hashes,
  provenance, and evaluation sets are product-owned contracts with coverage checks.
- Performance and efficiency: measure and reduce prompt latency, model work, memory,
  candidate volume, cache misses, graph work, render cost, and main-thread blocking
  without weakening semantic or visual results.

A faster path is not an improvement when it performs less required work, loses prompt
evidence, lowers retrieval recall, changes output correctness, or reduces visible
obligation coverage.

## Prompt-To-Pixel Win Condition

- Extract a machine-checkable obligation ledger from the user's language.
- Preserve each required obligation through the exact eight phase boundaries.
- Settle obligations against actual render receipts and pixels in Phase 8.
- Surface unsupported concepts and failed visual obligations instead of drawing a
  plausible substitute and calling it complete.
- Use human review for recognizability and perceptual quality where machine checks are
  insufficient. Bind that verdict to the prompt, build, scene packet, and screenshot.

## Algorithm And Model Contract

- Debug and optimize the named phase boundary using its actual input, output, timing,
  candidate counts, cache state, and receipts.
- Deduplicate equivalent retrieval queries while preserving their source-span mapping.
- Batch independent embedding work when the provider supports batching. Do not reload
  tokenizers or model handles for work that can reuse a proven compatible handle.
- Retrieve for high recall, apply typed filters only when they cannot remove a valid
  answer, and rerank the smallest candidate set justified by measured ranking quality.
- Key caches by every behavior-changing identity, including model, dtype, dimensions,
  index content hash, normalized query, ranking policy, and construction policy.
- Record retrieval depth, candidates before and after each filter, recall-sensitive
  metrics, reranker work, latency, memory, cache mode, and model reuse.
- Canonicalize one semantic node per prompt concept before graph composition. Preserve
  typed edges instead of inventing adjacency relations.
- Use indexed maps and sets for stable lookups, bounded deterministic search for
  construction selection, and typed constraint solvers for spatial composition.
- Use inverted indexes for token retrieval and bounded top-k selection when measured
  input sizes make repeated catalog scans or full sorts materially more expensive.
- State input bounds and expected complexity for graph or search code whose cost grows
  with prompts, candidates, entities, edges, parts, or construction attempts.
- Heuristics may break ties or prune proven-impossible candidates. They must not
  override stronger prompt evidence, model evidence, exact counts, or typed relations.
- Gate behavior-changing heuristics against an appropriate control lane on the same
  inputs. Keep the heuristic only when receipts show a relevant accuracy, quality, or
  performance gain without weakening another release responsibility.
- Choose concurrency from measured device capacity and memory use. GPU resources from
  one device must never be reused with another device.
- Use WGSL for settled data-parallel numerics only when a CPU-reference parity gate
  verifies the same work. Keep semantic decisions whose receipts must explain parsing,
  retrieval ranking, graph synthesis, construction, or layout in inspectable JavaScript
  contracts. Phase 3 may call pinned Doppler GPU lanes for similarity numerics; do not
  add bespoke retrieval WGSL.
- Benchmark cold load, warm cache, model reuse, retrieval, reranking, graph compile,
  VisualIR compile, first frame, and settled Phase 8 proof as separate costs.

## Routing Rules

- Primary editable surface: `public/`.
- Hosting configuration lives in `firebase.json` and `.firebaserc`.
- If future nested `AGENTS.md` files are added, nearest-file precedence applies.

## Guardrails

- Read [STYLE_GUIDE.md](STYLE_GUIDE.md) before non-trivial edits.
- Keep assets and links deploy-safe for static hosting.
- Prefer relative paths for site resources.
- Avoid adding server/runtime assumptions unless explicitly requested.

## Delivery Expectations

- Changes should run directly in a browser from the hosted `public/` output.
- Keep pages functional on desktop and mobile.

## Intent-First Operations

- Treat Simulatte intent as the strict browser simulation pipeline product, not Gamma, Doppler, Reploid, or Poolday.
- If the user asks about app structure, start with the broad boundary: root `public/app`, `public/runtime`, and `public/world` own Autonomy at `/`; `public/blank/app` and `public/blank/pipeline` own the prompt-to-pixels compiler at `/blank/`; `public/data` owns shared and governed assets.
- Do not preserve confusing taxonomy when the user is simplifying. Use plain job names such as start, page, state, controls, and drawing when they match behavior.
- For pipeline work, respect the fixed phase order the user gives. Do not add split phases or reverse traversal unless asked.
- Phase N consumes the exact Phase N-1 output plus allowed runtime context only. Fix loose validators, side channels, audit fallbacks, and compatibility inputs as boundary bugs.
- When visuals look repetitive or semantically wrong, inspect the named phase boundary first and show the concrete artifact mismatch before broad rewrites.
- Training commands are operational commands: start the training workflow, report the server/browser URL or exact blocker, and keep the run state clear.

## No speculative engineering timelines

- Do not predict how long a coding, software-engineering, product-implementation, refactor, migration, launch, or similar work item will take. Avoid speculative delivery statements such as "1-2 weeks", "four months", or "a quick fix".
- Describe planned work through concrete deltas, dependencies, risks, and validation instead of calendar duration.
- This restriction does not apply to factual status for an already-running command, script, benchmark, training run, skill, deployment, or algorithm. You may report elapsed time, measured runtime, progress, and a grounded ETA when the active process exposes enough evidence.
- Do not invent an ETA for an active process. If it does not expose one, report its current phase, latest output, and whether it is still making progress.

## Pick the real fix

- when you find a correctness bug, the default is to fix it, not to relabel it
- do not use effort or scope framing ("non-trivial", "real engineering effort", "worth its own thread", "we'll address later") as cover for choosing a lesser fix
- do not propose "mark experimental", "add a TODO", or "rewrite the misleading comment" as a substitute for the actual engineering work when the underlying behavior is wrong
- if scope genuinely must be split, describe the concrete deltas and ask the user which path to take, do not pre-decide a smaller version
