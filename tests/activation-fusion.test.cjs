const assert = require('node:assert/strict');
const test = require('node:test');

const lab = require('../public/pipeline/phase-05-simulation/simulatte-physics-model.js');

const INJECTED_PRIMITIVES = [
  { id: 'dog', label: 'dog', source: 'prompt-explicit', score: 0.9, modelRerankScore: 0.9, lexicalScore: 1 },
  { id: 'cat', label: 'cat', source: 'prompt-explicit', score: 0.86, modelRerankScore: 0.86, lexicalScore: 1 },
  { id: 'water', label: 'water', source: 'prompt-family', score: 0.8, modelRerankScore: 0.8, lexicalScore: 0.5 },
];

function fusedActivationCloud(prompt) {
  const spec = lab.createSpecFromPrompt(prompt, {
    allowPrototypeFallback: true,
    rankedPrimitives: INJECTED_PRIMITIVES,
  });
  return {
    spec,
    activationCloud: spec.phaseArtifacts.phase3.artifact.activationCloud,
    receipts: spec.phaseArtifacts.phase3.receipts,
  };
}

test('activation fusion issues per-obligation verdicts with strength and provenance', () => {
  const { activationCloud, receipts } = fusedActivationCloud('dogs and cats swimming in a lake');
  const verdicts = activationCloud.obligationVerdicts;
  assert.ok(Array.isArray(verdicts) && verdicts.length > 0);
  for (const row of verdicts) {
    assert.equal(row.schema, 'simulatte.obligationVerdict.v1');
    assert.ok(lab.OBLIGATION_VERDICTS.includes(row.verdict), `${row.obligationId} verdict ${row.verdict}`);
  }

  const dog = verdicts.find((row) => row.obligationId === 'entity:dog');
  assert.ok(dog, 'dog obligation has a verdict');
  assert.ok(['supported', 'strongly-supported'].includes(dog.verdict), `dog verdict ${dog.verdict} is evidence-backed`);
  assert.ok(dog.supportStrength > 0);
  assert.ok(dog.provenance.length >= 1);
  assert.ok(dog.provenance.every((row) => row.candidateId && typeof row.supportStrength === 'number'));

  const water = verdicts.find((row) => row.obligationId === 'medium:water');
  assert.ok(water, 'inferred water obligation has a verdict');
  assert.equal(water.inferred, true);
  assert.equal(water.verdict, 'inferred');

  const visualVerdicts = verdicts.filter((row) => row.kind === 'visual');
  assert.ok(visualVerdicts.length >= 1);
  assert.ok(visualVerdicts.every((row) => row.verdict === 'pending'));

  const fusionReceipt = receipts.find((row) => row.id === 'phase3-activation-fusion');
  assert.equal(fusionReceipt.obligationVerdictCount, verdicts.length);
  assert.equal(
    fusionReceipt.stronglySupportedCount,
    verdicts.filter((row) => row.verdict === 'strongly-supported').length
  );
  assert.ok(verdicts.some((row) => ['supported', 'strongly-supported'].includes(row.verdict)));
  assert.equal(typeof activationCloud.conflictsBySlot, 'object');
});

test('negated entities produce negative evidence and never reach the accepted graph', () => {
  const { spec, activationCloud } = fusedActivationCloud('dogs but no cats swim in the lake');
  const negatedEntries = activationCloud.negativeEvidence.filter((row) => row.kind === 'negated-entry');
  assert.ok(negatedEntries.some((row) => /cat/.test(`${row.entryId} ${row.label}`)));

  assert.ok(!activationCloud.obligationVerdicts.some((row) => row.obligationId === 'entity:cat'));

  const grounded = spec.phaseArtifacts.phase4.artifact.groundedIntent;
  const acceptedNodes = grounded.acceptedGraph && grounded.acceptedGraph.nodes || [];
  const catAccepted = acceptedNodes.filter((node) => (
    /\bcats?\b/.test(`${node.label || ''} ${node.canonicalId || ''} ${node.id || ''}`.toLowerCase())
  ));
  assert.equal(catAccepted.length, 0);
  assert.ok(grounded.negativeEvidence.some((row) => /cat/.test(`${row.entryId} ${row.label}`)));

  const dogVerdict = activationCloud.obligationVerdicts.find((row) => row.obligationId === 'entity:dog');
  assert.ok(dogVerdict);
  assert.notEqual(dogVerdict.verdict, 'negated');
});

