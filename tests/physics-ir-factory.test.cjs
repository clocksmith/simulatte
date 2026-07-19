const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const phaseDir = path.join(root, 'public', 'blank', 'pipeline', 'phase-05-simulation');

function emptyGraph() {
  return { nodes: [], edges: [], unresolved: [], observables: [] };
}

test('PhysicsIR keeps its public entry and produces a contract-shaped empty compilation', () => {
  const api = require(path.join(phaseDir, 'simulatte-physics-ir.js'));
  const result = api.buildPhysicsIR({ universeGraph: emptyGraph() });

  assert.equal(result.schema, api.PHYSICAL_IR_SCHEMA);
  assert.deepEqual(result.entities, []);
  assert.equal(result.receipt.unsupported.length, 1);
});

test('PhysicsIR browser layers publish the same API in manifest order', () => {
  const context = vm.createContext({
    SimulattePhysicsCatalog: require(path.join(phaseDir, 'simulatte-physics-catalog.js')),
    SimulatteLanguageLexicon: require(path.join(root, 'public', 'data', 'simulatte-language-lexicon.js')),
    SimulatteOperatorStage: require(path.join(phaseDir, 'simulatte-operator-stage.js')),
  });
  for (const file of [
    'simulatte-physics-ir-domains.js',
    'simulatte-physics-ir-behaviors.js',
    'simulatte-physics-ir-builder.js',
  ]) {
    vm.runInContext(fs.readFileSync(path.join(phaseDir, file), 'utf8'), context);
  }

  const result = context.SimulattePhysicsIR.buildPhysicsIR({ universeGraph: emptyGraph() });
  assert.equal(result.schema, context.SimulattePhysicsIR.PHYSICAL_IR_SCHEMA);
});

test('PhysicsIR browser support and builder fail closed out of order', () => {
  for (const file of ['simulatte-physics-ir-domains.js', 'simulatte-physics-ir-builder.js']) {
    assert.throws(
      () => vm.runInNewContext(fs.readFileSync(path.join(phaseDir, file), 'utf8'), {}),
      /requires/,
      `${file} must reject missing dependencies`
    );
  }
});
