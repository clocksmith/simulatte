const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');

async function getCompiler() {
  return import(pathToFileURL(path.join(root, 'tools/compile-human-reviews.mjs')));
}

test('compileReviews aggregates critiques by phase and generates actionable heuristics and training candidates', async () => {
  const { compileReviews } = await getCompiler();

  const mockReviews = [
    {
      id: 'rev-1',
      status: 'pass',
      phaseTo: 2,
      phaseLabel: '1->2',
      prompt: 'A solar-powered rover navigating the dunes',
      feedback: 'Intent and tokens extracted correctly.',
    },
    {
      id: 'rev-2',
      status: 'critique',
      phaseTo: 2,
      phaseLabel: '1->2',
      prompt: 'Two autonomous boats avoiding a cargo ship without touching shallow water',
      feedback: 'Failed to parse clause negation: "without touching"',
    },
    {
      id: 'rev-3',
      status: 'fail',
      phaseTo: 5,
      phaseLabel: '1->5',
      prompt: 'Two autonomous boats avoiding a cargo ship without touching shallow water',
      feedback: 'Solver step size too coarse, boats clip through shore boundary',
    },
    {
      id: 'rev-4',
      status: 'critique',
      phaseTo: 7,
      phaseLabel: '1->7',
      prompt: 'NYC nighttime traffic with glowing streetlights',
      feedback: 'Uniform buffer alignment warning in WebGPU draw packet',
    },
  ];

  const result = compileReviews(mockReviews);

  assert.equal(result.heuristics.schema, 'simulatte.compiledHumanCritiqueHeuristics.v1');
  assert.equal(result.heuristics.reviewCount, 4);
  assert.equal(result.heuristics.statusSummary.pass, 1);
  assert.equal(result.heuristics.statusSummary.critique, 2);
  assert.equal(result.heuristics.statusSummary.fail, 1);

  // Phase heuristics
  assert.ok(result.heuristics.phaseHeuristics['phase-02']);
  assert.equal(result.heuristics.phaseHeuristics['phase-02'].critiqueCount, 2);
  assert.ok(result.heuristics.phaseHeuristics['phase-05']);
  assert.equal(result.heuristics.phaseHeuristics['phase-05'].critiqueCount, 1);
  assert.ok(result.heuristics.phaseHeuristics['phase-07']);
  assert.equal(result.heuristics.phaseHeuristics['phase-07'].critiqueCount, 1);

  // Training candidates
  assert.equal(result.candidates.schema, 'simulatte.compiledTrainingCandidates.v1');
  assert.equal(result.candidates.candidateCount, 2);
  const boatCandidate = result.candidates.candidates.find((c) => c.prompt.includes('autonomous boats'));
  assert.ok(boatCandidate);
  assert.equal(boatCandidate.failureCount, 2);
  assert.equal(boatCandidate.targetSuitability, 'high-priority-calibration');
  assert.deepEqual(boatCandidate.failedPhases.sort(), ['1->2', '1->5']);

  // Receipt
  assert.equal(result.receipt.schema, 'simulatte.calibrationReceipt.v1');
  assert.equal(result.receipt.reviewCount, 4);
  assert.equal(result.receipt.passCount, 1);
  assert.equal(result.receipt.critiqueCount, 3);
  assert.equal(result.receipt.candidatesCompiled, 2);
});
