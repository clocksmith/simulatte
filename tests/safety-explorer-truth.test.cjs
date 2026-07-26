const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shrinkage = require('../public/shared/plugins/safety-explorer/fixed-sparse-count-shrinkage.js');
const plugin = require('../public/shared/plugins/safety-explorer/index.js');
const v4Contracts = require('../public/simulatte/platform/contracts/plugin-v4-contracts.js');

const root = path.resolve(__dirname, '..');
const pluginDirectory = path.join(root, 'public/shared/plugins/safety-explorer');
const index = json(path.join(root, 'public/data/simulatte/safety-history-index-v1.json'));
const config = json(path.join(pluginDirectory, 'default-config.json'));
const manifest = json(path.join(pluginDirectory, 'plugin.json'));

test('fixed sparse-count shrinkage publishes its exact fixed formula, K, corpus mean, and severity weights', () => {
  const receipt = shrinkage.methodReceipt(index.segmentRows, config.fixedSparseCountShrinkage);
  assert.equal(receipt.name, 'fixed sparse-count shrinkage');
  assert.equal(receipt.k, 4);
  assert.deepEqual(receipt.severityWeights, { crash: 1, injury: 3, fatality: 10 });
  assert.match(receipt.formula, /K \* corpusMean/);
  assert.equal(receipt.corpusMean, Number(shrinkage.corpusMean(index.segmentRows, receipt.severityWeights).toFixed(8)));
  assert.equal(receipt.calibrationStatus, 'fixed_not_calibrated');
  assert.doesNotMatch(receipt.name, /empirical|bayes/i);
});

test('the estimate is monotone in observed severity and K stabilizes it toward the fixed corpus mean', () => {
  const mean = 2;
  const base = { crashCount: 3, injuryCount: 0, fatalityCount: 0 };
  const injured = { ...base, injuryCount: 1 };
  const fatal = { ...injured, fatalityCount: 1 };
  const options = { ...config.fixedSparseCountShrinkage, corpusMean: mean };
  const baseValue = shrinkage.estimate(base, options);
  const injuredValue = shrinkage.estimate(injured, options);
  const fatalValue = shrinkage.estimate(fatal, options);
  assert.ok(injuredValue > baseValue);
  assert.ok(fatalValue > injuredValue);
  const noShrinkage = shrinkage.estimate(fatal, { ...options, k: 0 });
  const strongShrinkage = shrinkage.estimate(fatal, { ...options, k: 32 });
  assert.ok(Math.abs(strongShrinkage - mean) < Math.abs(noShrinkage - mean));
});

