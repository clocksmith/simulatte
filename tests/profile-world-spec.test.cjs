const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const profileWorldSpec = require('../public/shared/contracts/profile-world-spec.js');
const profileWorldProof = require('../public/shared/contracts/profile-world-proof.js');
const worldSpec = require('../public/shared/contracts/world-spec.js');

const ROOT = path.resolve(__dirname, '..');
const PROFILE_IDS = [
  'asteroid-defense-v1',
  'cable-trader-pickup-v1',
  'food-recall-us-v1',
  'grid-resilience-us-v1',
  'interstellar-relay-network-v1',
  'maritime-trade-global-v1',
  'neighborhood-bulk-pool-v1',
  'nyc-development-atlas-v1',
  'orbital-transfer-planner-v1',
  'subsea-network-global-v1',
  'sun-walker-v1',
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function profileFixture(profileId) {
  const profile = readJson(`public/data/application-profiles/${profileId}.json`);
  const pluginManifests = profile.plugins.map((selection) => (
    readJson(`public/shared/plugins/${selection.id}/plugin.json`)
  ));
  return { profile, pluginManifests };
}

test('every connected profile seed compiles deterministically into the public WorldSpec contract', () => {
  let seedCount = 0;
  for (const profileId of PROFILE_IDS) {
    const { profile, pluginManifests } = profileFixture(profileId);
    for (const scenario of profile.seeds) {
      seedCount += 1;
      const first = profileWorldSpec.compileProfileWorldSpec({ profile, scenario, pluginManifests });
      const second = profileWorldSpec.compileProfileWorldSpec({ profile, scenario, pluginManifests });
      assert.equal(worldSpec.validateWorldSpec(first), first);
      assert.equal(first.contentHash, second.contentHash);
      assert.equal(first.schema, 'simulatte.worldSpec.v1');
      assert.equal(first.templateId, profileWorldSpec.TEMPLATE_ID);
      assert.equal(first.params.profileId, profile.id);
      assert.equal(first.params.scenarioId, scenario.id);
      assert.equal(first.params.scenarioSeed, scenario.seed);
      assert.deepEqual(first.dependencies.plugins.map((row) => row.id), profile.plugins.map((row) => row.id));
      assert.deepEqual(first.authorship.sources.map((row) => row.authority).filter((row) => row === 'plugin'), profile.plugins.map(() => 'plugin'));
      assert.equal(first.phaseArtifacts.phase2.schema, 'simulatte.phase2.output.v1');
      assert.equal(first.phaseArtifacts.phase2.artifact.languageGraph.sourceText, first.source.prompt);
      assert.equal(first.phaseArtifacts.phase2.artifact.intentRequirements.uncoveredSemanticSpanIds.length, 0);
      assert.ok(first.phaseArtifacts.phase2.artifact.intentRequirements.criticalRequirementCount >= 4);
      assert.equal(first.phaseArtifacts.phase4.schema, 'simulatte.phase4.output.v2');
      assert.equal(first.phaseArtifacts.phase4.artifact.intentSettlement.status, 'pass');
      assert.equal(first.phaseArtifacts.phase4.artifact.semanticProvenance.status, 'pass');
      assert.equal(first.phaseArtifacts.phase4.artifact.semanticProvenance.missingCount, 0);
      assert.equal(first.phaseArtifacts.phase5.schema, 'simulatte.phase5.output.v2');
      assert.equal(first.phaseArtifacts.phase6.schema, 'simulatte.phase6.output.v2');
      assert.equal(first.source.compilerConfig.compilerLane, profileWorldSpec.COMPILER_LANE);
      assert.equal(Object.hasOwn(first.source.compilerConfig, 'lane'), false);
      assert.deepEqual(first.determinism.requiredClasses, [
        'compiler-deterministic',
        'replay-identified',
      ]);
      assert.equal(
        profileWorldSpec.createConformanceReceipt(first, { profile, scenario, pluginManifests }).worldSpecContentHash,
        first.contentHash
      );
    }
  }
  assert.equal(seedCount, 47);
});

test('a governed scenario selection recompiles every scenario-bound profile artifact', () => {
  const { profile, pluginManifests } = profileFixture('cable-trader-pickup-v1');
  const initial = profileWorldSpec.compileProfileWorldSpec({
    profile,
    scenario: profile.seeds[0],
    pluginManifests,
  });
  const target = profile.seeds[1];
  const selected = profileWorldSpec.compileProfileScenarioSelection({
    profile,
    scenarioId: target.id,
    pluginManifests,
  });
  const expected = profileWorldSpec.compileProfileWorldSpec({
    profile,
    scenario: target,
    pluginManifests,
  });
  const resolution = profileWorldSpec.resolveProfileExecution(selected, {
    profile,
    pluginManifests,
  });
  assert.equal(resolution.scenario.id, target.id);
  assert.equal(resolution.scenario.seed, target.seed);
  assert.notEqual(selected.contentHash, initial.contentHash);
  assert.equal(selected.contentHash, expected.contentHash);
  assert.match(selected.source.prompt, new RegExp(`Profile ${profile.id}`));
  assert.match(selected.source.prompt, new RegExp(`Scenario ${target.id}`));
  assert.ok(selected.source.prompt.endsWith(`Mission ${target.missionText}`));
  assert.equal(selected.source.compilerConfig.scenarioId, target.id);
  assert.equal(selected.contract.scenarioContentHash, profileWorldSpec.valueHash(target));
  assert.equal(selected.universeGraph.prompt, selected.source.prompt);
  assert.equal(selected.universeGraph.nodes.find((row) => row.kind === 'scenario').label, target.id);
  assert.equal(selected.phaseArtifacts.phase2.artifact.languageGraph.sourceText, selected.source.prompt);
  assert.equal(selected.phaseArtifacts.phase4.artifact.intentSettlement.status, 'pass');
  assert.equal(selected.phaseArtifacts.phase4.artifact.semanticProvenance.status, 'pass');
  assert.equal(selected.phaseArtifacts.phase5.artifact.scenarioId, target.id);
  assert.equal(selected.phaseArtifacts.phase6.artifact.scenarioId, target.id);
  assert.equal(selected.authorship.revision, 0);
  assert.deepEqual(selected.authorship.patches, []);
});

test('profile resolution rejects stale scenario-derived compiler output', () => {
  const { profile, pluginManifests } = profileFixture('cable-trader-pickup-v1');
  const initial = profileWorldSpec.compileProfileWorldSpec({
    profile,
    scenario: profile.seeds[0],
    pluginManifests,
  });
  const target = profile.seeds[1];
  const stale = worldSpec.finalizeWorldSpec({
    ...initial,
    name: target.label,
    description: target.description,
    params: {
      ...initial.params,
      scenarioId: target.id,
      scenarioSeed: target.seed,
    },
    objects: initial.objects.map((row) => row.kind === 'scenario'
      ? { ...row, scenarioId: target.id, seed: target.seed }
      : row),
  });

  assert.throws(
    () => profileWorldSpec.resolveProfileExecution(stale, { profile, pluginManifests }),
    (error) => error.code === 'profile_world_spec_scenario_binding_mismatch' &&
      error.evidence.differingRoots.includes('source') &&
      error.evidence.differingRoots.includes('contract') &&
      error.evidence.differingRoots.includes('phaseArtifacts')
  );
});

test('profile execution fails closed for undeclared scenarios and edited plugin identity', () => {
  const { profile, pluginManifests } = profileFixture('orbital-transfer-planner-v1');
  const compiled = profileWorldSpec.compileProfileWorldSpec({
    profile,
    scenario: profile.seeds[0],
    pluginManifests,
  });
  const forgedScenario = worldSpec.finalizeWorldSpec({
    ...compiled,
    params: { ...compiled.params, scenarioId: 'undeclared-scenario', scenarioSeed: 'undeclared-seed' },
  });
  assert.throws(
    () => profileWorldSpec.resolveProfileExecution(forgedScenario, { profile, pluginManifests }),
    (error) => error.code === 'profile_world_spec_scenario_undeclared'
  );
  const forgedPlugin = worldSpec.finalizeWorldSpec({
    ...compiled,
    dependencies: {
      ...compiled.dependencies,
      plugins: compiled.dependencies.plugins.map((row) => ({ ...row, version: 'forged' })),
    },
  });
  assert.throws(
    () => profileWorldSpec.resolveProfileExecution(forgedPlugin, { profile, pluginManifests }),
    (error) => error.code === 'profile_world_spec_plugin_identity_mismatch'
  );
});

function profileProofFixture() {
  const { profile, pluginManifests } = profileFixture('asteroid-defense-v1');
  const scenario = profile.seeds[0];
  const spec = profileWorldSpec.compileProfileWorldSpec({ profile, scenario, pluginManifests });
  const recompiledSpec = profileWorldSpec.compileProfileWorldSpec({ profile, scenario, pluginManifests });
  const run = {
    id: 'profile-proof-run',
    profileId: profile.id,
    seedId: scenario.id,
    seed: scenario.seed,
  };
  const runtime = {
    runReceipt: {
      profileId: profile.id,
      scenario: { id: scenario.id, seed: scenario.seed },
      status: 'settled',
      contentSha256: 'a'.repeat(64),
    },
  };
  const evidence = {
    settlements: [{ id: 'settlement:mission', status: 'settled' }],
    replay: {
      attempted: true,
      beforeSha256: 'b'.repeat(64),
      afterSha256: 'b'.repeat(64),
      deterministic: true,
    },
    screenshot: { sha256: 'c'.repeat(64) },
    pixelReadback: { status: 'pass', sha256: 'c'.repeat(64) },
    visual: {
      schema: 'simulatte.renderedEvidence.v1',
      canvas: { width: 640, height: 360 },
    },
  };
  const options = {
    spec,
    run,
    runtime,
    evidence,
    sourceIdentity: { build: { buildId: 'profile-proof-build' } },
    browser: { product: 'Chrome/1', gpu: { available: false, rendererBackend: 'canvas2d' } },
    claims: [{ id: 'claim:mission', sentence: scenario.description }],
    nowIso: '2026-08-15T00:00:00.000Z',
    recompiledSpec,
    independentCompilerExecution: true,
  };
  return options;
}

test('profile WorldProof proves machine execution and replay without claiming human recognition', () => {
  const options = profileProofFixture();
  const proof = profileWorldProof.createProfileWorldProof(options);
  assert.equal(profileWorldProof.validateProfileWorldProof(proof, options), proof);
  assert.equal(proof.verdict, 'not-proven');
  assert.equal(proof.proofClasses.compilation.status, 'pass');
  assert.equal(proof.proofClasses.simulation.status, 'pass');
  assert.equal(proof.proofClasses.replay.status, 'pass');
  assert.equal(proof.evidence.compilerDeterminismReceipt.status, 'pass');
  assert.deepEqual(proof.evidence.replayReceipt.classStatuses, {
    'compiler-deterministic': 'pass',
    'replay-identified': 'pass',
  });
  assert.equal(proof.proofClasses.intent.status, 'pass');
  assert.equal(proof.proofClasses.semantic.status, 'pass');
  assert.equal(proof.evidence.intentReceipt.status, 'pass');
  assert.equal(proof.evidence.semanticReceipt.status, 'pass');
  assert.equal(proof.evidence.intentReceipt.lostCount, 0);
  assert.equal(proof.evidence.semanticReceipt.missingCount, 0);
  assert.equal(proof.proofClasses.visual.status, 'not-proven');
  assert.equal(proof.proofClasses.interaction.status, 'not-applicable');
});

test('profile WorldProof fails a divergent replay and rejects determinism overclaims', () => {
  const divergent = profileProofFixture();
  divergent.evidence.replay.afterSha256 = 'd'.repeat(64);
  divergent.evidence.replay.deterministic = false;
  const proof = profileWorldProof.createProfileWorldProof(divergent);
  assert.equal(proof.verdict, 'fail');
  assert.equal(proof.proofClasses.replay.status, 'fail');

  const overclaimed = profileProofFixture();
  overclaimed.spec = worldSpec.finalizeWorldSpec({
    ...overclaimed.spec,
    determinism: {
      ...overclaimed.spec.determinism,
      requiredClasses: ['compiler-deterministic', 'decision-deterministic', 'replay-identified'],
    },
  });
  assert.throws(
    () => profileWorldProof.createProfileWorldProof(overclaimed),
    (error) => error.code === 'profile_world_proof_determinism_overclaimed'
  );
});

test('profile WorldProof fails closed without an independent matching compiler execution', () => {
  const missing = profileProofFixture();
  missing.recompiledSpec = null;
  missing.independentCompilerExecution = false;
  let proof = profileWorldProof.createProfileWorldProof(missing);
  assert.equal(proof.verdict, 'fail');
  assert.equal(proof.evidence.compilerDeterminismReceipt.failureCode, 'independent-execution-missing');
  assert.equal(proof.evidence.replayReceipt.classStatuses['compiler-deterministic'], 'fail');

  const divergent = profileProofFixture();
  const { profile, pluginManifests } = profileFixture('asteroid-defense-v1');
  divergent.recompiledSpec = profileWorldSpec.compileProfileWorldSpec({
    profile,
    scenario: profile.seeds[1],
    pluginManifests,
  });
  proof = profileWorldProof.createProfileWorldProof(divergent);
  assert.equal(proof.verdict, 'fail');
  assert.equal(proof.evidence.compilerDeterminismReceipt.outputMatches, false);
  assert.equal(proof.evidence.compilerDeterminismReceipt.status, 'fail');
});

test('profile WorldProof rejects proof content rebound to different execution evidence', () => {
  const options = profileProofFixture();
  const proof = structuredClone(profileWorldProof.createProfileWorldProof(options));
  options.evidence.replay.afterSha256 = 'e'.repeat(64);
  options.evidence.replay.deterministic = false;
  assert.throws(
    () => profileWorldProof.validateProfileWorldProof(proof, options),
    (error) => error.code === 'profile_world_proof_evidence_mismatch'
  );
});

test('profile WorldProof fails stale language source and tampered semantic provenance', () => {
  const staleLanguage = profileProofFixture();
  staleLanguage.spec = worldSpec.finalizeWorldSpec({
    ...staleLanguage.spec,
    source: {
      ...staleLanguage.spec.source,
      prompt: `${staleLanguage.spec.source.prompt} altered`,
    },
  });
  let proof = profileWorldProof.createProfileWorldProof(staleLanguage);
  assert.equal(proof.proofClasses.intent.status, 'fail');
  assert.equal(proof.evidence.intentReceipt.failureCode, 'intent-contract-invalid');

  const tamperedSemantic = profileProofFixture();
  const phase4 = structuredClone(tamperedSemantic.spec.phaseArtifacts.phase4);
  phase4.artifact.semanticProvenance.bindings[0].evidenceIds = [];
  tamperedSemantic.spec = worldSpec.finalizeWorldSpec({
    ...tamperedSemantic.spec,
    phaseArtifacts: {
      ...tamperedSemantic.spec.phaseArtifacts,
      phase4,
    },
  });
  proof = profileWorldProof.createProfileWorldProof(tamperedSemantic);
  assert.equal(proof.proofClasses.semantic.status, 'fail');
  assert.equal(proof.evidence.semanticReceipt.failureCode, 'semantic-contract-invalid');
});
