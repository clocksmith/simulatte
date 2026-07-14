const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const lab = require('../public/blank/app/simulation/simulation-lab.js');
require('../public/blank/pipeline/phase-07-render/simulatte-webgpu-renderer.js');
const constructionSearch = require('../public/blank/app/prompt/prompt-controller-construction-search.js');
const root = path.resolve(__dirname, '..');
const goldSetPath = path.join(root, 'tools/samer/simulatte-public-gold-v1.json');
const contractPath = path.join(root, 'tools/samer/simulatte-construction-contract.json');

function phase6ForApproach(spec, approachId, seed = 17) {
  const phase5 = structuredClone(spec.phaseArtifacts.phase5);
  phase5.artifact.simulationCompile.renderIR.constructionApproach = {
    schema: 'simulatte.constructionApproach.v1',
    id: approachId,
    seed,
  };
  return lab.runPhase6VisualCompile(phase5);
}

function packetForPhase6(phase6) {
  return phase6.artifact.visualCompile.sceneRenderPacket;
}

test('public gold set binds simple prompts to counts relations poses and visual rules', () => {
  const goldSet = JSON.parse(fs.readFileSync(goldSetPath, 'utf8'));
  assert.equal(goldSet.schema, 'simulatte.promptGoldSet.v1');
  assert.deepEqual(goldSet.rows.map((row) => row.prompt), [
    '5 cats in a galaxy',
    'airplane flying over trees',
    '3 dogs playing with 7 people',
    'purple violin on a wooden stool',
    'yellow excavator beside a glass greenhouse',
    'an octopus holding a teapot',
  ]);
  assert.ok(goldSet.rows.every((row) => row.entities.length && row.blockingVisualRules.length));
  assert.ok(goldSet.rows.some((row) => row.relations.length));
  assert.ok(goldSet.rows.some((row) => row.poses.length));
});

test('every public gold row reaches Phase 6 with its exact entities relations poses and properties', () => {
  const goldSet = JSON.parse(fs.readFileSync(goldSetPath, 'utf8'));
  const relationAliases = { above: ['above', 'over'], inside: ['inside', 'in'], with: ['with'] };
  const poseKinds = {
    static: 'static-pose',
    flight: 'flight-path',
    'play-interaction': 'play-loop',
    'grasp-hold': 'hold-pose',
  };

  for (const row of goldSet.rows) {
    const spec = lab.createSpecFromPrompt(row.prompt, { allowPrototypeFallback: true });
    const phase6 = spec.phaseArtifacts.phase6.artifact;
    const packet = phase6.visualCompile.sceneRenderPacket;
    const obligations = phase6.compositionLedger.obligations || [];
    for (const expected of row.entities || []) {
      const matches = packet.entities.filter((entity) => entity.identity.type === expected.type);
      if (expected.count != null) {
        assert.equal(matches.length, expected.count, `${row.prompt}: ${expected.type} count`);
      }
      if (expected.minimumCount != null) {
        assert.ok(matches.length >= expected.minimumCount, `${row.prompt}: ${expected.type} minimum count`);
      }
      assert.ok(matches.every((entity) => (
        entity.geometry.program.grammarId !== 'object-grammar.object' &&
        entity.geometry.program.unsupportedIdentity !== true
      )), `${row.prompt}: ${expected.type} needs specific supported geometry`);
    }
    for (const expected of row.relations || []) {
      const aliases = relationAliases[expected.kind] || [expected.kind];
      assert.ok(obligations.some((obligation) => {
        const id = String(obligation.id || '').toLowerCase();
        return obligation.status === 'preserved' &&
          id.includes(`entity-${expected.subjectType}`) && id.includes(`entity-${expected.objectType}`) &&
          aliases.some((kind) => id.includes(`:${kind}:`) || id.includes(`-${kind}-`));
      }), `${row.prompt}: ${expected.subjectType} ${expected.kind} ${expected.objectType}`);
    }
    for (const expected of row.poses || []) {
      const matches = packet.entities.filter((entity) => entity.identity.type === expected.type);
      assert.ok(matches.length > 0 && matches.every((entity) => (
        entity.animation.kind === poseKinds[expected.pose]
      )), `${row.prompt}: ${expected.type} ${expected.pose}`);
    }
    for (const expected of row.properties || []) {
      const bindings = packet.entities
        .filter((entity) => entity.identity.type === expected.type)
        .flatMap((entity) => entity.geometry.program.promptPropertyBindings || []);
      assert.ok(bindings.some((binding) => (
        binding.propertyKind === expected.kind && binding.value === expected.value &&
        binding.status === 'bound' && binding.matchedPartIds.length > 0
      )), `${row.prompt}: ${expected.type} ${expected.kind}=${expected.value}`);
    }
  }
});

