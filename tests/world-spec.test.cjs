const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const lab = require('../public/blank/app/simulation/simulation-lab.js');
const worldSpec = require('../public/shared/contracts/world-spec.js');
const runtimeManifest = require('../public/blank/app/runtime-script-manifest.js');

const root = path.resolve(__dirname, '..');

function compileFixture() {
  return lab.createSpecFromPrompt('a red ball rests beside a blue wall', {
    allowPrototypeFallback: true,
    deterministicRuntime: true,
    retrievalPhase: 'deterministic-local',
  });
}

function elapsedTimeSafety(maximum = 1, severity = 'block') {
  return {
    schema: 'simulatte.worldSpecSafetyRule.v1',
    id: 'safety:elapsed-time-bound',
    description: 'Keep the proof trajectory within its declared elapsed-time bound',
    statePath: '/t',
    operator: 'between',
    minimum: 0,
    maximum,
    expected: null,
    tolerance: 1e-12,
    severity,
  };
}

test('compiled Create worlds are canonical public WorldSpec artifacts', () => {
  const spec = compileFixture();

  assert.equal(spec.schema, worldSpec.WORLD_SPEC_SCHEMA);
  assert.equal(spec.schemaVersion, worldSpec.WORLD_SPEC_VERSION);
  assert.equal(spec.source.prompt, 'a red ball rests beside a blue wall');
  assert.equal(spec.source.compilerConfig.deterministicRuntime, true);
  assert.equal(spec.source.compilerConfig.schema, 'simulatte.worldSpecCompilerConfig.v1');
  assert.deepEqual(spec.source.compilerConfig.params, {});
  assert.equal(spec.authorship.revision, 0);
  assert.equal(spec.authorship.sources[0].authority, 'prompt');
  assert.deepEqual(spec.determinism.requiredClasses, ['replay-identified']);
  assert.match(spec.contentHash, /^fnv1a32:[0-9a-f]{8}$/);
  assert.equal(worldSpec.validateWorldSpec(spec), spec);
});

test('deterministic compiler lanes declare compiler determinism as a required class', () => {
  const spec = lab.createSpecFromPrompt('a red ball', {
    deterministicRuntime: true,
    compilerLane: 'pipeline-worker',
    retrievalPhase: 'deterministic-local',
  });

  assert.equal(spec.source.compilerConfig.compilerLane, 'pipeline-worker');
  assert.deepEqual(
    spec.determinism.requiredClasses,
    ['compiler-deterministic', 'simulation-reproducible', 'replay-identified']
  );
  assert.equal(spec.determinism.simulationTolerance, 1e-9);
  assert.deepEqual(spec.source.compilerConfig.simulationProof, {
    maxStateNodes: 100000,
    schema: 'simulatte.simulationReproducibilityPolicy.v1',
    stepCount: 8,
    stepSeconds: 1 / 60,
  });
});

test('WorldSpec rejects unknown, duplicate, and unconfigured pixel determinism classes', () => {
  const spec = compileFixture();
  const schema = JSON.parse(fs.readFileSync(
    path.join(root, 'public/shared/contracts/world-spec.schema.json'),
    'utf8'
  ));
  assert.deepEqual(
    schema.$defs.determinism.properties.requiredClasses.items.enum,
    worldSpec.DETERMINISM_CLASSES
  );

  const unknown = JSON.parse(lab.serializeSpec(spec));
  unknown.determinism.requiredClasses = ['replay-identified', 'future-determinism'];
  assert.throws(
    () => worldSpec.validateWorldSpec(unknown, { verifyHash: false }),
    /Unknown determinism class/
  );

  const duplicate = JSON.parse(lab.serializeSpec(spec));
  duplicate.determinism.requiredClasses = ['replay-identified', 'replay-identified'];
  assert.throws(
    () => worldSpec.validateWorldSpec(duplicate, { verifyHash: false }),
    /Duplicate determinism class/
  );

  const missingPixelPolicy = JSON.parse(lab.serializeSpec(spec));
  missingPixelPolicy.determinism.requiredClasses = ['pixel-bounded'];
  assert.throws(
    () => worldSpec.validateWorldSpec(missingPixelPolicy, { verifyHash: false }),
    /requires a pixel policy/
  );
});