test('route audits preserve observations and joins while zero or absent history remains neutral unknown evidence', async () => {
  const known = index.segmentRows[0];
  const zero = {
    ...known,
    segmentId: 'fixture-zero-observation',
    physicalKey: 'fixture-zero-observation',
    crashCount: 0,
    injuryCount: 0,
    fatalityCount: 0,
    historicalObservationScore: 0,
    collisionIds: [],
  };
  const fixtureIndex = {
    ...index,
    segmentRows: [known, zero, ...index.segmentRows.slice(1)],
  };
  const originalKnown = JSON.stringify(known);
  const originalZero = JSON.stringify(zero);
  const host = fixture(fixtureIndex);
  const instance = await plugin.activate({ sdk: host.sdk, config });
  const contributor = instance.createRouteContributor();

  const knownEvaluation = contributor.evaluateSegment({ segment: { id: known.segmentId } });
  const zeroEvaluation = contributor.evaluateSegment({ segment: { id: zero.segmentId } });
  const missingEvaluation = contributor.evaluateSegment({ segment: { id: 'fixture-missing-segment' } });
  assert.equal(knownEvaluation.receipt.observationStatus, 'reported_history');
  assert.equal(knownEvaluation.receipt.exposureStatus, 'unknown');
  assert.deepEqual(knownEvaluation.receipt.collisionIds, known.collisionIds);
  assert.equal(zeroEvaluation.costDimensions.severityWeightedObservation, 0);
  assert.equal(zeroEvaluation.receipt.observationStatus, 'zero_observation');
  assert.equal(missingEvaluation.costDimensions.severityWeightedObservation, 0);
  assert.equal(missingEvaluation.receipt.observationStatus, 'no_joined_observation');
  assert.equal(missingEvaluation.receipt.fixedSparseCountEstimate, null);

  const audit = contributor.evaluateRoute({
    route: { segmentIds: [known.segmentId, zero.segmentId, 'fixture-missing-segment'] },
  });
  assert.equal(audit.schema, 'simulatte.plugin.safetyExplorerRouteAudit.v2');
  assert.equal(audit.sourcePeriod.start, index.source.periodStart);
  assert.equal(audit.sourcePeriod.endExclusive, index.source.periodEndExclusive);
  assert.deepEqual(audit.unmatchedSourceCollisionIds, index.unjoinedCollisionIds);
  assert.equal(audit.unknownSegmentCount, 2);
  assert.equal(audit.exposureStatus, 'unknown');
  assert.equal(audit.method.name, 'fixed sparse-count shrinkage');
  assert.equal(JSON.stringify(known), originalKnown);
  assert.equal(JSON.stringify(zero), originalZero);
  assert.equal(host.receipts[0], audit);

  const presentation = instance.present();
  const unknownPath = presentation.paths.find((row) => row.id === 'unknown-observation-route');
  assert.equal(unknownPath.tone, 'gray');
  assert.equal(presentation.paths.some((row) => row.tone === 'green'), false);
  assert.match(instance.view()[0].rows.find((row) => row.label === 'Claim warning').value, /do not identify a safest route/i);
  assert.equal(instance.view()[0].fields.some((row) => row.id === 'joinRadiusM'), false);

  const contribution = instance.contributeV4();
  v4Contracts.validateContribution(contribution);
  assert.ok(contribution.controls.controls.some((row) => row.id === 'shrinkageK'));
  assert.ok(contribution.presentation.layers.some((row) => row.id === 'unknown-observation-route' && row.role === 'uncertainty'));
  assert.ok(contribution.inspections[0].fields.some((row) => row.id === 'match-status'));
  assert.match(contribution.inspections[0].fields.find((row) => row.id === 'claim-warning').value, /cannot identify or claim a safest route/i);
});

test('sensitivity controls recompute derived route state without mutating observations', async () => {
  const host = fixture(index);
  const instance = await plugin.activate({ sdk: host.sdk, config });
  const known = index.segmentRows[0];
  const original = structuredClone(known);
  const initial = instance.createRouteContributor().evaluateRoute({ route: { segmentIds: [known.segmentId] } });
  const result = instance.handleAction('scenario.run', {
    values: {
      phase: 'start',
      shrinkageK: 8,
      crashWeight: 1,
      injuryWeight: 5,
      fatalityWeight: 20,
    },
  });
  assert.equal(result.status, 'running');
  assert.equal(host.state().parameters.k, 8);
  assert.deepEqual(host.state().parameters.weights, { crash: 1, injury: 5, fatality: 20 });
  assert.notEqual(host.state().audit.fixedSparseCountEstimate, initial.fixedSparseCountEstimate);
  assert.equal(host.state().audit.crashCount, initial.crashCount);
  assert.equal(host.state().audit.injuryCount, initial.injuryCount);
  assert.equal(host.state().audit.fatalityCount, initial.fatalityCount);
  assert.deepEqual(known, original);
  assert.equal(instance.contributeV4().controls.controls.some((row) => row.id === 'joinRadiusM'), false);
  assert.match(instance.contributeV4().controls.comparisons[0].label, /K=8 baseline vs K=16 sensitivity/);
});

function fixture(dataset) {
  let reducer = null;
  let state = null;
  const receipts = [];
  return {
    receipts,
    state: () => state,
    sdk: {
      datasets: {
        require(id) {
          assert.equal(id, 'nyc-crash-history-2025-07-to-2026-07-v1');
          return dataset;
        },
        receipt(id) {
          const declaration = manifest.datasets.find((row) => row.id === id);
          return { id, sha256: declaration.reference.sha256 };
        },
      },
      state: {
        register(nextReducer, initialState) {
          reducer = nextReducer;
          state = initialState;
        },
        read: () => state,
      },
      events: {
        propose(event) {
          state = reducer(state, event);
          return event;
        },
      },
      receipts: {
        append(receipt) {
          assert.ok(manifest.receiptSchemas.includes(receipt.schema));
          receipts.push(receipt);
          return receipt;
        },
      },
    },
  };
}

function json(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}
