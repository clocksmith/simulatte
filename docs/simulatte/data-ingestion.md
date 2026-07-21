# Autonomy data ingestion

Simulatte never turns a live API response directly into a navigation claim.
Network acquisition, immutable source promotion, compilation, activation, and
deployment are separate states with separate receipts.

## Required sequence

```text
plan -> fetch/backfill -> verify bytes -> inspect authority and coverage
     -> immutable promotion -> compile candidate -> contract gates
     -> manifest activation -> browser audit -> deploy
```

Fetching always writes to an untracked staging directory and emits
`staged_not_active`. Promotion copies exactly the verified files into a new
directory under `tools/autonomy/data-sources/`. Existing promoted directories
are immutable.

## Source catalog

`tools/autonomy/source-catalog-v1.json` owns request templates, authorities,
licenses, data classes, temporal fields, capabilities, and entry gates.

| Group | Current sources | Runtime purpose |
| --- | --- | --- |
| `world-core` | NYC DOT bike routes, building footprints, borough boundaries, OSM highways, NYC Parks properties | Route and render world |
| `pedestrian-topology` | Sidewalks, curbs, raised crosswalks, pedestrian ramps | Candidate pedestrian and accessibility evidence |
| `place-semantics` | Pinned public place descriptions | Offline place-vector construction only |
| `route-amenities` | NYC DOT bicycle parking | Frozen route-proximity constraints |
| `safety-history` | NYPD reported crashes | Historical-observation route experiments |
| `mobility-history` | Bicycle/pedestrian and automated traffic counts | Future demand and realism evaluation |
| `taxi-history` | TLC trip records | Future demand priors and corridor evaluation |

Map facts, public semantic context, observed history, and simulation
assumptions are different evidence classes. They never inherit each other's
authority.

## Plan, fetch, and verify

Plan without network access:

```bash
npm run autonomy:data:plan -- \
  --group pedestrian-topology \
  --snapshot-date YYYY-MM-DD
```

Fetch current map or semantic sources:

```bash
npm run autonomy:data:fetch -- \
  --group route-amenities \
  --snapshot-date YYYY-MM-DD \
  --out artifacts/autonomy-data/route-amenities-YYYY-MM-DD
```

Backfill half-open historical periods:

```bash
npm run autonomy:data:backfill -- \
  --group safety-history \
  --from YYYY-MM-01 \
  --to YYYY-MM-01 \
  --snapshot-date YYYY-MM-DD \
  --out artifacts/autonomy-data/safety-history-YYYY-MM-DD
```

Verify the exact staged bytes:

```bash
npm run autonomy:data:verify -- \
  --receipt artifacts/autonomy-data/NAME/fetch-receipt.json
```

Every receipt binds the request plan, URLs, response metadata, byte counts,
file SHA-256 values, and the command used. A changed file fails verification.

## Promote immutable sources

```bash
node tools/autonomy/manage-autonomy-data.mjs promote \
  --receipt artifacts/autonomy-data/NAME/fetch-receipt.json \
  --target tools/autonomy/data-sources/IMMUTABLE-SNAPSHOT-ID \
  --accept-receipt-sha EXACT_RECEIPT_SHA256
```

Promotion does not compile or activate anything. Review the dataset's spatial
coverage, time semantics, missing rows, license, update behavior, and intended
claim before a compiler consumes it.

## Current promoted indexes

### Accessibility

`compile-accessibility-index.mjs` joins 11,603 NYC DOT pedestrian-ramp rows to
the pedestrian street nodes. It preserves measured curb reveal, running slope,
cross slope, warning-surface fields, technical-review flags, nearest-node
distance, and source hashes. A route audit also checks whether each segment's
source establishes accessible topology. Missing, failing, or merely street-
centerline topology blocks a wheelchair mission.

This is a simulator threshold, not an ADA compliance determination.

### Bicycle parking

`compile-route-amenity-index.mjs` joins 9,359 listed rack locations to route
geometry and records the maximum nearest-rack distance along each segment. The
runtime may enforce `within N meters of a bike rack` by excluding segments
that cannot satisfy the frozen geometric bound.