test('WorldSpec safety rules are typed, bounded, and internally consistent', () => {
  const spec = compileFixture();
  const candidate = JSON.parse(lab.serializeSpec(spec));
  candidate.safety = {
    schema: 'simulatte.worldSpecSafety.v1',
    rules: [elapsedTimeSafety()],
    status: 'declared',
  };
  candidate.contentHash = worldSpec.contentHash(candidate);
  assert.equal(worldSpec.validateWorldSpec(candidate), candidate);

  const invalidBounds = structuredClone(candidate);
  invalidBounds.safety.rules[0].minimum = null;
  assert.throws(
    () => worldSpec.validateWorldSpec(invalidBounds, { verifyHash: false }),
    /bounds do not match/
  );

  const duplicate = structuredClone(candidate);
  duplicate.safety.rules.push(structuredClone(duplicate.safety.rules[0]));
  assert.throws(
    () => worldSpec.validateWorldSpec(duplicate, { verifyHash: false }),
    /ids must be unique/
  );

  const undeclared = structuredClone(candidate);
  undeclared.safety.status = 'not-declared';
  assert.throws(
    () => worldSpec.validateWorldSpec(undeclared, { verifyHash: false }),
    /Only declared safety/
  );

  const unsafePath = structuredClone(candidate);
  unsafePath.safety.rules[0].statePath = '/__proto__/polluted';
  assert.throws(
    () => worldSpec.validateWorldSpec(unsafePath, { verifyHash: false }),
    /prohibited segment/
  );
});

test('a user safety edit becomes authored executable WorldSpec intent', () => {
  const spec = compileFixture();
  const candidate = JSON.parse(lab.serializeSpec(spec));
  candidate.safety = {
    schema: 'simulatte.worldSpecSafety.v1',
    rules: [elapsedTimeSafety()],
    status: 'declared',
  };
  const edited = lab.applyWorldSpecEdit(spec, candidate, {
    rationale: 'Require the proof trajectory to stay inside one simulated second',
  });

  assert.equal(edited.safety.status, 'declared');
  assert.equal(edited.safety.rules[0].statePath, '/t');
  assert.ok(edited.authorship.patches.some((row) => row.targetPath === '/safety/rules/0'));
  assert.ok(edited.authorship.patches.some((row) => row.targetPath === '/safety/status'));
  assert.notEqual(edited.contentHash, spec.contentHash);
  assert.equal(worldSpec.validateWorldSpec(edited), edited);
});

test('WorldSpec export omits compiler evidence and import reconstructs an executable proof chain', () => {
  const spec = compileFixture();
  const serialized = lab.serializeSpec(spec);
  const exported = JSON.parse(serialized);

  assert.equal(exported.contentHash, spec.contentHash);
  assert.equal(Object.hasOwn(exported, 'intent'), false);
  assert.equal(Object.hasOwn(exported, 'phaseArtifacts'), false);
  assert.equal(exported.physicsIR.schema, 'simulatte.physicalIR.v1');
  assert.equal(exported.renderProgram.visualIR.schema, 'simulatte.visualIR.v1');

  const imported = lab.deserializeSpec(serialized);
  assert.equal(imported.contentHash, spec.contentHash);
  assert.equal(lab.serializeSpec(imported), serialized);
  assert.deepEqual(imported.params, spec.params);
  assert.deepEqual(Object.keys(imported.phaseArtifacts), [
    'phase1', 'phase2', 'phase3', 'phase4', 'phase5', 'phase6',
  ]);
  assert.equal(imported.phaseArtifacts.phase5.receipts[0].importAuthority, 'world-spec');
  assert.equal(
    imported.phaseArtifacts.phase5.receipts[0].worldSpecContentHash,
    imported.contentHash
  );
  const renderInput = lab.createRenderExecutionInput(
    imported,
    lab.createSimulationState(imported),
    { width: 640, height: 360 }
  );
  assert.equal(renderInput.sceneRenderPacket.schema, 'simulatte.sceneRenderPacket.v1');
  assert.equal(renderInput.worldProofBinding.worldSpec.contentHash, imported.contentHash);
  assert.equal(lab.createIntentProofReceiptForSpec(imported).status, 'pass');
  assert.equal(lab.createSemanticProofReceiptForSpec(imported).status, 'pass');
});