test('construction approaches use the same candidates and emit strategy receipts', () => {
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  const spec = lab.createSpecFromPrompt('5 cats in a galaxy', { allowPrototypeFallback: true });
  const byLane = Object.fromEntries(contract.lanes.map((lane) => {
    const packet = packetForPhase6(phase6ForApproach(spec, lane.approachId, lane.seed));
    const cat = packet.entities.find((row) => row.identity.type === 'cat');
    return [lane.id, cat.geometry.program];
  }));
  const candidateIds = (program) => program.constructionSelectionReceipt.candidates
    .map((row) => row.grammarId).sort();

  assert.deepEqual(candidateIds(byLane.anchor), candidateIds(byLane.targeted));
  assert.deepEqual(candidateIds(byLane.targeted), candidateIds(byLane.construction_control));
  assert.equal(byLane.anchor.grammarId, 'object-grammar.animal');
  assert.equal(byLane.targeted.grammarId, 'object-grammar.cat');
  assert.equal(byLane.anchor.constructionSelectionReceipt.strategy, 'category-catalog');
  assert.equal(byLane.targeted.constructionSelectionReceipt.strategy, 'prompt-obligation-coverage');
  assert.equal(byLane.construction_control.constructionSelectionReceipt.strategy, 'deterministic-control');
});

test('failed screenshot obligations reject a grammar and deterministically compile the next candidate', () => {
  const spec = lab.createSpecFromPrompt('5 cats in a galaxy', { allowPrototypeFallback: true });
  const packet = packetForPhase6(spec.phaseArtifacts.phase6);
  const firstCat = packet.entities.find((row) => row.identity.type === 'cat');
  const firstGrammar = firstCat.geometry.program.grammarId;
  const ledger = structuredClone(spec.phaseArtifacts.phase6.artifact.compositionLedger);
  const entityObligation = ledger.obligations.find((row) => row.id === 'entity:cat');
  entityObligation.status = 'lost';
  const phase8Output = {
    artifact: {
      sceneProof: {
        verdict: 'fail',
        evidence: { pixelAuditStatus: 'fail' },
        settledObligations: [{ obligationId: 'entity:cat', status: 'lost', required: true }],
      },
      compositionLedger: ledger,
    },
  };
  const searchState = constructionSearch.createConstructionSearchState();
  const decision = constructionSearch.observeConstructionSceneProof({
    final: true,
    packetKey: 'cat:first',
    phase8Output,
    sceneRenderPacket: packet,
  }, spec, searchState);

  assert.equal(decision.action, 'retry');
  assert.deepEqual(decision.nextApproach.rejectedGrammarIds, [firstGrammar]);
  const next = lab.normalizeSpec(constructionSearch.constructionSearchSpec(spec, decision.nextApproach));
  const nextCat = packetForPhase6(next.phaseArtifacts.phase6).entities.find((row) => row.identity.type === 'cat');
  const receipt = nextCat.geometry.program.constructionSelectionReceipt;
  assert.notEqual(nextCat.geometry.program.grammarId, firstGrammar);
  assert.equal(receipt.schema, 'simulatte.constructionSelectionReceipt.v3');
  assert.equal(receipt.attempt, 1);
  assert.equal(receipt.candidates.find((row) => row.grammarId === firstGrammar).status, 'rejected');
  assert.equal(constructionSearch.observeConstructionSceneProof({
    final: true,
    packetKey: 'cat:first',
    phase8Output,
    sceneRenderPacket: packet,
  }, spec, searchState).action, 'duplicate');
});

