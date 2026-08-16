const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const modulePromise = import('../tools/causal-phase-diagnosis.mjs');

function hash(label) {
  return `sha256:${crypto.createHash('sha256').update(label).digest('hex')}`;
}

function observations(failingPhase = 4) {
  const ids = [
    'runtime', 'language', 'retrieval', 'grounded-intent',
    'simulation', 'visual', 'render', 'scene-proof',
  ];
  return ids.map((phaseId, index) => ({
    phase: index + 1,
    phaseId,
    status: index + 1 < failingPhase ? 'pass' : index + 1 === failingPhase ? 'fail' : 'not-proven',
    obligationIds: index + 1 === failingPhase ? ['critical:entity'] : [],
    artifact: {
      schema: `fixture.phase${index + 1}.v1`,
      quality: index + 1 === failingPhase ? 'bad' : 'retained',
    },
  }));
}

function lane(role, implementationLabel, verdictFor) {
  return {
    id: `${role}:fixture`,
    implementationHash: hash(implementationLabel),
    run: async (context) => ({
      verdict: verdictFor(context.artifact),
      role,
      artifactQuality: context.artifact.quality,
      execution: {
        schema: 'simulatte.downstreamReplayExecution.v1',
        inputArtifactHash: context.inputArtifactHash,
        startedAfterPhase: context.phase,
        executedPhaseIds: context.requiredPhaseIds,
        completedThroughPhase: 8,
      },
    }),
  };
}

test('earliest divergence remains diagnostic until four substitutions isolate the phase output', async () => {
  const diagnosis = await modulePromise;
  const rows = observations();
  assert.deepEqual(diagnosis.earliestObservableDivergence(rows), {
    phase: 4,
    phaseId: 'grounded-intent',
    status: 'fail',
    obligationIds: ['critical:entity'],
  });

  const receipt = await diagnosis.diagnosePhaseBoundary({
    observations: rows,
    knownGoodArtifact: { schema: 'fixture.phase4.v1', quality: 'good' },
    candidateLane: lane('candidate', 'candidate-v1', (artifact) => artifact.quality === 'good' ? 'pass' : 'fail'),
    referenceLane: lane('reference', 'reference-v1', (artifact) => artifact.quality === 'good' ? 'pass' : 'fail'),
  });

  assert.equal(receipt.schema, diagnosis.DIAGNOSIS_SCHEMA);
  assert.equal(receipt.retainedFailureArtifacts.length, 8);
  assert.deepEqual(receipt.experiments.map((row) => [row.id, row.verdict]), [
    ['candidate:suspect', 'fail'],
    ['candidate:known-good', 'pass'],
    ['reference:suspect', 'fail'],
    ['reference:known-good', 'pass'],
  ]);
  assert.deepEqual(receipt.attribution, {
    status: 'proven',
    owner: 'suspect-phase-output',
    reason: 'Both downstream implementations fail on the suspect artifact and pass on the known-good substitution.',
  });
  assert.equal(diagnosis.validateDiagnosis(receipt), receipt);
});

test('diagnosis distinguishes a downstream implementation failure from a bad phase artifact', async () => {
  const diagnosis = await modulePromise;
  const receipt = await diagnosis.diagnosePhaseBoundary({
    observations: observations(),
    knownGoodArtifact: { schema: 'fixture.phase4.v1', quality: 'good' },
    candidateLane: lane('candidate', 'broken-candidate', () => 'fail'),
    referenceLane: lane('reference', 'working-reference', () => 'pass'),
  });

  assert.equal(receipt.attribution.status, 'proven');
  assert.equal(receipt.attribution.owner, 'candidate-downstream');
});

test('diagnosis rejects lane aliases and refuses inconclusive causal ownership', async () => {
  const diagnosis = await modulePromise;
  const sharedHash = hash('same-implementation');
  await assert.rejects(
    diagnosis.diagnosePhaseBoundary({
      observations: observations(),
      knownGoodArtifact: { schema: 'fixture.phase4.v1', quality: 'good' },
      candidateLane: { ...lane('candidate', 'candidate', () => 'fail'), implementationHash: sharedHash },
      referenceLane: { ...lane('reference', 'reference', () => 'pass'), implementationHash: sharedHash },
    }),
    /distinct identities and hashes/
  );

  const inconclusive = await diagnosis.diagnosePhaseBoundary({
    observations: observations(),
    knownGoodArtifact: { schema: 'fixture.phase4.v1', quality: 'good' },
    candidateLane: lane('candidate', 'candidate-mixed', (artifact) => artifact.quality === 'good' ? 'pass' : 'fail'),
    referenceLane: lane('reference', 'reference-accepts-all', () => 'pass'),
  });
  assert.equal(inconclusive.attribution.status, 'not-proven');
  assert.equal(inconclusive.attribution.owner, 'inconclusive');

  const tampered = structuredClone(inconclusive);
  tampered.attribution.status = 'proven';
  tampered.attribution.owner = 'suspect-phase-output';
  assert.throws(() => diagnosis.validateDiagnosis(tampered), /attribution does not match/);
});

test('diagnosis rejects a downstream lane that skips required replay phases', async () => {
  const diagnosis = await modulePromise;
  const skipped = lane('candidate', 'skipped-candidate', () => 'fail');
  skipped.run = async (context) => ({
    verdict: 'fail',
    execution: {
      schema: 'simulatte.downstreamReplayExecution.v1',
      inputArtifactHash: context.inputArtifactHash,
      startedAfterPhase: context.phase,
      executedPhaseIds: context.requiredPhaseIds.slice(1),
      completedThroughPhase: 8,
    },
  });

  await assert.rejects(
    diagnosis.diagnosePhaseBoundary({
      observations: observations(),
      knownGoodArtifact: { schema: 'fixture.phase4.v1', quality: 'good' },
      candidateLane: skipped,
      referenceLane: lane('reference', 'complete-reference', () => 'pass'),
    }),
    /skipped or misidentified required replay phases/
  );
});

test('causal diagnosis CLI runs distinct downstream modules and writes a validated receipt', async () => {
  const diagnosis = await modulePromise;
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-causal-diagnosis-'));
  const failurePath = path.join(temporary, 'failure-run.json');
  const goodPath = path.join(temporary, 'known-good.json');
  const receiptPath = path.join(temporary, 'receipt.json');
  fs.writeFileSync(failurePath, JSON.stringify({
    schema: diagnosis.FAILURE_RUN_SCHEMA,
    observations: observations(),
  }));
  fs.writeFileSync(goodPath, JSON.stringify({ schema: 'fixture.phase4.v1', quality: 'good' }));

  const result = spawnSync(process.execPath, [
    'tools/causal-phase-diagnosis.mjs',
    '--failure-run', failurePath,
    '--known-good', goodPath,
    '--candidate-runner', 'tests/fixtures/causal-phase-candidate-runner.mjs',
    '--reference-runner', 'tests/fixtures/causal-phase-reference-runner.mjs',
    '--out', receiptPath,
  ], { cwd: root, encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /causal diagnosis proven: suspect-phase-output/);
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.attribution.owner, 'suspect-phase-output');
  assert.equal(diagnosis.validateDiagnosis(receipt), receipt);
});