test('edited WorldSpec import retains user authority and rejects incompatible execution bindings', () => {
  const spec = compileFixture();
  const candidate = JSON.parse(lab.serializeSpec(spec));
  const node = candidate.universeGraph.nodes.find((row) => row.sourceLabel === 'ball');
  node.properties.find((row) => row.kind === 'color').value = '#00aa44';
  const edited = lab.applyWorldSpecEdit(spec, candidate, { rationale: 'Make the ball green' });
  const imported = lab.deserializeSpec(lab.serializeSpec(edited));

  assert.equal(imported.contentHash, edited.contentHash);
  assert.equal(imported.phaseArtifacts.phase4.receipts
    .find((row) => row.id === 'phase4-grounded-intent').authority, 'userOverride');
  assert.equal(lab.createSemanticProofReceiptForSpec(imported).status, 'pass');
  const importedBall = imported.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket.entities
    .find((row) => row.identity?.sourceLabel === 'ball');
  assert.ok(importedBall.geometry.program.parts.some((row) => row.fill === '#00aa44'));

  const incompatible = JSON.parse(lab.serializeSpec(edited));
  incompatible.renderProgram.sourceGraphId = 'different-composition-graph';
  incompatible.contentHash = worldSpec.contentHash(incompatible);
  assert.throws(
    () => lab.deserializeSpec(JSON.stringify(incompatible)),
    /Imported WorldSpec is incompatible.*renderProgram does not bind compositionGraph/
  );
});

test('WorldSpec import rejects content tampering instead of silently minting a new identity', () => {
  const spec = compileFixture();
  const tampered = JSON.parse(lab.serializeSpec(spec));
  tampered.params.seed = 987;

  assert.throws(
    () => lab.deserializeSpec(JSON.stringify(tampered)),
    /WorldSpec contentHash does not match canonical content/
  );
});

test('WorldSpec rejects forged authorship references and incoherent patch history', () => {
  const spec = compileFixture();
  const expectRejected = (input, mutate, pattern) => {
    const forged = JSON.parse(lab.serializeSpec(input));
    mutate(forged);
    forged.contentHash = worldSpec.contentHash(forged);
    assert.throws(() => lab.deserializeSpec(JSON.stringify(forged)), pattern);
  };

  expectRejected(spec, (forged) => {
    forged.authorship.fieldProvenance.push({
      path: '/params/energyInput',
      authority: 'prompt',
      sourceId: 'source:does-not-exist',
    });
  }, /Field provenance sourceId does not resolve/);

  expectRejected(spec, (forged) => {
    forged.authorship.fieldProvenance.push({
      path: '/params/energyInput',
      authority: 'prompt',
      sourceId: 'source:compiler',
    });
  }, /Field provenance authority does not match/);
  expectRejected(spec, (forged) => {
    forged.authorship.fieldProvenance.push({
      path: '/params/__proto__/polluted',
      authority: 'compilerInference',
      sourceId: 'source:compiler',
    });
  }, /JSON pointer contains a prohibited segment/);

  const candidate = JSON.parse(lab.serializeSpec(spec));
  candidate.params.energyInput = 1.25;
  const edited = lab.applyWorldSpecEdit(spec, candidate, { rationale: 'Create patch history fixture' });
  expectRejected(edited, (forged) => {
    const patchId = forged.authorship.patches[0].id;
    forged.authorship.fieldProvenance = forged.authorship.fieldProvenance
      .filter((row) => row.sourceId !== patchId);
  }, /Patch is missing field provenance/);
  expectRejected(edited, (forged) => {
    forged.authorship.revision += 1;
  }, /Authorship revision does not match patch history/);
});

test('legacy simulation specs migrate to WorldSpec instead of remaining a second public identity', () => {
  const migrated = lab.normalizeSpec({
    schema: worldSpec.LEGACY_SPEC_SCHEMA,
    templateId: 'magnetic-wheel',
    name: 'Imported magnetic wheel',
    modules: ['mechanics'],
    objects: [],
    controls: [],
    params: { seed: 7 },
  });

  assert.equal(migrated.schema, worldSpec.WORLD_SPEC_SCHEMA);
  assert.equal(migrated.source.prompt, '');
  assert.match(migrated.contentHash, /^fnv1a32:/);
});

