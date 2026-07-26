const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function sha256(relativePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, relativePath))).digest('hex');
}

test('Food custody inventory verifies artifacts and fails observed claims closed when source rows are absent', () => {
  const manifest = read('public/data/food-recall-us/dataset-manifest.json');
  assert.equal(manifest.owner, 'food-recall-us');
  assert.ok(manifest.auditedAt);
  manifest.datasets.forEach((row) => {
    const filename = path.basename(row.path);
    assert.equal(row.sha256, sha256(`public/data/food-recall-us/${filename}`), row.datasetId);
    assert.ok(row.license, row.datasetId);
    assert.ok(row.rowIdentity, row.datasetId);
    assert.ok(Object.hasOwn(row, 'retrievedAt'), row.datasetId);
  });
  const history = manifest.datasets.find((row) => row.datasetId === 'us.food.historical-recalls.v1');
  assert.equal(history.origin, 'derived');
  assert.match(history.sourceRows, /missing/);
  const environment = manifest.datasets.find((row) => row.datasetId === 'us.environment.snapshot.v1');
  assert.equal(environment.origin, 'scenario');
  assert.match(environment.sourceRows, /not observed NOAA/);
});

test('Safety custody retains source URL, license, retrieval instant, collision identity, and immutable source hashes', () => {
  const dataset = read('public/data/simulatte/safety-history-index-v1.json');
  assert.equal(dataset.source.rowIdentityField, 'collision_id');
  assert.match(dataset.source.sourceUrl, /^https:\/\/data\.cityofnewyork\.us\//);
  assert.ok(dataset.source.license);
  assert.ok(dataset.source.licenseUrl);
  assert.ok(dataset.source.retrievedAt);
  assert.match(dataset.source.sourceReceiptSha256, /^[a-f0-9]{64}$/);
  Object.values(dataset.source.sourceFileSha256).forEach((hash) => assert.match(hash, /^[a-f0-9]{64}$/));
  const manifest = read('public/shared/plugins/safety-explorer/plugin.json');
  assert.equal(manifest.datasets[0].reference.sha256, sha256('public/data/simulatte/safety-history-index-v1.json'));
});

test('Orbital custody separates observed, derived, and scenario artifacts and verifies every activated byte identity', () => {
  const manifest = read('public/data/orbital-transfer-planner/dataset-manifest.json');
  assert.equal(manifest.owner, 'orbital-transfer-planner');
  manifest.datasets.forEach((row) => {
    assert.equal(row.sha256, sha256(`public/data/orbital-transfer-planner/${row.filename}`), row.id);
    assert.ok(row.license, row.id);
    assert.ok(row.rowIdentity, row.id);
    assert.ok(Object.hasOwn(row, 'retrievedAt'), row.id);
  });
  const horizons = manifest.datasets.find((row) => row.id === 'jpl.horizons.heliocentric-vectors.v1');
  assert.equal(horizons.origin, 'observed');
  assert.match(horizons.sourceIdentityStatus, /raw Horizons response hash not retained/);
  const radiation = manifest.datasets.find((row) => row.id === 'solar.radiation.snapshot.v1');
  assert.equal(radiation.origin, 'scenario');
  assert.match(radiation.sourceIdentityStatus, /not observed weather/);
});

test('Sun Walker source receipts carry licenses, retrieval dates, row identities, raw hashes, and unique rows', () => {
  const dataset = read('public/data/sun-walker/sun-walker-environment-v1.json');
  dataset.sources.forEach((source) => {
    assert.ok(source.license, source.id);
    assert.ok(source.licenseUrl, source.id);
    assert.ok(source.retrievedAt, source.id);
    assert.ok(source.rowIdentityField, source.id);
    assert.match(source.rawSha256, /^[a-f0-9]{64}$/);
  });
  assert.equal(new Set(dataset.canopy.rows.map((row) => row.sourceRowId)).size, dataset.canopy.rows.length);
  assert.equal(new Set(dataset.weather.rows.map((row) => row.sourceRowId)).size, dataset.weather.rows.length);
  const manifest = read('public/shared/plugins/sun-walker/plugin.json');
  const reference = manifest.datasets.find((row) => row.id === dataset.id).reference;
  assert.equal(reference.sha256, sha256('public/data/sun-walker/sun-walker-environment-v1.json'));
});

test('Maritime custody distinguishes source identity hashes from unavailable source-content hashes', () => {
  const registry = read('public/data/maritime-trade-global/provenance-registry-v1.json');
  const manifest = read('public/data/maritime-trade-global/dataset-manifest.json');
  registry.sources.forEach((source) => {
    assert.ok(source.retrievedAt, source.id);
    assert.ok(source.sourceRowIdentity, source.id);
    assert.ok(source.licenseStatus, source.id);
    assert.match(source.sourceIdentitySha256, /^[a-f0-9]{64}$/, source.id);
    assert.equal(source.sourceContentSha256, null, `${source.id} must not imply unavailable source bytes were hashed`);
  });
  registry.datasets.forEach((record) => {
    assert.equal(record.sha256, sha256(`public/data/maritime-trade-global/${record.path}`), record.id);
    assert.ok(record.rowIdentity, record.id);
  });
  const calibration = registry.datasets.find((row) => row.id === 'maritime.calibration.artifacts.v1');
  const activated = manifest.datasets.find((row) => row.datasetId === calibration.id);
  assert.equal(calibration.sha256, activated.sha256);
});

test('Interstellar custody locks the exact Gaia rows and every governed output artifact', () => {
  const manifest = read('public/data/interstellar-relay-network/governed-dataset-manifest-v2.json');
  const stars = read('public/data/interstellar-relay-network/gaia-dr3-nearby-stars-v2.json');
  manifest.datasets.forEach((record) => {
    assert.equal(record.sha256, sha256(`public/data/interstellar-relay-network/${record.filename}`), record.id);
    assert.ok(record.contentVersion, record.id);
  });
  const source = manifest.sources.find((row) => row.id === 'gaia-dr3-source-response-v1');
  assert.equal(source.sha256, sha256(`public/data/interstellar-relay-network/${source.filename}`));
  assert.ok(source.retrievalAt);
  assert.ok(source.license?.id);
  assert.equal(stars.provenance.sourceArtifact.sha256, source.sha256);
  const catalogIds = stars.stars.map((row) => row.catalogSourceId).filter(Boolean);
  assert.equal(catalogIds.length, 6);
  assert.equal(new Set(catalogIds).size, catalogIds.length);
  assert.ok(stars.stars.every((row) => row.sourceRowId));
});
