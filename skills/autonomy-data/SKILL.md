---
name: autonomy-data
description: Refresh, backfill, verify, promote, and compile Simulatte autonomy map or mobility-history sources. Use when adding a region or city, updating NYC snapshots, importing sidewalks or crossings, backfilling traffic observations, changing source provenance, or diagnosing why a mission lacks a governed route artifact.
---

# Autonomy data

Work from the Simulatte repository root. Read `docs/autonomy/data-ingestion.md`
and `tools/autonomy/source-catalog-v1.json` before changing source or compiler
contracts.

## Preserve the phase boundary

Execute these phases in order:

1. Plan requests without network access.
2. Fetch raw bytes into `artifacts/autonomy-data/`.
3. Verify every staged byte against the fetch receipt.
4. Inspect source coverage, licensing, temporal semantics, and entry-gate gaps.
5. Promote the exact accepted receipt into a new immutable directory under
   `tools/autonomy/data-sources/`.
6. Compile a candidate world without activating it.
7. Validate topology, provenance, capabilities, region seams, and browser use.
8. Activate only the exact candidate that passed all gates.

Never let fetching rebuild or activate the hosted world. Never edit an existing
snapshot directory. Never treat source availability as routing capability.

## Plan and stage map data

Use an explicit snapshot date and source group:

```bash
npm run autonomy:data:plan -- \
  --group pedestrian-topology \
  --snapshot-date YYYY-MM-DD

npm run autonomy:data:fetch -- \
  --group pedestrian-topology \
  --snapshot-date YYYY-MM-DD \
  --out artifacts/autonomy-data/pedestrian-YYYY-MM-DD
```

Run `world-core` for the existing map sources. Select individual sources with
`--source SOURCE_ID`. Override the tile only with an explicit
`--bounds south,west,north,east` receipt.

## Backfill observed history

Use first-of-month half-open boundaries:

```bash
npm run autonomy:data:plan -- \
  --group mobility-history \
  --from YYYY-MM-01 \
  --to YYYY-MM-01 \
  --snapshot-date YYYY-MM-DD

npm run autonomy:data:backfill -- \
  --group mobility-history \
  --from YYYY-MM-01 \
  --to YYYY-MM-01 \
  --snapshot-date YYYY-MM-DD \
  --out artifacts/autonomy-data/mobility-history-YYYY-MM-DD
```

Record timezone, missing intervals, sensor or zone identity, aggregation,
spatial join, and source publication lag in the downstream occurrence receipt.
Observed history may parameterize actor demand. It does not become a live
condition or a map fact.

## Verify and promote

```bash
npm run autonomy:data:verify -- \
  --receipt artifacts/autonomy-data/NAME/fetch-receipt.json

node tools/autonomy/manage-autonomy-data.mjs promote \
  --receipt artifacts/autonomy-data/NAME/fetch-receipt.json \
  --target tools/autonomy/data-sources/IMMUTABLE-SNAPSHOT-ID \
  --accept-receipt-sha EXACT_SHA256
```

Promotion freezes source bytes only. It does not authorize compilation or
hosting.

## Compile and gate

Use the owning compiler for each source class. Add a compiler before claiming a
new capability. Require explicit graph connectivity and access rules for
pedestrian, bicycle, scooter, or car routing. Require a separately registered
closed path for loops. Keep render geometry, route geometry, occurrence priors,
and live conditions as distinct evidence types.

For the current NYC world, build and validate with:

```bash
npm run build:autonomy:data
npm run check:autonomy
node --test tests/autonomy.test.cjs
npm run audit:autonomy:browser
```

Inspect the generated world, feature catalog, occurrence catalog, region
registry, and manifest hashes. Report fetched, compiled, validated, activated,
and deployed as separate states.