test('WorldSpec 1.0 exports migrate without inventing compiler baselines or reconciliations', () => {
  const spec = compileFixture();
  const candidate = JSON.parse(lab.serializeSpec(spec));
  candidate.params.energyInput = 1.1;
  const edited = lab.applyWorldSpecEdit(spec, candidate, {
    rationale: 'Create a legacy migration fixture',
  });
  const legacy = JSON.parse(JSON.stringify(edited));
  legacy.schemaVersion = worldSpec.LEGACY_WORLD_SPEC_VERSION;
  legacy.authorship.patches = legacy.authorship.patches.map((patch) => {
    const { compilerBaselineContentHash: _baseline, ...v1 } = patch;
    return { ...v1, schema: worldSpec.LEGACY_PATCH_SCHEMA };
  });
  legacy.contentHash = worldSpec.contentHash(legacy);

  const migrated = worldSpec.parseWorldSpec(JSON.stringify(legacy));
  assert.equal(migrated.schemaVersion, worldSpec.WORLD_SPEC_VERSION);
  assert.notEqual(migrated.contentHash, legacy.contentHash);
  assert.equal(migrated.authorship.patches[0].schema, worldSpec.LEGACY_PATCH_SCHEMA);
  assert.deepEqual(migrated.authorship.reconciliations, []);
  assert.equal(worldSpec.compilerBaselineContentHash(migrated), '');
  assert.equal(worldSpec.validateWorldSpec(migrated), migrated);
});

test('user edits append provenance, reject immutable evidence, and change execution identity', () => {
  const spec = compileFixture();
  const candidate = JSON.parse(lab.serializeSpec(spec));
  candidate.params.energyInput = 1.25;

  const edited = lab.applyWorldSpecEdit(spec, JSON.stringify(candidate), {
    rationale: 'Increase the applied energy',
  });
  const patch = edited.authorship.patches.at(-1);

  assert.equal(edited.params.energyInput, 1.25);
  assert.equal(edited.authorship.revision, 1);
  assert.equal(patch.authority, 'userOverride');
  assert.equal(patch.schema, worldSpec.PATCH_SCHEMA);
  assert.equal(patch.compilerBaselineContentHash, spec.contentHash);
  assert.equal(patch.targetPath, '/params/energyInput');
  assert.equal(patch.rationale, 'Increase the applied energy');
  assert.ok(patch.affectedObligationIds.includes('entity:wall'));
  assert.notEqual(edited.contentHash, spec.contentHash);

  const invalid = JSON.parse(lab.serializeSpec(spec));
  invalid.source.prompt = 'replace the source prompt';
  assert.throws(
    () => lab.applyWorldSpecEdit(spec, invalid, { rationale: 'Invalid source rewrite' }),
    /source is compiler evidence or immutable identity/
  );
});

test('user edits cannot forge grounding evidence or rewrite compiler refusals', () => {
  const spec = compileFixture();
  const expectEvidenceRejection = (mutate) => {
    const candidate = JSON.parse(lab.serializeSpec(spec));
    mutate(candidate);
    assert.throws(
      () => lab.applyWorldSpecEdit(spec, candidate, { rationale: 'Attempt evidence rewrite' }),
      /compiler evidence or immutable identity/
    );
  };

  expectEvidenceRejection((candidate) => {
    candidate.universeGraph.nodes[0].evidence = ['fabricated-user-grounding'];
  });
  expectEvidenceRejection((candidate) => {
    candidate.universeGraph.nodes[0].confidence = 0.123;
  });
  expectEvidenceRejection((candidate) => {
    candidate.universeGraph.compositionLedger.summary.failedCount = 99;
  });
  expectEvidenceRejection((candidate) => {
    candidate.universeGraph.nodes.push({
      id: 'user:forged-node',
      label: 'Forged node',
      evidence: ['pretend-retrieval-hit'],
    });
  });

  const unsupported = lab.createSpecFromPrompt('a red ball beside a qzxwplk', {
    allowPrototypeFallback: true,
  });
  assert.ok(unsupported.unsupportedRequirements.length > 0);
  const concealed = JSON.parse(lab.serializeSpec(unsupported));
  concealed.unsupportedRequirements = [];
  assert.throws(
    () => lab.applyWorldSpecEdit(unsupported, concealed, { rationale: 'Conceal refusal' }),
    /unsupportedRequirements is compiler evidence or immutable identity/
  );

  const inventedAmbiguity = JSON.parse(lab.serializeSpec(spec));
  inventedAmbiguity.unresolvedAmbiguities = [{ id: 'fake-ambiguity' }];
  assert.throws(
    () => lab.applyWorldSpecEdit(spec, inventedAmbiguity, { rationale: 'Rewrite ambiguity evidence' }),
    /unresolvedAmbiguities is compiler evidence or immutable identity/
  );
  assert.ok(worldSpec.IMMUTABLE_EDIT_ROOTS.includes('unsupportedRequirements'));
  assert.ok(worldSpec.IMMUTABLE_EDIT_ROOTS.includes('unresolvedAmbiguities'));
});