test('renderer scene proof reports only become final after required pixel evidence settles', () => {
  const reports = [];
  const renderer = {
    phase7Output: { schema: 'simulatte.phase7.output.v2' },
    phase8Output: { schema: 'simulatte.phase8.output.v2' },
    sceneRenderPacket: { schema: 'simulatte.sceneRenderPacket.v1' },
    renderData: { packetKey: 'proof:one', requireLivePixelSamples: true },
    lastPixelReadbackReceipt: null,
    canvas: { dataset: {} },
    onSceneProof: (report) => reports.push(report),
  };
  const notify = globalThis.__SimulatteWebGpuRendererRefactorScope.notifyRendererSceneProof;
  assert.equal(notify(renderer).final, false);
  renderer.renderData.livePixelSamples = {
    schema: 'simulatte.phase7PixelSampleSet.v1',
    source: 'test-pixel-samples',
    packetKey: 'proof:one',
    samples: [],
  };
  assert.equal(notify(renderer).final, true);
  assert.deepEqual(reports.map((row) => row.final), [false, true]);
});

test('playing with creates a shared pose and relation while flight stays on the airplane', () => {
  const play = lab.createSpecFromPrompt('3 dogs playing with 7 people', { allowPrototypeFallback: true });
  const playPacket = play.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket;
  const playLedger = play.phaseArtifacts.phase6.artifact.compositionLedger;
  const dogs = playPacket.entities.filter((row) => row.identity.type === 'dog');
  const people = playPacket.entities.filter((row) => row.identity.type === 'person');

  assert.equal(dogs.length, 3);
  assert.equal(people.length, 7);
  assert.ok([...dogs, ...people].every((row) => row.animation.kind === 'play-loop'));
  assert.ok([...dogs, ...people].every((row) => row.animation.speed > 0 && row.animation.amplitude > 0));
  assert.equal(new Set(dogs.map((row) => row.animation.phase)).size, dogs.length);
  assert.equal(new Set(people.map((row) => row.animation.phase)).size, people.length);
  assert.ok([...dogs, ...people].every((row) => row.geometry.program.pose === 'play-interaction'));
  assert.ok(playLedger.obligations.some((row) => (
    row.id === 'relation:spatial:entity-dog:with:entity-person' && row.status === 'preserved'
  )));

  const flight = lab.createSpecFromPrompt('airplane flying over trees', { allowPrototypeFallback: true });
  const flightPacket = flight.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket;
  const airplaneAnimation = flightPacket.entities.find((row) => row.identity.type === 'airplane').animation;
  assert.equal(airplaneAnimation.kind, 'flight-path');
  assert.ok(airplaneAnimation.speed >= 0.8);
  assert.ok(airplaneAnimation.amplitude >= 0.1);
  assert.equal(flightPacket.entities.find((row) => row.identity.type === 'tree').animation.kind, 'static-pose');
  assert.equal(flightPacket.entities.find((row) => row.identity.type === 'tree').animation.speed, 0);

  const hold = lab.createSpecFromPrompt('an octopus holding a teapot', { allowPrototypeFallback: true });
  const holdPacket = hold.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket;
  const octopus = holdPacket.entities.find((row) => row.identity.type === 'octopus');
  const teapot = holdPacket.entities.find((row) => row.identity.type === 'teapot');
  assert.equal(octopus.animation.kind, 'hold-pose');
  assert.ok(octopus.animation.speed > 0 && octopus.animation.amplitude > 0);
  assert.ok(teapot.transform.scale[0] <= octopus.transform.scale[0] * 0.6);
  assert.ok(teapot.transform.scale[1] <= octopus.transform.scale[1] * 0.6);
  const renderedHoldParts = globalThis.__SimulatteWebGpuRendererRefactorScope.scenePacketObjectParts(holdPacket);
  const octopusParts = renderedHoldParts.filter((row) => row.entityId === octopus.id);
  const coreDepth = octopusParts.find((row) => row.constructionRole === 'core').depth;
  const grasp = holdPacket.receipts.framing.graspContacts[0];
  const graspDepth = renderedHoldParts.find((row) => (
    row.entityId === teapot.id && row.constructionPartId === grasp.targetPartId
  )).depth;
  assert.ok(octopusParts.filter((row) => grasp.sourcePartIds.includes(row.constructionPartId))
    .every((row) => row.depth < graspDepth));
  assert.ok(octopusParts.filter((row) => (
    row.constructionRole === 'appendage' && !grasp.sourcePartIds.includes(row.constructionPartId)
  ))
    .every((row) => row.depth > coreDepth));
  assert.ok(octopusParts.filter((row) => row.constructionRole === 'sensor')
    .every((row) => row.depth < coreDepth));
});

