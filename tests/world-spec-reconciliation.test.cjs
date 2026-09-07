const assert = require('node:assert/strict');
const test = require('node:test');

const lab = require('../public/blank/app/simulation/simulation-lab.js');
const worldSpec = require('../public/shared/contracts/world-spec.js');
const reconciliation = require('../public/shared/contracts/world-spec-reconciliation.js');
const controller = require('../public/blank/app/prompt/world-spec-reconciliation-controller.js');

function compileFixture() {
  return lab.createSpecFromPrompt('a red ball rests beside a blue wall', {
    allowPrototypeFallback: true,
    deterministicRuntime: true,
    retrievalPhase: 'deterministic-local',
  });
}

function editedFixture() {
  const compiled = compileFixture();
  const candidate = JSON.parse(lab.serializeSpec(compiled));
  candidate.params.energyInput = 1.25;
  return {
    compiled,
    edited: lab.applyWorldSpecEdit(compiled, candidate, {
      rationale: 'Increase the applied energy',
    }),
  };
}

test('preserved color edits reach compiled grounding and geometry without creating another authoring revision', () => {
  const compiled = compileFixture();
  const draft = JSON.parse(lab.serializeSpec(compiled));
  draft.universeGraph.nodes.find(node => node.label === 'Ball').properties.find(row => row.kind === 'color').value = '#00aa44';
  const edited = lab.applyWorldSpecEdit(compiled, draft, { rationale: 'Make the ball green' });
  const accepted = reconciliation.applyDecision(edited, compileFixture(), 'preserve-overrides');
  const model = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');
  const result = controller.prepareReconciledExecution(accepted, model.compileWorldSpecEdits);
  const spec = result.worldSpec;
  assert.deepEqual(spec.authorship, accepted.worldSpec.authorship);
  assert.equal(result.receipt.authoredResultWorldSpecContentHash, accepted.worldSpec.contentHash);
  assert.equal(result.receipt.resultWorldSpecContentHash, spec.contentHash);
  const node = spec.phaseArtifacts.phase4.artifact.groundedIntent.acceptedGraph.nodes.find(row => row.label === 'Ball');
  assert.equal(node.properties.find(row => row.kind === 'color').value, '#00aa44');
  const ball = spec.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket.entities.find(row => row.identity.type === 'ball');
  assert.ok(ball.geometry.program.parts.some(part => part.fill === '#00aa44'));
});

test('recompile plans expose every accepted override before execution', () => {
  const { compiled, edited } = editedFixture();
  const recompiled = compileFixture();
  const plan = reconciliation.createPlan(edited, recompiled);

  assert.equal(plan.schema, reconciliation.PLAN_SCHEMA);
  assert.equal(plan.authoredWorldSpec.contentHash, edited.contentHash);
  assert.equal(plan.compiledWorldSpec.contentHash, compiled.contentHash);
  assert.deepEqual(plan.acceptedPatchIds, edited.authorship.patches.map((row) => row.id));
  assert.deepEqual(plan.effectiveOverrides.map((row) => ({
    targetPath: row.targetPath,
    status: row.status,
  })), [{
    targetPath: '/params/energyInput',
    status: 'unchanged-baseline',
  }]);
  assert.equal(plan.preserveAllowed, true);
  assert.equal(plan.conflictCount, 0);
});

test('preserving overrides rebases them and appends a reconciliation record', () => {
  const { edited } = editedFixture();
  const recompiled = compileFixture();
  const result = reconciliation.applyDecision(edited, recompiled, 'preserve-overrides', {
    decidedBy: 'test-user',
  });
  const record = result.worldSpec.authorship.reconciliations.at(-1);

  assert.equal(result.worldSpec.params.energyInput, 1.25);
  assert.equal(result.worldSpec.authorship.revision, 1);
  assert.equal(result.worldSpec.authorship.patches.at(-1).authority, 'userOverride');
  assert.equal(record.schema, worldSpec.RECONCILIATION_SCHEMA);
  assert.equal(record.decision, 'preserve-overrides');
  assert.equal(record.previousWorldSpec.contentHash, edited.contentHash);
  assert.deepEqual(record.previousWorldSpec.patchIds, edited.authorship.patches.map((row) => row.id));
  assert.equal(record.compiledWorldSpec.contentHash, recompiled.contentHash);
  assert.equal(result.receipt.resultWorldSpecContentHash, result.worldSpec.contentHash);
  assert.deepEqual(result.receipt.preservedTargetPaths, ['/params/energyInput']);
  assert.equal(worldSpec.validateWorldSpec(result.worldSpec), result.worldSpec);
});