test('compiler baseline reverses append-only user patches and rejects a false patch chain', () => {
  const spec = compileFixture();
  const candidate = JSON.parse(lab.serializeSpec(spec));
  candidate.params.energyInput = 1.5;
  candidate.name = 'Edited compiler baseline fixture';
  const edited = lab.applyWorldSpecEdit(spec, candidate, {
    rationale: 'Exercise baseline reconstruction',
  });

  assert.equal(worldSpec.compilerBaselineContentHash(edited), spec.contentHash);
  assert.ok(edited.authorship.patches.every((patch) => (
    patch.compilerBaselineContentHash === spec.contentHash
  )));

  const tampered = JSON.parse(JSON.stringify(edited));
  tampered.authorship.patches[0].newValue = 99;
  tampered.contentHash = worldSpec.contentHash(tampered);
  assert.throws(
    () => worldSpec.compilerBaselineContentHash(tampered),
    /Patch chain does not match/
  );
});

test('semantic WorldSpec edits replace Phase 4 input and reach visual execution', () => {
  const spec = compileFixture();
  const candidate = JSON.parse(lab.serializeSpec(spec));
  const nodeIndex = candidate.universeGraph.nodes.findIndex((node) => (
    node.sourceLabel === 'ball' || node.label === 'Ball'
  ));
  assert.notEqual(nodeIndex, -1);
  const color = candidate.universeGraph.nodes[nodeIndex].properties.find((row) => row.kind === 'color');
  assert.ok(color);
  color.value = '#00aa44';

  const edited = lab.applyWorldSpecEdit(spec, candidate, {
    rationale: 'Make the ball green',
  });
  for (const phase of [1, 2, 3]) {
    assert.equal(
      edited.phaseArtifacts[`phase${phase}`],
      spec.phaseArtifacts[`phase${phase}`],
      `Phase ${phase} evidence remains bound across a downstream user override`
    );
  }
  const acceptedNode = edited.phaseArtifacts.phase4.artifact.groundedIntent.acceptedGraph.nodes[nodeIndex];
  const visualNode = edited.renderProgram.visualIR.entities.find((node) => /ball/i.test(node.label || ''));
  const visualObligations = edited.phaseArtifacts.phase6.artifact.visualCompile.compositionLedger.obligations
    .filter((row) => row.constraintKind === 'property' && row.targetNodeId === acceptedNode.id);
  const colorPatch = edited.authorship.patches.find((patch) => (
    patch.targetPath === `/universeGraph/nodes/${nodeIndex}/properties/0/value`
  ));
  const semanticLedger = edited.phaseArtifacts.phase4.artifact.semanticProvenance;
  const semanticProperty = semanticLedger.bindings.find((row) => (
    row.kind === 'property' && row.targetPath === `/universeGraph/nodes/${nodeIndex}/properties/0`
  ));

  assert.equal(acceptedNode.properties.find((row) => row.kind === 'color').value, '#00aa44');
  assert.equal(acceptedNode.authorship.authority, 'userOverride');
  assert.equal(visualNode.properties.find((row) => row.kind === 'color').value, '#00aa44');
  assert.deepEqual(visualObligations.map((row) => row.expectedValue), ['#00aa44']);
  assert.equal(visualObligations[0].status, 'preserved');
  assert.equal(visualObligations[0].authorship.authority, 'userOverride');
  assert.ok(colorPatch.affectedObligationIds.includes('visual:prompt-property-ball-color-#ef3340'));
  assert.equal(semanticLedger.status, 'pass');
  assert.equal(semanticLedger.missingCount, 0);
  assert.equal(semanticProperty.authority, 'userOverride');
  assert.ok(semanticProperty.patchIds.includes(colorPatch.id));
  assert.equal(
    edited.phaseArtifacts.phase4.receipts.find((row) => row.id === 'phase4-grounded-intent').authority,
    'userOverride'
  );
});

