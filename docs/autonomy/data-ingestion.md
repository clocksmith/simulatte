# Autonomy data ingestion

Owner contracts:

- `public/data/autonomy/autonomy-manifest.json`
- `public/data/autonomy/feature-cards-v1.json`
- `public/data/autonomy/patterns/nyc-replay-patterns-v1.json`
- `tools/autonomy/build-nyc-autonomy-world.mjs`
- `tools/autonomy/build-region-packs.mjs`
- `tools/autonomy/manage-autonomy-data.mjs`
- `tools/autonomy/source-catalog-v1.json`
- `tools/autonomy/region-configs/nyc-core-v1.json`
- `tools/autonomy/compile-geojson-tile.mjs`
- `tools/autonomy/check-autonomy-data.mjs`

## Source availability is not runtime capability

The browser does not query NYC Open Data or OpenStreetMap. It loads one frozen,
hash-pinned composition. A source may contain a street, park, sidewalk polygon,
or historical count without providing the topology and mode contract required
to execute a mission.

| Available bytes | Missing executable proof |
| --- | --- |
| OSM street display geometry | Connected, access-aware pedestrian or roadway graph |
| Sidewalk polygons and curb lines | Centerlines, crossings, directions, accessibility, and connectivity |
| Park property polygons | Legal, obstacle-free, mode-eligible perimeter path |
| DOT and TLC historical observations | Spatial join, timezone, missing-data rule, aggregation, and calibrated occurrence model |
| Building footprints | Entrances or navigable indoor/outdoor access |

The capability matrix turns a row on only after the exact embodiment,
mission-family contract, and compiled graph or circuit are all registered.

## Governed refresh and backfill

`manage-autonomy-data.mjs` separates network access from activation. The
catalog registers current world sources, pedestrian-topology candidates,
month-partitioned bicycle/pedestrian and motor-vehicle counts, and TLC trip
records. Every request carries authority, license, data class, capabilities,
and the entry gate required before its bytes can speak for a runtime claim.

Plan without network access:

```bash
npm run autonomy:data:plan -- \
  --group pedestrian-topology \
  --snapshot-date YYYY-MM-DD

npm run autonomy:data:plan -- \
  --group mobility-history \
  --from YYYY-MM-01 \
  --to YYYY-MM-01 \
  --snapshot-date YYYY-MM-DD
```

Fetch into an untracked staging directory, then verify exact bytes:

```bash
npm run autonomy:data:fetch -- \
  --group pedestrian-topology \
  --snapshot-date YYYY-MM-DD \
  --out artifacts/autonomy-data/pedestrian-YYYY-MM-DD

npm run autonomy:data:backfill -- \
  --group mobility-history \
  --from YYYY-MM-01 \
  --to YYYY-MM-01 \
  --snapshot-date YYYY-MM-DD \
  --out artifacts/autonomy-data/mobility-YYYY-MM-DD

npm run autonomy:data:verify -- \
  --receipt artifacts/autonomy-data/NAME/fetch-receipt.json
```

Fetching emits `staged_not_active`. Promotion requires the exact receipt hash
and a new directory under `tools/autonomy/data-sources/`; it still does not
compile, activate, or deploy the world. The repo-local `autonomy-data` skill
encodes the full plan, fetch, verify, promote, compile, gate, and activate
sequence.

## Checked-in data

The hosted default is `nyc-core-autonomy-v1`. It is compiled
from frozen NYC DOT bike routes, NYC building footprints, NYC borough
boundaries, OpenStreetMap highway snapshots, and NYC Parks property geometry
for McCarren (`B058`), Tompkins Square (`M088`), Union Square (`M089`), and
Washington Square (`M098`). The four properties contribute nine rendered
exterior members. Only Union Square has a separately gated executable circuit.
Each source receipt records authority, license, request, snapshot date, raw
byte count, and SHA-256.

The manifest separately pins raw-file SHA-256 values for the world,
embodiments, policy, feature catalog, occurrence catalog, and reranker evidence.
Browser loading and the repository data check both reject identity or hash
drift. `nyc-training-corridor-v1` remains a synthetic unit-test fixture.

The hosted world is assembled from three independently hashed packs:
Manhattan Villages, the East River crossing, and North Brooklyn. The registry
pins each pack's city, world, bounds, neighbors, counts, source hashes, and
seam identities. Shared boundary nodes must be byte-identical. A missing pack,
extra pack, missing seam, false peer, or conflicting row fails composition.

## Governed NYC compilation

The main compiler owns the Villages and North Brooklyn tile:

```bash
npm run build:autonomy:data
npm run eval:autonomy:reranker
```

`build-nyc-autonomy-world.mjs` reads four canonical compressed snapshots under
`tools/autonomy/data-sources/villages-williamsburg-2026-07-13/` and the
separately promoted NYC Parks snapshot under
`tools/autonomy/data-sources/nyc-parks-properties-2026-07-13-v2/`. One run
emits synchronized world, feature-catalog, inverted-index, and occurrence
artifacts. It labels ten mission-groundable places, compiles the directed bike
network, produces the default policy-cost route, places authored scenario
actors on that route, and writes time and event patterns against the generated
IDs. The Parks compiler renders every exterior member from the four selected
properties. It separately selects the largest projected exterior member of
Union Square `M089`, hashes both the full geometry and selected ring, and emits
that one closed pedestrian circuit as a property-boundary simulation path.

