---
name: autonomy-data
description: Plan, fetch, backfill, verify, promote, compile, and activate Simulatte map, place, accessibility, amenity, safety-history, occurrence, region, or city data with immutable receipts and fail-closed capability gates.
---

# Autonomy data

Use this skill for any Simulatte request to add or refresh geography, places,
streets, buildings, sidewalks, crossings, ramps, bicycle parking, traffic or
mobility history, safety observations, occurrences, region packs, or cities.

Work from the Simulatte repository root. Read:

1. `AGENTS.md`;
2. `docs/autonomy/data-ingestion.md`;
3. `tools/autonomy/source-catalog-v1.json`;
4. the compiler that owns the target artifact.

## Non-negotiable boundary

Never let network acquisition write the hosted world. Execute these states in
order and report them separately:

1. planned;
2. fetched or backfilled to `artifacts/autonomy-data/`;
3. byte-verified;
4. authority, license, coverage, time semantics, and entry gate reviewed;
5. promoted to a new immutable `tools/autonomy/data-sources/` directory;
6. compiled as a candidate;
7. contract-validated;
8. activated by exact manifest identity and hash;
9. browser-audited;
10. deployed and live-verified.

Do not edit a promoted source directory. Do not call source availability a
routing capability. Do not let observed history become a map fact, live
condition, causal result, or safety ranking.

## Choose the evidence class

| Class | Examples | Authorized use |
| --- | --- | --- |
| `map_fact` | bike routes, buildings, park geometry, ramps, racks | frozen world or evidence index |
| `community_map_fact` | OSM highways and tags | attributed topology/context under its license and gate |
| `public_semantic_context` | place descriptions | offline descriptor/index construction, never test-derived labels |
| `observed_history` | crashes, counts, trips | dated aggregation, counterfactual, demand prior, or realism evaluation |
| simulation assumption | actor spawn, default signal timing, weather scenario | explicitly authored occurrence, never source fact |

If the requested source is absent from `source-catalog-v1.json`, add a catalog
entry with authority, license, request template, data class, temporal fields,
capabilities, and an explicit entry gate before fetching.

## Plan and fetch current sources

```bash
npm run autonomy:data:plan -- \
  --group GROUP \
  --snapshot-date YYYY-MM-DD

npm run autonomy:data:fetch -- \
  --group GROUP \
  --snapshot-date YYYY-MM-DD \
  --out artifacts/autonomy-data/GROUP-YYYY-MM-DD
```

Available groups include `world-core`, `pedestrian-topology`,
`place-semantics`, and `route-amenities`. Select one source with
`--source SOURCE_ID`. Use `--bounds south,west,north,east` only when the
receipt must intentionally override the catalog bounds.

## Backfill historical sources

Use first-of-month half-open intervals:

```bash
npm run autonomy:data:plan -- \
  --group safety-history \
  --from YYYY-MM-01 \
  --to YYYY-MM-01 \
  --snapshot-date YYYY-MM-DD

npm run autonomy:data:backfill -- \
  --group safety-history \
  --from YYYY-MM-01 \
  --to YYYY-MM-01 \
  --snapshot-date YYYY-MM-DD \
  --out artifacts/autonomy-data/safety-history-YYYY-MM-DD
```

`mobility-history` and `taxi-history` follow the same pattern. Before
compilation, declare timezone, publication lag, missing intervals, sensor or
zone identity, aggregation, spatial join, and the no-data rule.

## Verify and promote exact bytes

```bash
npm run autonomy:data:verify -- \
  --receipt artifacts/autonomy-data/NAME/fetch-receipt.json

node tools/autonomy/manage-autonomy-data.mjs promote \
  --receipt artifacts/autonomy-data/NAME/fetch-receipt.json \
  --target tools/autonomy/data-sources/IMMUTABLE-SNAPSHOT-ID \
  --accept-receipt-sha EXACT_RECEIPT_SHA256
```