This does not prove availability, capacity, security, condition, or access.

### Safety history

`compile-safety-history-index.mjs` joins one frozen year of 5,131 reported NYPD
crashes to the nearest physical route geometry. Directed edges sharing one
physical segment share the same observation row. The index records 5,115
joined crashes, 16 unjoined crashes, injuries, fatalities, join distance,
period boundaries, source file hashes, and the fetch receipt hash.

There is no exposure denominator. The only authorized use is a declared
historical-observation counterfactual. It cannot support "safest route", live
risk, or causal claims.

### Place embeddings

`compile-place-embeddings.mjs` embeds independently sourced descriptors for 20
mode-specific governed place nodes with the exact Qwen model in the shared
runtime lock. The packed vector artifact binds world, descriptor, tokenizer,
model manifest, and vector hashes. It is compiled offline. The browser embeds
only the user's unresolved phrase.

Diagnostic probe text is not used to author descriptors. The checked-in probe
population remains exposed and promotion-ineligible.

## Compile and activate

```bash
npm run build:autonomy:data
```

That command:

1. rebuilds the canonical NYC world and feature catalog from promoted sources;
2. derives and activates the three region packs;
3. compiles accessibility, amenity, and safety-history indexes;
4. rebuilds the public navigation and deterministic reranker evidence;
5. verifies the place-vector artifact against the pinned model and world;
6. evaluates the real Qwen place challenger;
7. synchronizes manifest identities and raw-byte hashes.

The policy arena is regenerated separately because it hashes the exact runtime
sources it evaluates:

```bash
npm run samer:autonomy
node tools/autonomy/sync-autonomy-manifest.mjs
```

Then run:

```bash
npm run check:autonomy
node --test tests/autonomy.test.cjs
npm run audit:autonomy:browser
npm run check:deploy
```

## Region and city growth

Adjacent NYC regions can merge only if they are derived from the same canonical
world, coordinate origin, source revisions, ID policy, and exact seam rows.
Build the larger world first, then repartition it. Never append independently
projected local coordinates or reconcile conflicting seam rows heuristically.

Another city receives its own:

- source snapshots and promotion receipts;
- world and content-version identities;
- coordinate origin;
- route and render geometry;
- feature catalog and place-vector artifact;
- region registry and pack composition;
- accessibility, amenity, history, and occurrence indexes;
- browser activation receipt.

The runtime can reuse mission, controller, counterfactual, renderer, ledger,
and verifier code. The manifest activates one city composition at a time. A
cross-city journey requires an explicit transport connection contract.

## Source availability is not capability

| Available bytes | Still required before execution |
| --- | --- |
| Street centerlines | access rules, turn restrictions, connectivity, mode eligibility |
| Sidewalk and curb polygons | navigable centerlines, crossings, direction, obstacle and access evidence |
| Park property polygon | a legal, obstacle-free, mode-eligible circuit |
| Crash rows | spatial join, period, missing-data rule, exposure-aware claim boundary |
| Traffic counts | matched corridor, time transform, observation coverage, calibration protocol |
| Building footprints | entrances and navigable indoor/outdoor connections |

The capability matrix turns on only when embodiment, mission family,
termination, and exact governed artifact are all registered.

## Gate inventory

`check:autonomy` verifies:

- every manifest reference stays inside `public/` and matches raw SHA-256 bytes;
- IDs, world versions, model locks, source receipts, and compiler identities agree;
- region pack sets, counts, seams, peers, and reconstructed world hashes match;
- graph IDs are unique and every segment endpoint and mode is valid;
- circuits close in declared order and reproduce length and geometry hashes;
- accessibility, amenity, history, curriculum, and snapshot contracts bind the active world;
- place vectors bind the exact model, descriptors, world, and eligible node identities;
- public diagnostics retain their population and claim boundaries;
- SAME-R runs consume declared budgets and cannot silently promote;
- browser scripts exist and autonomy JavaScript remains below the repository line ceiling.

Generated bytes, passing unit tests, activation, browser behavior, and live
deployment are reported as separate states.
