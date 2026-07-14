const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const universeDir = path.join(root, 'public', 'data', 'simulatte-universe');

const REQUIRED_INDEXES = [
  ['concepts', 'concept-index', 'concept-index-v1.json', 'simulatte.universeConceptIndex.v1'],
  ['materials', 'material-index', 'material-index-v1.json', 'simulatte.universeMaterialIndex.v1'],
  ['processes', 'process-index', 'process-index-v1.json', 'simulatte.universeProcessIndex.v1'],
  ['relations', 'relation-index', 'relation-index-v1.json', 'simulatte.universeRelationIndex.v1'],
  ['operators', 'operator-index', 'operator-index-v1.json', 'simulatte.universeOperatorIndex.v1'],
  ['affordances', 'affordance-index', 'affordance-index-v1.json', 'simulatte.universeAffordanceIndex.v1'],
  ['shapes', 'shape-index', 'shape-index-v1.json', 'simulatte.universeShapeIndex.v1'],
  ['scenes', 'scene-index', 'scene-index-v1.json', 'simulatte.universeSceneIndex.v1'],
  ['synonyms', 'synonym-index', 'synonym-index-v1.json', 'simulatte.universeSynonymIndex.v1'],
  ['analogs', 'physical-analog-index', 'physical-analog-index-v1.json', 'simulatte.universePhysicalAnalogIndex.v1'],
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runTool(script, args = []) {
  return childProcess.execFileSync(process.execPath, [path.join(root, 'tools', script), ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

test('semantic universe manifest exposes the full parallel-worker contract', () => {
  const manifest = readJson(path.join(universeDir, 'manifest.json'));
  const modelRuntimeLock = readJson(path.join(
    root,
    'public',
    'data',
    'simulatte-embedder',
    'model-runtime-lock.json'
  ));

  assert.equal(manifest.schema, 'simulatte.universeManifest.v1');
  assert.equal(manifest.id, 'simulatte-universe-multi-index-v1');
  assert.equal(manifest.modelRuntimeLock.id, modelRuntimeLock.id);
  assert.equal(manifest.modelRuntimeLock.number, modelRuntimeLock.number);
  assert.equal(Object.hasOwn(manifest, 'embedModel'), false);
  assert.equal(modelRuntimeLock.embedding.id, 'qwen-3-embedding-0-6b-q4k-ehf16-af32');
  assert.equal(modelRuntimeLock.embedding.dimensions, 1024);

  for (const [name, kind, artifact, schema] of REQUIRED_INDEXES) {
    assert.equal(manifest.indexes[name].kind, kind);
    assert.equal(manifest.indexes[name].artifact, `./${artifact}`);
    assert.equal(manifest.indexes[name].documentSchema, schema);
    const index = readJson(path.join(universeDir, artifact));
    assert.equal(index.schema, schema);
    assert.ok(index.id);
    assert.ok(Array.isArray(index.documents));
    assert.ok(index.documents.length > 0, `${name} should have seed documents`);
  }
});

test('semantic universe validation rejects drift and dangling references', () => {
  const output = runTool('validate-semantic-universe.mjs');
  const report = JSON.parse(output);

  assert.equal(report.schema, 'simulatte.semanticUniverseValidation.v1');
  assert.equal(report.ok, true, report.errors.join('\n'));
  assert.equal(report.errors.length, 0);
  assert.ok(report.documentCount >= 70);
});

test('semantic universe builders exist and preserve the required index shape', () => {
  for (const script of [
    'build-universe-index.mjs',
    'build-affordance-index.mjs',
    'validate-semantic-universe.mjs',
    'benchmark-semantic-coverage.mjs',
    'simulatte-universe-utils.mjs',
  ]) {
    assert.ok(fs.existsSync(path.join(root, 'tools', script)), `${script} should exist`);
  }

  const universeBuilder = fs.readFileSync(path.join(root, 'tools', 'build-universe-index.mjs'), 'utf8');
  const affordanceBuilder = fs.readFileSync(path.join(root, 'tools', 'build-affordance-index.mjs'), 'utf8');

  assert.match(universeBuilder, /mergeDocuments/);
  assert.match(universeBuilder, /createManifest/);
  assert.match(affordanceBuilder, /deriveAffordance/);
  assert.match(affordanceBuilder, /unsupportedPolicy: 'preserve-semantic-node'/);
});

test('semantic coverage benchmark uses gold obligations, excludes prompt copies, and bills indexes', () => {
  const output = runTool('benchmark-semantic-coverage.mjs');
  const report = JSON.parse(output);

  assert.equal(report.schema, 'simulatte.semanticCoverageBenchmark.v2');
  assert.equal(report.promptSource.id, 'simulatte-public-gold-v1');
  assert.equal(report.promptCount, 6);
  assert.equal(report.exactPromptMatchCount, 0);
  assert.ok(report.meanGoldObligationCoverage > 0);
  assert.equal(report.indexBill.vectors.primitives.ownerCoverage, 1);
  assert.equal(report.indexBill.vectors.surfaceCards.ownerCoverage, 1);
  assert.equal(report.indexBill.embeddingModel.suitability, 'dedicated-embedding-model');
  assert.equal(report.indexBill.englishCoverage.status, 'not-measured');
  assert.ok(report.rows.every((row) => Array.isArray(row.topMatches)));
  assert.ok(report.rows.every((row) => Array.isArray(row.missingTokens)));
  assert.ok(report.rows.every((row) => Array.isArray(row.obligations)));

  const copiedPromptReport = JSON.parse(runTool('benchmark-semantic-coverage.mjs', [
    'laser heats ferrofluid lens over copper coil',
  ]));
  assert.ok(copiedPromptReport.exactPromptMatchCount > 0);
  assert.ok(copiedPromptReport.rows[0].topMatches.every(
    (row) => row.label.toLowerCase() !== 'laser heats ferrofluid lens over copper coil'
  ));
});