Inspect the receipt and every promoted file. Promotion freezes source bytes;
it does not authorize a compiler claim or activation.

## Route to the owning compiler

| Artifact | Owner |
| --- | --- |
| Canonical NYC world and feature cards | `tools/autonomy/build-nyc-autonomy-world.mjs` and its split compilers |
| Region packs and seams | `tools/autonomy/build-region-packs.mjs` |
| Pedestrian ramp audit index | `tools/autonomy/compile-accessibility-index.mjs` |
| Bicycle-rack proximity index | `tools/autonomy/compile-route-amenity-index.mjs` |
| Reported-crash history index | `tools/autonomy/compile-safety-history-index.mjs` |
| Place vectors | `tools/autonomy/compile-place-embeddings.mjs` |
| Generic candidate tile | `tools/autonomy/compile-geojson-tile.mjs` |
| Public feature reranker evidence | `tools/autonomy/evaluate-feature-reranker.mjs` |
| Qwen place challenger evidence | `tools/autonomy/evaluate-place-resolution.mjs` |
| Policy comparison evidence | `tools/samer/autonomy/run-policy-trial.mjs` |

A new data class needs a compiler that emits source identity, input hashes,
algorithm and parameters, counts, rejected rows, output hash, and claim
boundary. Do not hand-edit a derived JSON artifact.

## Capability gates by domain

### Route topology

Require stable nodes and segments, explicit allowed modes, connectivity,
directions, access restrictions, turns, source geometry, and deterministic
tie-breaking. A display line is not a route edge.

### Pedestrian and wheelchair

Require navigable sidewalk/crossing topology and source-to-route grounding.
Ramp measurements alone do not prove the connecting path. Preserve exact ramp
failures and technical-review states. Never label simulator thresholds as ADA
compliance.

### Bicycle, scooter, and car

Require mode-eligible graph rows and legal/access constraints. A park property
boundary does not authorize a bicycle loop. Car claims need turn restrictions,
signal phases, and lane/access authority appropriate to the claim.

### Amenities

Preserve the difference between listed location, geometric proximity, current
availability, capacity, security, condition, and access. Claim only the fields
the source and compiler establish.

### Historical observations

Preserve period, spatial join, join radius, unjoined rows, deduplication,
aggregation, and denominator availability. Without exposure, do not emit a
rate, causal effect, prediction, or "safest" ranking.

### Place semantics and models

Author descriptors from independent pinned sources, not evaluation probes.
Bind vectors to world, model, tokenizer, manifest, source-descriptor, and
packed-vector hashes. Filter runtime candidates to the active embodiment graph.
Keep the lexical control and must-refuse guardrail.

## Build and prove activation

```bash
npm run build:autonomy:data
npm run samer:autonomy
node tools/autonomy/sync-autonomy-manifest.mjs
npm run check:autonomy
node --test tests/autonomy.test.cjs
npm run audit:autonomy:browser
npm run check:deploy
```

Inspect regenerated diffs before committing. Verify that world counts,
region seams, model identities, source hashes, diagnostic populations, and
claim boundaries changed only as intended.

## Add a region or city

An adjacent NYC region must use the canonical NYC projection origin, stable ID
policy, source revisions, and exact seam rows. Rebuild the canonical world,
then derive all packs again.

A new city gets a separate world ID, content version, coordinate origin,
feature catalog, place index, evidence indexes, region registry, and activation
receipt. Reuse runtime contracts, not local coordinate values. Keep the new
registry inactive until its exact candidate passes all gates.

## Final report

State, with concrete paths and hashes:

- what was fetched and from which authority;
- the staged receipt and verification result;
- the immutable promoted source directory;
- the compiler and emitted candidate artifacts;
- accepted, rejected, and unjoined row counts;
- the exact claim now enabled and claims still blocked;
- unit, autonomy, browser, deploy, and live results.
