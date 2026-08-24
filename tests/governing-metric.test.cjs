const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const contractFile = path.join(root, 'tools/samer/simulatte-public-governing-metric-v1.json');

async function modules() {
  const compiler = await import(pathToFileURL(
    path.join(root, 'tools/samer/compile-governing-metric.mjs')
  ));
  const gold = await import(pathToFileURL(
    path.join(root, 'tools/samer/gold-visual-evaluator.mjs')
  ));
  return { compiler, gold };
}

function dimension(report, id) {
  return report.dimensions.find((row) => row.id === id);
}

function loadArchivedEvidenceFixture(compiler) {
  const input = compiler.loadGoverningMetricInputs(contractFile);
  const buildIds = new Set([
    ...input.pointers.goldReports.flatMap(({ pointer }) => (
      pointer.value.results.map((row) => row.buildId)
    )),
    ...input.pointers.boundaryReports.map(({ pointer }) => pointer.value.buildId),
  ]);
  assert.equal(buildIds.size, 1, 'archived governing-metric evidence must bind one build');
  input.pointers.build.value.build = [...buildIds][0];
  return input;
}

test('public governing metric keeps machine proof, human proof, scope, and dimensions separate', async () => {
  const { compiler } = await modules();
  const report = compiler.buildGoverningMetricReport(
    loadArchivedEvidenceFixture(compiler)
  );
  assert.equal(report.schema, 'simulatte.publicGoverningMetricReport.v1');
  assert.equal(report.status, 'not-proven');
  assert.equal(report.pass, false);
  assert.equal(report.promotionStatus, 'not-authorized');
  assert.equal(report.scope.sealedHoldout, false);
  assert.equal(report.scope.promotionAuthority, false);
  assert.equal(report.machineGate.status, 'pass');
  assert.equal(report.humanGate.status, 'not-proven');
  assert.equal(report.northStar.promptCount, 8);
  assert.equal(report.northStar.machinePassRate, 1);
  assert.equal(report.northStar.gatedPassRate, 0);
  assert.deepEqual(report.northStar.difficultySummaries.map((row) => (
    [row.difficulty, row.promptCount, row.machinePassCount, row.gatedPassCount]
  )), [
    ['easy', 3, 3, 0],
    ['medium', 3, 3, 0],
    ['hard', 2, 2, 0],
  ]);
  assert.equal(dimension(report, 'requirement-extraction-recall').status, 'pass');
  assert.equal(dimension(report, 'visual-settlement').status, 'not-proven');
  assert.equal(dimension(report, 'memory').status, 'pass');
  assert.equal(dimension(report, 'memory').observations.executionCount, 18);
  assert.equal(dimension(report, 'memory').observations.physicalGpuMemoryStatus, 'not-measured');
  assert.equal(dimension(report, 'retained-human-satisfaction').status, 'not-measured');
  assert.equal(
    dimension(report, 'refusal-correctness').observations.generalOpenWorldRefusalRecall,
    'not-measured'
  );
  assert.equal(report.boundaryDiagnostics.status, 'pass');
  assert.match(report.sources.contract.sha256, /^[a-f0-9]{64}$/);
  assert.match(report.sources.goldSet.sha256, /^[a-f0-9]{64}$/);
  assert.match(report.sources.boundarySet.sha256, /^[a-f0-9]{64}$/);
});

test('one critical prompt failure fails the governing machine gate instead of averaging away', async () => {
  const { compiler, gold } = await modules();
  const input = loadArchivedEvidenceFixture(compiler);
  const goldSet = input.pointers.goldSet.value;
  const source = input.pointers.goldReports[0].pointer.value;
  source.results[0].phase2IntentRequirementLedger.requirements.shift();
  source.summary.goldEvaluation = gold.evaluateGoldVisualResults(source.results, goldSet, null);
  const report = compiler.buildGoverningMetricReport(input);
  assert.equal(report.status, 'fail');
  assert.equal(report.machineGate.status, 'fail');
  assert.equal(report.machineGate.failureCount > 0, true);
  assert.equal(report.northStar.machinePassCount, 7);
  assert.equal(report.northStar.machinePassRate, 0.875);
  assert.equal(dimension(report, 'requirement-extraction-recall').status, 'fail');
});

test('governing metric rejects stale builds and incomplete boundary evidence', async () => {
  const { compiler } = await modules();
  const stale = loadArchivedEvidenceFixture(compiler);
  stale.pointers.goldReports[0].pointer.value.results[0].buildId = 'stale-build';
  assert.throws(() => compiler.buildGoverningMetricReport(stale), /stale build/);

  const incomplete = loadArchivedEvidenceFixture(compiler);
  incomplete.pointers.boundaryReports.pop();
  assert.throws(
    () => compiler.buildGoverningMetricReport(incomplete),
    /requires every declared boundary report/
  );
});
