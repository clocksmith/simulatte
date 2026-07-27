const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

require('../public/blank/pipeline/phase-03-retrieval/simulatte-intent-embedder.js');
const { phaseFamily } = require('./phase-module-fixture.cjs');

const scope = phaseFamily('intentEmbedder');

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function indexDocument(name) {
  return {
    schema: `simulatte.test.${name}.v1`,
    id: `test-${name}`,
    documents: [{ id: `${name}.one`, label: `${name} one` }],
  };
}

test('universe shard selection follows the Phase 2 query plan', () => {
  const universe = {
    indexConfigs: Object.fromEntries([
      'affordances',
      'analogs',
      'concepts',
      'materials',
      'operators',
      'processes',
      'relations',
      'scenes',
      'shapes',
      'synonyms',
    ].map((name) => [name, { artifact: `./${name}.json` }])),
  };

  assert.deepEqual(scope.universeIndexNamesForPrompt('three dogs', {
    universe,
    queryPlan: {
      slots: [
        { slotRole: 'actor', quantity: 3 },
        { slotRole: 'relation', spatialRelation: 'above' },
      ],
    },
  }), ['analogs', 'relations', 'shapes']);

  assert.deepEqual(scope.universeIndexNamesForPrompt('copper melts', {
    universe,
    queryPlan: {
      slots: [
        { slotRole: 'material' },
        { slotRole: 'action', process: 'phase change' },
      ],
    },
  }), ['affordances', 'materials', 'operators', 'processes']);

  assert.deepEqual(scope.universeIndexNamesForPrompt('unresolved apparatus', {
    universe,
    queryPlan: {
      slots: [{ slotRole: 'concept', modelEvidenceRequired: true }],
    },
  }), ['concepts', 'synonyms']);
});

test('universe shards load once, verify their bytes, and expose deterministic receipts', async () => {
  const previousFetch = globalThis.fetch;
  const responses = {};
  const configs = {};
  for (const name of ['concepts', 'synonyms']) {
    const text = JSON.stringify(indexDocument(name));
    responses[name] = text;
    configs[name] = {
      artifact: `./${name}.json`,
      artifactBytes: Buffer.byteLength(text),
      artifactHash: { alg: 'sha256', hex: sha256Hex(text) },
    };
  }
  const fetched = [];
  globalThis.fetch = async (url) => {
    const value = String(url);
    fetched.push(value);
    const name = value.includes('concepts.json') ? 'concepts' : 'synonyms';
    return new Response(responses[name], {
      status: 200,
      headers: { 'Content-Length': String(Buffer.byteLength(responses[name])) },
    });
  };

  const universe = {
    indexes: {},
    documentCount: 0,
    indexConfigs: configs,
    manifestUrl: 'https://simulatte.test/data/universe/manifest.json',
    assetVersionQuery: 'build=test',
    loadReceipt: {
      schema: 'simulatte.universeIndexLoadReceipt.v1',
      loadedIndexNames: [],
      transferredBytes: 0,
      fetches: [],
    },
  };

  try {
    await scope.ensureUniverseIndexes(universe, 'dogs', {
      queryPlan: { slots: [{ slotRole: 'concept', modelEvidenceRequired: true }] },
    });
    await scope.ensureUniverseIndexes(universe, 'dogs', {
      queryPlan: { slots: [{ slotRole: 'concept', modelEvidenceRequired: true }] },
    });
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.equal(fetched.length, 2);
  assert.ok(fetched.every((url) => url.endsWith('?build=test')));
  assert.deepEqual(Object.keys(universe.indexes).sort(), ['concepts', 'synonyms']);
  assert.equal(universe.documentCount, 2);
  assert.deepEqual(universe.loadReceipt.requestedIndexNames, ['concepts', 'synonyms']);
  assert.deepEqual(universe.loadReceipt.loadedIndexNames, ['concepts', 'synonyms']);
  assert.equal(
    universe.loadReceipt.transferredBytes,
    Buffer.byteLength(responses.concepts) + Buffer.byteLength(responses.synonyms)
  );
  assert.deepEqual(
    universe.loadReceipt.fetches.map((row) => row.resourceKind),
    ['universe-concepts-index', 'universe-synonyms-index']
  );
  assert.ok(universe.loadReceipt.fetches.every((row) => /^[a-f0-9]{64}$/.test(row.verifiedHash)));
  assert.ok(universe.loadReceipt.fetches.every((row) => row.durationMs >= 0));
  assert.equal(universe.loadReceipt.availableShardBytes, universe.loadReceipt.loadedShardBytes);
  assert.equal(universe.loadReceipt.deferredShardBytes, 0);
});
