const assert = require('node:assert/strict');
const test = require('node:test');

const deterministicValues = require('../public/shared/deterministic-values.js');
const positiveLanguage = require('../public/shared/language/positive-language.js');
const streetNames = require('../public/shared/streets/street-name.js');
const tierRegistry = require('../public/simulatte/app/tier-registry.js');
const runViewModel = require('../public/blank/app/runtime/run-view-model.js');

test('deterministic values preserve the two legacy FNV text encodings', () => {
  assert.equal(deterministicValues.fnv1a32('simulatte'), 2871554795);
  assert.equal(deterministicValues.fnv1a32CodePoints('simulatte'), 2871554795);
  assert.notEqual(
    deterministicValues.fnv1a32('world-🌎'),
    deterministicValues.fnv1a32CodePoints('world-🌎')
  );
  assert.equal(deterministicValues.round9(1 / 3), 0.333333333);
});

test('positive language removes negated phrases without erasing later clauses', () => {
  assert.equal(
    positiveLanguage.positiveLanguageText('A robot, without a crane, moves a parcel.', { lowercase: true }),
    'a robot, , moves a parcel.'
  );
  assert.equal(
    positiveLanguage.positiveLanguageText('No smoke but bright Steam', { lowercase: true }),
    'but bright steam'
  );
});

test('street and tier registries own canonical cross-surface mappings', () => {
  assert.equal(streetNames.normalizeStreetName('Main Avenue'), 'main av');
  assert.equal(streetNames.normalizeStreetWords('The Main Ave.', { omitArticles: true }).join(' '), 'main av');
  assert.equal(tierRegistry.tierDefinition('world').rendererMethod, 'drawWorld');
  assert.equal(tierRegistry.tierDefinition('city').canvasVisible, false);
  assert.deepEqual(tierRegistry.TIER_IDS, ['city', 'country', 'world', 'solar-system', 'star-chart']);
});

test('run view model projects one eight-phase status and receipt contract', () => {
  const view = runViewModel.project({
    runId: 'run-1',
    state: 'active',
    phase: { step: 4 },
    taskElapsedMs: 12.5,
  }, {
    inputIdentity: { sha256: 'input-hash' },
    outputIdentity: { id: 'grounding-output' },
    candidateCount: 7,
    loss: 0.125,
  });

  assert.equal(view.phases.length, 8);
  assert.deepEqual(view.phases.slice(0, 3).map((phase) => phase.status), ['passed', 'passed', 'passed']);
  assert.equal(view.phases[3].status, 'running');
  assert.equal(view.phases[3].inputIdentity, 'input-hash');
  assert.equal(view.phases[3].candidateCount, 7);
  assert.equal(Object.isFrozen(view.phases), true);
});

test('run view model retains per-phase artifacts through render and proof settlement', () => {
  const initial = runViewModel.project({
    runId: 'run-2',
    state: 'active',
    phase: { step: 3 },
  }, { phaseStep: 3, taskPercent: 100, durationMs: 8.5 });
  const compiled = runViewModel.recordSpec(initial, {
    phaseArtifacts: {
      phase1: {
        schema: 'simulatte.phase1.output.v1',
        inputSchema: 'simulatte.phase1.input.v1',
        receipts: [{ providerReady: true }],
      },
      phase3: {
        schema: 'simulatte.phase3.output.v2',
        inputSchema: 'simulatte.phase2.output.v1',
        receipts: [{ activationCount: 64, missingRequiredSlots: 2 }],
      },
    },
  });
  const settled = runViewModel.recordSceneProof(compiled, {
    durationMs: 2.5,
    phase7Output: {
      schema: 'simulatte.phase7.output.v2',
      inputSchema: 'simulatte.phase6.output.v2',
      artifact: { renderExecution: { frameMs: 1.25 } },
      receipts: [{ sceneInstanceCount: 12, failedObligations: 0 }],
    },
    phase8Output: {
      schema: 'simulatte.phase8.output.v2',
      inputSchema: 'simulatte.phase7.output.v2',
      artifact: {
        sceneProof: {
          verdict: 'pass',
          summary: { requiredCount: 6, lostCount: 0, notProvenCount: 0 },
        },
      },
    },
  });

  assert.equal(settled.phases[2].outputIdentity, 'simulatte.phase3.output.v2');
  assert.equal(settled.phases[2].candidateCount, 64);
  assert.equal(settled.phases[2].loss, 2);
  assert.equal(settled.phases[6].durationMs, 1.25);
  assert.equal(settled.phases[7].status, 'passed');
  assert.equal(settled.phases[7].durationMs, 2.5);
  assert.equal(settled.receipt.phases[7].candidateCount, 6);
});
