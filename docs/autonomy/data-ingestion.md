# Autonomy data ingestion

Owner contracts:

- `public/data/autonomy/autonomy-manifest.json`
- `public/data/autonomy/feature-cards-v1.json`
- `public/data/autonomy/patterns/nyc-replay-patterns-v1.json`
- `tools/autonomy/build-nyc-autonomy-world.mjs`
- `tools/autonomy/build-region-packs.mjs`
- `tools/autonomy/region-configs/nyc-core-v1.json`
- `tools/autonomy/compile-geojson-tile.mjs`
- `tools/autonomy/check-autonomy-data.mjs`

## Checked-in data

The hosted default is `villages-williamsburg-delivery-bike-v1`. It is compiled
from frozen NYC DOT bike routes, NYC building footprints, NYC borough
boundaries, and OpenStreetMap highway snapshots. Each source receipt records
authority, license, request, snapshot date, raw byte count, and SHA-256.

The manifest separately pins raw-file SHA-256 values for the world,
embodiment, policy, feature catalog, occurrence catalog, and reranker evidence.
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

`build-nyc-autonomy-world.mjs` reads the four canonical compressed snapshots
under `tools/autonomy/data-sources/villages-williamsburg-2026-07-13/`. One run
emits synchronized world, feature-catalog, inverted-index, and occurrence
artifacts. It labels ten mission-groundable places, compiles the directed bike
network, produces the default policy-cost route, places authored scenario
actors on that route, and writes time and event patterns against the generated
IDs.

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
2. Planimetric sidewalks and crosswalks for pedestrian legality and source geometry.
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
- reranker evidence binds the same world, catalog, embodiment, and policy;
- node and segment IDs are unique;
- every segment endpoint exists;
- mode, geometry, length, speed, signal, actor, disruption, and feature-card references validate;
- the browser entry lists only existing scripts;
- autonomy JavaScript stays below the repository line ceiling;
- the 20-row public diagnostic corpus retains its row hash;
- the public SAME-R contract and deterministic repetitions execute.

A newly compiled tile is not active until its exact hash and identity are added
to the manifest and all referenced controls have evidence.
