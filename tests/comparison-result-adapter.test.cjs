const assert = require('node:assert/strict');
const test = require('node:test');

const adapter = require('../public/simulatte/platform/core/simulation/comparison-result-adapter.js');
const contracts = require('../public/simulatte/platform/contracts/plugin-v4-contracts.js');
const comparisonContracts = require('../public/simulatte/platform/core/simulation/comparison-contracts.js');

function modelRecord() {
  const envelope = contracts.createProvenanceEnvelope({
    subjectId: 'fixture:model',
    subjectKind: 'model',
    axes: {
      origin: 'modeled',
      temporalStatus: 'forecast',
      uncertainty: { kind: 'missing', value: { reason: 'fixture model' } },
    },
    datasetIds: ['fixture:dataset'],
    artifactSha256: 'a'.repeat(64),
    parentIds: [],
    modelReceiptId: 'fixture:model',
    scenarioEpoch: 'scenario:fixture',
    contentVersion: 'fixture-v1',
    license: { required: false, identifier: null },
  });
  return {
    schema: 'simulatte.provenanceRecord.v4',
    id: 'fixture:model',
    kind: 'model',
    datasetId: 'fixture:dataset',
    contentHash: 'a'.repeat(64),
    parentIds: [],
    metadata: {},
    envelope,
  };
}

test('terminal plugin outcomes become a real settled synchronized comparison execution', async () => {
  const receipt = await adapter.createSettledComparison({
    pluginId: 'fixture',
    scenario: { id: 'fixture-scenario', seed: 'fixture-seed' },
    comparisonId: 'fixture:comparison',
    branches: {
      baseline: { served: 7, nested: { burden: 4 }, label: 'baseline' },
      intervention: { served: 9, nested: { burden: 2 }, label: 'intervention' },
    },
    contribution: {
      pluginId: 'fixture',
      provenanceRecords: [modelRecord()],
    },
  });
  comparisonContracts.validateExecutionReceipt(receipt);
  assert.equal(receipt.state, 'settled');
  assert.equal(receipt.history.length, 1);
  assert.deepEqual(receipt.history[0].advancedRoles, ['baseline', 'intervention']);
  assert.deepEqual(
    receipt.settlement.metricDeltas.map((row) => [row.id, row.delta]),
    [['nested.burden', -2], ['served', 2]],
  );
  assert.equal(receipt.settlement.evidenceClosure.status, 'closed');
});

test('comparison adapter fails closed when branch metrics are incompatible', async () => {
  await assert.rejects(
    adapter.createSettledComparison({
      pluginId: 'fixture',
      scenario: { id: 'fixture-scenario', seed: 'fixture-seed' },
      comparisonId: 'fixture:comparison',
      branches: {
        baseline: { served: 7 },
        intervention: { burden: 2 },
      },
      contribution: {
        pluginId: 'fixture',
        provenanceRecords: [modelRecord()],
      },
    }),
    { code: 'comparison_adapter_metrics_missing' },
  );
});