test('accepting a fresh compilation records the explicit supersession decision', () => {
  const { edited } = editedFixture();
  const recompiled = compileFixture();
  const result = reconciliation.applyDecision(edited, recompiled, 'accept-recompiled', {
    decidedBy: 'test-user',
  });
  const record = result.worldSpec.authorship.reconciliations.at(-1);

  assert.equal(result.worldSpec.params.energyInput, recompiled.params.energyInput);
  assert.notEqual(result.worldSpec.params.energyInput, edited.params.energyInput);
  assert.equal(result.worldSpec.authorship.revision, 0);
  assert.equal(result.worldSpec.authorship.patches.length, 0);
  assert.equal(record.decision, 'accept-recompiled');
  assert.equal(record.previousWorldSpec.contentHash, edited.contentHash);
  assert.deepEqual(result.receipt.preservedTargetPaths, []);
  assert.notEqual(result.worldSpec.contentHash, recompiled.contentHash);
  assert.equal(worldSpec.validateWorldSpec(result.worldSpec), result.worldSpec);
});

test('compiler conflicts remain visible and require a named decision', () => {
  const { edited } = editedFixture();
  const recompiled = worldSpec.finalizeWorldSpec({
    ...compileFixture(),
    params: { ...compileFixture().params, energyInput: 2 },
  });
  const plan = reconciliation.createPlan(edited, recompiled);

  assert.equal(plan.conflictCount, 1);
  assert.equal(plan.effectiveOverrides[0].status, 'compiler-conflict');
  assert.throws(
    () => reconciliation.applyDecision(edited, recompiled, 'silent-default'),
    /Unknown reconciliation decision/
  );
  assert.throws(
    () => reconciliation.applyDecision(edited, recompiled, 'preserve-overrides', {
      planId: 'reconciliation-plan:stale',
    }),
    /plan no longer matches/
  );

  const preserved = reconciliation.applyDecision(edited, recompiled, 'preserve-overrides');
  assert.equal(preserved.worldSpec.params.energyInput, 1.25);
  assert.equal(preserved.worldSpec.authorship.reconciliations[0].effectiveOverrides[0].status, 'compiler-conflict');
});

test('reconciliation history is append-only across repeated recompiles', () => {
  const { edited } = editedFixture();
  const first = reconciliation.applyDecision(edited, compileFixture(), 'preserve-overrides').worldSpec;
  const second = reconciliation.applyDecision(first, compileFixture(), 'accept-recompiled').worldSpec;

  assert.equal(second.authorship.reconciliations.length, 2);
  assert.equal(second.authorship.reconciliations[0].id, first.authorship.reconciliations[0].id);
  assert.equal(second.authorship.reconciliations[1].previousWorldSpec.contentHash, first.contentHash);
  assert.equal(worldSpec.validateWorldSpec(second), second);
});

test('WorldSpec 1.1 artifacts migrate into the reconciliation-aware authoring schema', () => {
  const previous = JSON.parse(lab.serializeSpec(compileFixture()));
  previous.schemaVersion = worldSpec.PREVIOUS_WORLD_SPEC_VERSION;
  previous.authorship.schema = 'simulatte.worldSpecAuthoring.v1';
  delete previous.authorship.reconciliations;
  previous.contentHash = worldSpec.contentHash(previous);

  const migrated = worldSpec.parseWorldSpec(JSON.stringify(previous));
  assert.equal(migrated.schemaVersion, worldSpec.WORLD_SPEC_VERSION);
  assert.equal(migrated.authorship.schema, worldSpec.AUTHORING_SCHEMA);
  assert.deepEqual(migrated.authorship.reconciliations, []);
  assert.equal(worldSpec.validateWorldSpec(migrated), migrated);
});