test('verdict rows settle negation conflicts and slot ambiguity deterministically', () => {
  const compositionLedger = {
    obligations: [
      { id: 'entity:cat', kind: 'entity', target: 'cat', required: true, status: 'preserved' },
      { id: 'entity:dog', kind: 'entity', target: 'dog', required: true, status: 'preserved' },
      { id: 'environment:lake', kind: 'environment', target: 'lake', required: true, status: 'preserved' },
    ],
  };
  const slotEvidence = [
    {
      slotId: 'slot.actor.cat',
      entryId: 'entity:cat',
      slotRole: 'actor',
      acceptedCandidates: [
        { candidateId: 'cat', candidateType: 'primitive', score: 0.8, modelRerankScore: 0.8, lexicalScore: 1 },
      ],
      supportOnlyCandidates: [],
    },
    {
      slotId: 'slot.actor.dog',
      entryId: 'entity:dog',
      slotRole: 'actor',
      acceptedCandidates: [
        { candidateId: 'dog', candidateType: 'primitive', score: 0.58, modelRerankScore: 0.55, lexicalScore: 0.2 },
        { candidateId: 'surface.dog', candidateType: 'surface-card', score: 0.55, modelRerankScore: 0.55, lexicalScore: 0.2 },
      ],
      supportOnlyCandidates: [],
    },
    {
      slotId: 'slot.environment.lake',
      entryId: 'environment:lake',
      slotRole: 'environment',
      acceptedCandidates: [
        { candidateId: 'lake', candidateType: 'primitive', score: 0.9, modelRerankScore: 0.9, lexicalScore: 0.8 },
      ],
      supportOnlyCandidates: [],
    },
  ];
  const negativeEvidence = [
    { kind: 'negated-entry', entryId: 'entity:cat', label: 'cats', source: 'scene-language-graph' },
  ];
  const acceptedCandidatesBySlot = {
    'slot.actor.cat': slotEvidence[0].acceptedCandidates,
    'slot.actor.dog': slotEvidence[1].acceptedCandidates,
    'slot.environment.lake': slotEvidence[2].acceptedCandidates,
  };

  const verdicts = lab.obligationVerdictRows({
    compositionLedger,
    acceptedCandidatesBySlot,
    slotEvidence,
    negativeEvidence,
  });
  const cat = verdicts.find((row) => row.obligationId === 'entity:cat');
  assert.equal(cat.verdict, 'negated');
  assert.equal(cat.negationConflict, true);
  const dog = verdicts.find((row) => row.obligationId === 'entity:dog');
  assert.equal(dog.verdict, 'supported');
  assert.ok(dog.supportStrength < 0.62);
  const lake = verdicts.find((row) => row.obligationId === 'environment:lake');
  assert.equal(lake.verdict, 'strongly-supported');
  assert.ok(lake.supportStrength >= 0.62);

  const conflicts = lab.evidenceConflictRows(verdicts, slotEvidence);
  assert.ok(conflicts.some((row) => row.kind === 'negation-vs-evidence' && row.obligationId === 'entity:cat'));
  const ambiguity = conflicts.find((row) => row.kind === 'slot-ambiguity');
  assert.ok(ambiguity);
  assert.equal(ambiguity.slotId, 'slot.actor.dog');
  assert.deepEqual(ambiguity.candidateIds, ['dog', 'surface.dog']);
  assert.ok(ambiguity.scoreMargin <= 0.05);

  const rerun = lab.obligationVerdictRows({
    compositionLedger,
    acceptedCandidatesBySlot,
    slotEvidence,
    negativeEvidence,
  });
  assert.deepEqual(rerun, verdicts);
});
