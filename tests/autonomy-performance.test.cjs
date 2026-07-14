'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BUDGETS_PATH = path.join(ROOT, 'public/data/autonomy/policies/resolution-performance-budgets-v1.json');
const RECEIPT_PATH = path.join(ROOT, 'public/data/autonomy/evidence/resolution-performance-v1.json');

const harnessPromise = import('../tools/autonomy/measure-resolution-performance.mjs');

test('budgets file declares hard or record mode for every metric', () => {
  const budgets = JSON.parse(fs.readFileSync(BUDGETS_PATH, 'utf8'));
  assert.equal(budgets.schema, 'simulatte.resolutionPerformanceBudgets.v1');
  assert.ok(budgets.lanes.default_lexical, 'default lane budgets must exist');
  assert.ok(budgets.lanes.hybrid_optin, 'hybrid lane budgets must exist');
  for (const [laneId, lane] of Object.entries(budgets.lanes)) {
    for (const [budgetId, budget] of Object.entries(lane.budgets)) {
      assert.ok(['hard', 'record'].includes(budget.mode), `${laneId}.${budgetId} mode must be hard or record`);
      if (budget.mode === 'hard') {
        assert.ok('max' in budget || 'equals' in budget, `${laneId}.${budgetId} hard budget needs max or equals`);
      }
    }
  }
  // The invariants this gate exists for stay hard.
  assert.equal(budgets.lanes.default_lexical.budgets.modelDownloadBytes.mode, 'hard');
  assert.equal(budgets.lanes.default_lexical.budgets.modelDownloadBytes.max, 0);
  assert.equal(budgets.lanes.hybrid_optin.budgets.modelExecutionsOnDeterministicHits.max, 0);
  assert.equal(budgets.lanes.hybrid_optin.budgets.embeddingExecutedObserved.equals, true);
});

test('evaluateHardBudgets applies max, equals, and skips record mode', async () => {
  const { evaluateHardBudgets } = await harnessPromise;
  const checks = [];
  evaluateHardBudgets('lane', {
    under: { mode: 'hard', max: 10 },
    over: { mode: 'hard', max: 10 },
    matched: { mode: 'hard', equals: true },
    mismatched: { mode: 'hard', equals: true },
    ignored: { mode: 'record' },
    missing: { mode: 'hard', max: 5 },
  }, { under: 10, over: 11, matched: true, mismatched: false, ignored: 999 }, checks);
  const byBudget = Object.fromEntries(checks.map((row) => [row.budget, row.pass]));
  assert.equal(byBudget.under, true);
  assert.equal(byBudget.over, false);
  assert.equal(byBudget.matched, true);
  assert.equal(byBudget.mismatched, false);
  assert.equal(byBudget.missing, false, 'absent measurement must fail a hard max, never pass silently');
  assert.ok(!('ignored' in byBudget), 'record mode must not gate');
});

test('partitionLongTasks separates the model-load window from resolution', async () => {
  const { partitionLongTasks } = await harnessPromise;
  const result = partitionLongTasks({
    phaseMarks: [
      { name: 'model_load_start', atMs: 100 },
      { name: 'model_load_end', atMs: 500 },
    ],
    longTasks: [
      { startMs: 150, durationMs: 320 },
      { startMs: 600, durationMs: 80 },
      { startMs: 50, durationMs: 60 },
    ],
  });
  assert.equal(result.maxLongTaskMsDuringLoad, 320);
  assert.equal(result.maxLongTaskMsExcludingLoad, 80);
});

test('hybridViolations counts must-refuse and wrong-place outcomes', async () => {
  const { hybridViolations } = await harnessPromise;
  const result = hybridViolations({
    hybridResults: [
      { outcome: 'resolve', goldOutcome: 'refuse', nodeId: 'a', goldNodeId: null },
      { outcome: 'resolve', goldOutcome: 'resolve', nodeId: 'a', goldNodeId: 'b' },
      { outcome: 'resolve', goldOutcome: 'resolve', nodeId: 'b', goldNodeId: 'b' },
      { outcome: 'refuse', goldOutcome: 'refuse', nodeId: null, goldNodeId: null },
    ],
  });
  assert.equal(result.mustRefuseViolations, 1);
  assert.equal(result.wrongPlaceResolutions, 1);
});

test('percentile and parseByteRange behave at the boundaries', async () => {
  const { percentile, parseByteRange } = await harnessPromise;
  assert.equal(percentile([], 0.5), null);
  assert.equal(percentile([5], 0.95), 5);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2);
  assert.equal(parseByteRange('', 100), null);
  assert.deepEqual(parseByteRange('bytes=0-0', 100), { start: 0, end: 0 });
  assert.deepEqual(parseByteRange('bytes=90-', 100), { start: 90, end: 99 });
  assert.deepEqual(parseByteRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.equal(parseByteRange('bytes=100-', 100).invalid, true);
});

test('committed performance receipt stays internally consistent', (t) => {
  if (!fs.existsSync(RECEIPT_PATH)) return t.skip('no performance receipt committed on this host');
  const receipt = JSON.parse(fs.readFileSync(RECEIPT_PATH, 'utf8'));
  assert.equal(receipt.schema, 'simulatte.resolutionPerformanceEvaluation.v1');
  assert.ok(receipt.budgets.sha256.length === 64, 'receipt must pin the budgets file hash');
  for (const check of receipt.hardChecks) {
    assert.ok(['hard'].includes(check.mode));
    assert.ok(typeof check.pass === 'boolean');
  }
  const allPass = receipt.hardChecks.every((row) => row.pass) && receipt.hardChecks.length > 0;
  assert.equal(receipt.accepted, allPass, 'accepted must equal the conjunction of hard checks');
  if (receipt.lanes.hybrid_optin) {
    assert.equal(receipt.lanes.hybrid_optin.measured.modelExecutionsOnDeterministicHits, 0);
    assert.equal(receipt.lanes.hybrid_optin.measured.mustRefuseViolations, 0);
    assert.equal(receipt.lanes.hybrid_optin.measured.wrongPlaceResolutions, 0);
  }
});