test('Create exposes editor, import, export, and replay controls in runtime order', () => {
  const html = fs.readFileSync(path.join(root, 'public/blank/index.html'), 'utf8');
  const schema = JSON.parse(fs.readFileSync(
    path.join(root, 'public/shared/contracts/world-spec.schema.json'),
    'utf8'
  ));

  for (const id of [
    'world-spec-editor',
    'world-spec-edit-rationale',
    'apply-world-spec',
    'replay-world-spec',
    'reset-world-spec-edit',
    'export-lab',
    'export-improvement-record',
    'import-lab',
    'world-spec-import-file',
    'world-spec-editor-status',
    'world-improvement-record-status',
    'world-spec-reconciliation-dialog',
    'world-spec-reconciliation-summary',
    'world-spec-reconciliation-conflicts',
    'world-spec-reconciliation-fields',
    'preserve-world-spec-overrides',
    'accept-recompiled-world-spec',
    'cancel-world-spec-reconciliation',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema.const, worldSpec.WORLD_SPEC_SCHEMA);
  assert.ok(
    runtimeManifest.browser.indexOf('../shared/contracts/world-spec-authorship.js') <
    runtimeManifest.browser.indexOf('../shared/contracts/world-spec.js')
  );
  assert.ok(
    runtimeManifest.browser.indexOf('../shared/contracts/world-spec.js') <
    runtimeManifest.browser.indexOf('../shared/contracts/world-proof-compiler.js')
  );
  assert.ok(
    runtimeManifest.browser.indexOf('../shared/contracts/world-proof-compiler.js') <
    runtimeManifest.browser.indexOf('../shared/contracts/world-proof-intent.js')
  );
  assert.ok(
    runtimeManifest.browser.indexOf('../shared/contracts/world-proof-intent.js') <
    runtimeManifest.browser.indexOf('../shared/contracts/world-proof-semantic.js')
  );
  assert.ok(
    runtimeManifest.browser.indexOf('../shared/contracts/world-proof-semantic.js') <
    runtimeManifest.browser.indexOf('../shared/contracts/world-proof-simulation.js')
  );
  assert.ok(
    runtimeManifest.browser.indexOf('../shared/contracts/world-proof-simulation.js') <
    runtimeManifest.browser.indexOf('../shared/contracts/world-proof-safety.js')
  );
  assert.ok(
    runtimeManifest.browser.indexOf('../shared/contracts/world-proof-safety.js') <
    runtimeManifest.browser.indexOf('../shared/contracts/world-proof.js')
  );
  assert.ok(
    runtimeManifest.browser.indexOf('../shared/contracts/world-proof.js') <
    runtimeManifest.browser.indexOf('../shared/contracts/world-improvement-record.js')
  );
  assert.ok(
    runtimeManifest.browser.indexOf('../shared/contracts/world-proof.js') <
    runtimeManifest.browser.indexOf('pipeline/phase-05-simulation/simulatte-physics-model-dependencies.js')
  );
  assert.ok(
    runtimeManifest.browser.indexOf('pipeline/phase-05-simulation/simulatte-physics-model-state-solvers.js') <
    runtimeManifest.browser.indexOf('pipeline/phase-05-simulation/simulatte-simulation-reproducibility.js')
  );
  assert.ok(
    runtimeManifest.browser.indexOf('pipeline/phase-05-simulation/simulatte-simulation-reproducibility.js') <
    runtimeManifest.browser.indexOf('pipeline/phase-05-simulation/simulatte-safety-proof.js')
  );
  assert.ok(
    runtimeManifest.browser.indexOf('pipeline/phase-04-grounded-intent/simulatte-intent-proof.js') <
    runtimeManifest.browser.indexOf('pipeline/phase-04-grounded-intent/simulatte-semantic-proof.js')
  );
  assert.ok(
    runtimeManifest.browser.indexOf('pipeline/phase-04-grounded-intent/simulatte-semantic-proof.js') <
    runtimeManifest.browser.indexOf('pipeline/phase-05-simulation/simulatte-physics-model.js')
  );
  assert.ok(
    runtimeManifest.browser.indexOf('app/prompt/world-spec-editor.js') <
    runtimeManifest.browser.indexOf('app/prompt/world-spec-reconciliation-controller.js')
  );
  assert.ok(
    runtimeManifest.browser.indexOf('../shared/contracts/world-spec-reconciliation.js') <
    runtimeManifest.browser.indexOf('app/prompt/world-spec-reconciliation-controller.js')
  );
  assert.ok(
    runtimeManifest.browser.indexOf('app/prompt/world-spec-reconciliation-controller.js') <
    runtimeManifest.browser.indexOf('app/prompt/prompt-controller-lab-controller.js')
  );
  assert.ok(
    runtimeManifest.browser.indexOf('app/prompt/prompt-controller-compiler-proof.js') <
    runtimeManifest.browser.indexOf('app/prompt/world-improvement-session.js')
  );
  assert.ok(
    runtimeManifest.browser.indexOf('app/prompt/world-improvement-session.js') <
    runtimeManifest.browser.indexOf('app/prompt/prompt-controller-lab-controller.js')
  );
});

test('a user may explicitly refuse an unsupported node without retaining stale execution obligations', () => {
  const boundarySet = JSON.parse(fs.readFileSync(
    path.join(root, 'tools/samer/simulatte-public-boundary-v1.json'),
    'utf8'
  ));
  assert.equal(boundarySet.schema, 'simulatte.promptBoundarySet.v1');
  assert.equal(boundarySet.governingMetric.everyBoundaryMustPass, true);
  const boundary = boundarySet.rows.find((row) => row.boundaryKind === 'unsupported-edit-replay');
  assert.ok(boundary);
  const includesUnsupported = (value) => String(JSON.stringify(value)).toLowerCase()
    .includes(boundary.unsupportedLabel.toLowerCase());
  const spec = lab.createSpecFromPrompt(boundary.prompt, {
    allowPrototypeFallback: true,
  });
  assert.ok(spec.unsupportedRequirements.some(includesUnsupported));
  const candidate = JSON.parse(lab.serializeSpec(spec));
  const removedNode = candidate.universeGraph.nodes.find(includesUnsupported);
  assert.ok(removedNode);
  candidate.universeGraph.nodes = candidate.universeGraph.nodes
    .filter((node) => node.id !== removedNode.id);
  candidate.universeGraph.edges = candidate.universeGraph.edges
    .filter((edge) => edge.from !== removedNode.id && edge.to !== removedNode.id);

  const edited = lab.applyWorldSpecEdit(spec, candidate, {
    rationale: boundary.edit.rationale,
  });
  const ledger = edited.phaseArtifacts.phase6.artifact.visualCompile.compositionLedger;
  const ledgerText = JSON.stringify({
    entries: ledger.entries,
    relations: ledger.relations,
    obligations: ledger.obligations,
  });

  assert.ok(!includesUnsupported(ledgerText));
  assert.ok(edited.unsupportedRequirements.some(includesUnsupported));
  assert.ok(edited.authorship.patches.some((row) => row.authority === 'userOverride' &&
    row.targetPath.startsWith('/universeGraph/nodes')));
  assert.ok(edited.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket.entities
    .every((row) => !includesUnsupported(row.identity || {})));
  assert.equal(edited.phaseArtifacts.phase4.artifact.semanticProvenance.status, 'pass');
  assert.ok(!includesUnsupported(edited.phaseArtifacts.phase4.artifact.semanticProvenance.bindings));
  assert.equal(lab.createSemanticProofReceiptForSpec(edited).status, 'pass');
});
