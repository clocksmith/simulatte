# Autonomy data ingestion

Owner contracts:

- `public/data/autonomy/autonomy-manifest.json`
- `public/data/autonomy/feature-cards-v1.json`
- `tools/autonomy/compile-geojson-tile.mjs`
- `tools/autonomy/check-autonomy-data.mjs`

## Checked-in data

The checked-in corridor is synthetic. The manifest pins raw-file SHA-256 values
for the world, embodiment, policy, and feature-card catalog. Browser loading and
the repository data check both reject identity or hash drift.

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
- referenced IDs match loaded artifacts;
- node and segment IDs are unique;
- every segment endpoint exists;
- mode, geometry, length, speed, signal, actor, disruption, and feature-card references validate;
- the browser entry lists only existing scripts;
- autonomy JavaScript stays below the repository line ceiling;
- the public SAME-R contract and deterministic repetitions execute.

A newly compiled tile is not active until its exact hash and identity are added
to the manifest and all referenced controls have evidence.
