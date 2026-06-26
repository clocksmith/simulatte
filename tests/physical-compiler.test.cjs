const assert = require('node:assert/strict');
const test = require('node:test');

const lab = require('../public/js/simulatte-physics-lab.js');
const solverRegistry = require('../public/js/simulatte-solver-registry.js');
const advectionSolver = require('../public/js/solvers/simulatte-solver-advection.js');

test('prompt compiles through parse, universe graph, PhysicsIR, solver graph, and render IR', () => {
  const spec = lab.createSpecFromPrompt('lava spins a turbine near an ice castle wall');

  assert.equal(spec.promptParse.schema, 'simulatte.promptParse.v1');
  assert.equal(spec.universeGraph.schema, 'simulatte.universeGraph.v1');
  assert.equal(spec.physicsIR.schema, 'simulatte.physicalIR.v1');
  assert.equal(spec.validationReceipt.schema, 'simulatte.validationReceipt.v1');
  assert.equal(spec.solverGraph.schema, 'simulatte.solverGraph.v1');
  assert.equal(spec.renderIR.schema, 'simulatte.renderIR.v1');

  assert.ok(spec.universeGraph.nodes.some((node) => node.canonicalId === 'material.lava'));
  assert.ok(spec.universeGraph.nodes.some((node) => /turbine/.test(node.canonicalId)));
  assert.ok(spec.universeGraph.nodes.some((node) => node.canonicalId === 'material.ice'));
  assert.ok(spec.universeGraph.nodes.some((node) => node.canonicalId === 'structure.castle_wall'));
  assert.ok(spec.physicsIR.operators.some((operator) => operator.type === 'rotational_torque'));
  assert.ok(spec.physicsIR.operators.some((operator) => operator.type === 'heat_transfer'));
  assert.ok(spec.physicsIR.operators.some((operator) => operator.type === 'phase_transition'));
  assert.ok(spec.solverGraph.steps.some((step) => step.operatorType === 'rotational_torque'));
  assert.ok(spec.renderIR.objects.some((object) => object.glyph === 'turbine'));
  assert.ok(spec.renderIR.objects.some((object) => object.stateBindings.rotationRate));
  assert.equal(spec.renderProgram.provenance.compiler, 'simulatte.render-ir-to-render-program.v1');
  assert.equal(spec.renderProgram.rendererPlan.sceneKind, spec.renderIR.sceneHint);
  assert.equal(spec.physicalSpec.executableSolverGraph.schema, 'simulatte.solverGraph.v1');
  assert.ok(spec.physicalSpec.stateChannels.some((channel) => channel.startsWith('angularVelocity:')));
});

test('solver graph evolves typed finite channels for coupled lava turbine ice prompt', () => {
  const spec = lab.createSpecFromPrompt('lava spins a turbine near an ice castle wall');
  let state = lab.createSimulationState(spec);
  const angularKey = Object.keys(state.solverState.channels).find((key) => key.startsWith('angularVelocity:'));
  const iceKey = Object.keys(state.solverState.channels).find((key) => key.startsWith('liquidFraction:material-ice'));
  assert.ok(angularKey);
  assert.ok(iceKey);
  const startAngular = Number(state.solverState.channels[angularKey]);
  const startIce = Number(state.solverState.channels[iceKey]);

  for (let step = 0; step < 24; step += 1) {
    state = lab.stepSimulation(state, spec, 0.016);
  }

  assert.ok(Number.isFinite(state.solverState.channels[angularKey]));
  assert.ok(Number.isFinite(state.solverState.channels[iceKey]));
  assert.ok(state.solverState.channels[angularKey] > startAngular);
  assert.ok(state.solverState.channels[iceKey] >= startIce);
  assert.ok(state.solverState.summary.motion > 0);
});

test('unsupported and unresolved concepts are preserved in validation receipt', () => {
  const spec = lab.createSpecFromPrompt('magnetic castle soul trades entropy with a river');

  assert.equal(spec.validationReceipt.schema, 'simulatte.validationReceipt.v1');
  assert.ok(spec.validationReceipt.unresolved.some((row) => /soul/.test(row.promptSpan)));
  assert.ok(
    spec.validationReceipt.unsupported.length > 0 ||
    spec.validationReceipt.approximate.length > 0 ||
    spec.validationReceipt.unresolved.length > 0
  );
});

test('legacy custom specs migrate to compiler artifacts during normalization', () => {
  const legacy = {
    schema: 'simulatte.simulationSpec.v1',
    templateId: 'custom-world',
    name: 'Legacy Lava Turbine',
    description: 'legacy export without compiler artifacts',
    modules: ['fluid', 'thermal'],
    objects: [
      { id: 'lava', type: 'fluid', role: 'lava', domains: ['fluid', 'thermal'], material: 'lava' },
      { id: 'turbine', type: 'machine', role: 'turbine', domains: ['rigidBody', 'rotationalMechanics'], material: 'metal' },
    ],
    controls: [],
    params: { flowRate: 0.7, heatTransfer: 0.6 },
    intent: lab.createIntentFromPrompt('lava spins turbine'),
  };
  const spec = lab.normalizeSpec(legacy);

  assert.equal(spec.physicsIR.schema, 'simulatte.physicalIR.v1');
  assert.equal(spec.solverGraph.schema, 'simulatte.solverGraph.v1');
  assert.equal(spec.renderProgram.provenance.compiler, 'simulatte.render-ir-to-render-program.v1');
  assert.equal(spec.renderProgram.provenance.renderIR, 'simulatte.renderIR.v1');
  assert.equal(spec.renderProgram.provenance.solverGraph, 'simulatte.solverGraph.v1');
});

test('solver registry delegates executable operator steps to solver modules', () => {
  const registry = solverRegistry.createSolverRegistry();
  const operator = registry.operatorFor('advection');

  assert.equal(typeof advectionSolver.step, 'function');
  assert.equal(operator.step, advectionSolver.step);
});