Refresh the park source through staging and immutable promotion. The world
compiler refuses `--refresh-parks` so it cannot mutate accepted source bytes:

```bash
npm run autonomy:data:fetch -- \
  --source nyc-parks-properties \
  --snapshot-date YYYY-MM-DD \
  --out artifacts/autonomy-data/nyc-parks-properties-YYYY-MM-DD

npm run autonomy:data:verify -- \
  --receipt artifacts/autonomy-data/nyc-parks-properties-YYYY-MM-DD/fetch-receipt.json

node tools/autonomy/manage-autonomy-data.mjs promote \
  --receipt artifacts/autonomy-data/nyc-parks-properties-YYYY-MM-DD/fetch-receipt.json \
  --target tools/autonomy/data-sources/nyc-parks-properties-YYYY-MM-DD-vNEXT \
  --accept-receipt-sha VERIFIED_RECEIPT_SHA256
```

`build-region-packs.mjs` can compile another region registry without changing
the hosted manifest. Activation is a separate operation:

```bash
node tools/autonomy/build-region-packs.mjs \
  --config tools/autonomy/region-configs/another-city-v1.json \
  --world public/data/autonomy/worlds/another-city-v1.json \
  --features public/data/autonomy/another-city-feature-cards-v1.json \
  --registry public/data/autonomy/regions/another-city-v1.json

node tools/autonomy/build-region-packs.mjs --activate
```

Only `--activate` updates `autonomy-manifest.json`. An activated registry must
live under `public/data/autonomy/`. This prevents an experimental city build
from silently replacing the hosted composition.

## Region extension and multiple cities

Adjacent packs are mergeable when all rows come from the same governed world,
use the same local coordinate origin, preserve stable WGS84-derived node and
segment identities, and declare exact shared seams. Extend NYC by compiling a
larger canonical NYC world first, then repartitioning it. Do not append a
second independently projected graph to an existing registry.

Another city receives its own source snapshots, world ID, coordinate origin,
feature catalog, build config, registry ID, and composition receipt. The
runtime activates one registry at a time. A future cross-city mission layer
can select registries, but it must not numerically merge incompatible local
coordinate frames.

The next NYC source order is:

1. LION topology and turn restrictions plus DOT bike facilities for graph authority.
2. Planimetric sidewalks and crosswalks for general pedestrian legality and source geometry; the current Union Square control is deliberately limited to the property boundary.
3. Signal locations, speed limits, curb regulations, and elevation for control and cost contracts.
4. Dated TLC, Citi Bike, DOT count, 311, and weather snapshots for occurrence priors.

Historical rows are not map facts. Every occurrence compilation must bind a
dataset snapshot, spatial join, time-zone transform, aggregation interval,
missing-data rule, and source hash. Observed history may parameterize demand
and disruptions, but it does not turn a simulated trace into observed traffic.

The renderer retains 8,500 source building footprints chosen by route and
named-focus proximity, height, and area. Its LOD receipt records 26,990 source
footprints, the retained and omitted counts, and `fullCoverageClaim: false`.

## GeoJSON normalization

The compiler accepts LineString features. It preserves supplied geometry and
declared feature properties, projects WGS84 coordinates into local meters when
requested, derives endpoint nodes, and validates the result against the same
world contract used by the browser.

```bash
node tools/autonomy/compile-geojson-tile.mjs \
  --input source-tile.geojson \
  --output public/data/autonomy/worlds/source-tile-v1.json \
  --source-id dataset-snapshot-id \
  --snapshot-date YYYY-MM-DD \
  --world-id source-tile-v1 \
  --coordinates wgs84
```

Each LineString may declare:

| Property | Contract |
| --- | --- |
| `id` | Stable segment ID |
| `fromNodeId`, `toNodeId` | Stable endpoint identities |
| `fromLabel`, `toLabel` | Mission-grounding labels |
| `laneType` | `protected`, `shared`, or `connector` |
| `allowedModes` | Explicit mode list |
| `speedLimitMps` | Source-backed numeric limit |
| `riskScore` | Source-backed normalized risk value |

The compiler does not infer signals, right-of-way, turn restrictions, actors,
closures, legal permissions, or missing intersections. Those require separate
source snapshots and entry gates before the world can claim them.

## Entry gates

`npm run check:autonomy` verifies:

- every manifest path stays under `public/`;
- every pinned SHA-256 matches raw bytes;
- every region pack matches its exact registry identity and declared source hashes;
- the requested pack set, seam set, peer set, and composed counts match exactly;
- referenced IDs match loaded artifacts;
- occurrence plugins and effect targets exist;
- reranker evidence binds the same world, catalog, default embodiment, and policy;
- every registered embodiment is identity- and hash-pinned and the declared default exists;
- node and segment IDs are unique;
- every segment endpoint exists;
- mode, geometry, length, speed, signal, actor, disruption, and feature-card references validate;
- every declared circuit closes in exact node/segment order, uses mode-eligible segments, and reproduces its declared length and source hashes;
- the browser entry lists only existing scripts;
- autonomy JavaScript stays below the repository line ceiling;
- the 20-row public diagnostic corpus retains its row hash;
- the public SAME-R contract and deterministic repetitions execute.

A newly compiled tile is not active until its exact hash and identity are added
to the manifest and all referenced controls have evidence.