test('Phase 7 accepts standing-leg and seated-thigh person topologies', () => {
  const standing = lab.createSpecFromPrompt('3 dogs playing with 7 people', { allowPrototypeFallback: true });
  const seated = lab.createSpecFromPrompt('a person sitting at a table', { allowPrototypeFallback: true });
  const rendererScope = globalThis.__SimulatteWebGpuRendererRefactorScope;
  const standingData = rendererScope.compileSceneRenderData(
    standing.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket
  );
  const seatedData = rendererScope.compileSceneRenderData(
    seated.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket
  );
  const standingPeople = standingData.objectRealization.rows.filter((row) => row.identityType === 'person');
  const seatedPeople = seatedData.objectRealization.rows.filter((row) => row.identityType === 'person');

  assert.equal(standingPeople.length, 7);
  assert.ok(standingPeople.every((row) => row.topologyVerified && row.realized));
  assert.ok(seatedPeople.length >= 1);
  assert.ok(seatedPeople.every((row) => row.topologyVerified && row.realized));
});

test('gold visual evaluation fails closed without hash-bound human adjudication', async () => {
  const evaluator = await import(pathToFileURL(path.join(root, 'tools/samer/gold-visual-evaluator.mjs')));
  const goldSet = evaluator.loadGoldSet(goldSetPath);
  const promptHash = (value) => crypto.createHash('sha256').update(value).digest('hex');
  const packetHash = (row) => promptHash(`packet:${row.id}`);
  const results = goldSet.rows.map((row, index) => ({
    index: index + 1,
    goldRowId: row.id,
    prompt: row.prompt,
    compiledPrompt: row.prompt,
    promptSha256: promptHash(row.prompt),
    buildId: 'test-build-identity',
    sceneRenderPacketSha256: packetHash(row),
    screenshotHash: String(index + 1).padStart(64, '0'),
    canvasScreenshot: `${row.id}.canvas.png`,
    canvasScreenshotHash: promptHash(`canvas:${row.id}`),
    sceneRenderPacketIdentities: row.entities.flatMap((entity) => (
      Array.from({ length: entity.count || entity.minimumCount || 1 }, () => ({
        type: entity.type,
        grammarId: `object-grammar.${entity.type}`,
        literal: true,
        unsupportedIdentity: false,
        propertyBindings: row.properties && row.properties.filter((property) => property.type === entity.type)
          .map((property) => ({
            propertyKind: property.kind,
            value: property.value,
            status: 'bound',
            matchedPartIds: ['body'],
          })) || [],
        animationKind: row.poses.find((pose) => pose.type === entity.type)?.pose === 'flight'
          ? 'flight-path'
          : row.poses.find((pose) => pose.type === entity.type)?.pose === 'play-interaction'
            ? 'play-loop'
            : row.poses.find((pose) => pose.type === entity.type)?.pose === 'grasp-hold'
              ? 'hold-pose' : 'static-pose',
      }))
    )),
    phase6CompositionObligations: row.relations.map((relation) => ({
      id: `relation:spatial:entity-${relation.subjectType}:${relation.kind}:entity-${relation.objectType}`,
      status: 'preserved',
    })),
    phase7VisualObligationProof: JSON.stringify(row.relations.map((relation) => ({
      obligationId: `relation:spatial:entity-${relation.subjectType}:${relation.kind}:entity-${relation.objectType}`,
      status: 'pass',
      geometrySatisfied: true,
      pixelSatisfied: true,
    }))),
    phase7PixelProofStatus: 'pass',
    sceneProofVerdict: 'pass',
  }));
  const withoutHuman = evaluator.evaluateGoldVisualResults(results, goldSet, null);
  assert.equal(withoutHuman.machinePassCount, 6);
  assert.equal(withoutHuman.humanPassCount, 0);
  assert.equal(withoutHuman.pass, false);

  const adjudication = {
    schema: 'simulatte.goldVisualAdjudication.v3',
    goldSetId: goldSet.id,
    rows: goldSet.rows.map((row, index) => ({
      goldRowId: row.id,
      prompt: row.prompt,
      promptSha256: promptHash(row.prompt),
      buildId: 'test-build-identity',
      sceneRenderPacketSha256: packetHash(row),
      screenshotKind: 'canvas-crop',
      screenshotSha256: promptHash(`canvas:${row.id}`),
      reviewer: 'test-reviewer',
      reviewedAt: '2026-07-12T00:00:00.000Z',
      note: 'Passes the blocking visual rules; quality observations remain recorded.',
      verdict: 'pass',
      rules: row.blockingVisualRules.map((id) => ({ id, pass: true })),
    })),
  };
  const withHuman = evaluator.evaluateGoldVisualResults(results, goldSet, adjudication);
  assert.equal(withHuman.machinePassCount, 6);
  assert.equal(withHuman.humanPassCount, 6);
  assert.equal(withHuman.pass, true);

  const changed = (edit) => {
    const copy = structuredClone(adjudication);
    edit(copy);
    return copy;
  };
  for (const [field, value] of [
    ['prompt', 'different prompt'],
    ['promptSha256', 'f'.repeat(64)],
    ['buildId', 'different-build'],
    ['sceneRenderPacketSha256', 'e'.repeat(64)],
    ['screenshotSha256', 'd'.repeat(64)],
    ['screenshotKind', 'full-page'],
    ['note', ''],
  ]) {
    const mismatch = changed((copy) => { copy.rows[0][field] = value; });
    const evaluation = evaluator.evaluateGoldVisualResults(results, goldSet, mismatch);
    assert.equal(evaluation.rows[0].human.pass, false, `${field} mismatch must fail human proof`);
  }
  for (const field of [
    'prompt',
    'compiledPrompt',
    'promptSha256',
    'buildId',
    'sceneRenderPacketSha256',
    'canvasScreenshotHash',
  ]) {
    const mismatchResults = structuredClone(results);
    mismatchResults[0][field] = '';
    const evaluation = evaluator.evaluateGoldVisualResults(mismatchResults, goldSet, adjudication);
    assert.equal(evaluation.rows[0].machine.pass, false, `${field} mismatch must fail machine proof`);
  }
  const missingRelationPixels = structuredClone(results);
  missingRelationPixels[0].phase7VisualObligationProof = '[]';
  assert.equal(
    evaluator.evaluateGoldVisualResults(missingRelationPixels, goldSet, adjudication).rows[0].machine.pass,
    false,
    'Phase 6 relation metadata cannot substitute for final projected pixel proof'
  );

  assert.throws(() => evaluator.evaluateGoldVisualResults(results, goldSet, changed((copy) => {
    copy.rows.push(structuredClone(copy.rows[0]));
  })), /duplicate row/);
  assert.throws(() => evaluator.evaluateGoldVisualResults(results, goldSet, changed((copy) => {
    copy.rows[0].goldRowId = 'gold.unknown';
  })), /unknown row/);
  assert.throws(() => evaluator.evaluateGoldVisualResults(results, goldSet, changed((copy) => {
    copy.rows.pop();
  })), /missing row/);
  assert.throws(() => evaluator.evaluateGoldVisualResults(results, goldSet, changed((copy) => {
    copy.rows[0].rules.push(structuredClone(copy.rows[0].rules[0]));
  })), /duplicate rule/);
  assert.throws(() => evaluator.evaluateGoldVisualResults(results, goldSet, changed((copy) => {
    copy.rows[0].rules.push({ id: 'rule.unknown', pass: true });
  })), /unknown rule/);
  assert.throws(() => evaluator.evaluateGoldVisualResults(results, goldSet, changed((copy) => {
    copy.schema = 'simulatte.goldVisualAdjudication.v2';
  })), /goldVisualAdjudication[.]v3/);
});
