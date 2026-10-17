const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const phaseDir = path.join(root, 'public', 'blank', 'pipeline', 'phase-04-grounded-intent');

test('graph synthesis keeps its public API and constructs a grounded graph', () => {
  const api = require(path.join(phaseDir, 'simulatte-graph-synthesis.js'));
  const result = api.synthesizeWorldIntent('a mouse runs inside a hamster wheel');

  assert.equal(result.schema, api.SYNTHESIS_SCHEMA);
  assert.equal(result.synthGraph.nodes.length, 2);
  assert.equal(result.synthGraph.relations[0].type, 'inside');
  assert.equal(result.validation.valid, true);
});

test('graph synthesis browser layers publish the same executable API in manifest order', () => {
  const context = vm.createContext({
    SimulatteSemanticRag: require(path.join(
      root,
      'public',
      'blank',
      'pipeline',
      'phase-03-retrieval',
      'simulatte-semantic-rag.js'
    )),
  });
  for (const file of [
    'simulatte-graph-synthesis-support.js',
    'simulatte-graph-synthesis-retrieval.js',
    'simulatte-graph-synthesis-helpers.js',
  ]) {
    vm.runInContext(fs.readFileSync(path.join(phaseDir, file), 'utf8'), context);
  }

  const result = context.SimulatteGraphSynthesis.synthesizeWorldIntent('a mouse runs inside a hamster wheel');
  assert.equal(result.schema, context.SimulatteGraphSynthesis.SYNTHESIS_SCHEMA);
  assert.equal(result.validation.valid, true);
});

test('graph synthesis browser layers reject missing dependencies', () => {
  for (const file of [
    'simulatte-graph-synthesis-support.js',
    'simulatte-graph-synthesis-retrieval.js',
    'simulatte-graph-synthesis-helpers.js',
  ]) {
    const source = fs.readFileSync(path.join(phaseDir, file), 'utf8');
    assert.throws(
      () => vm.runInNewContext(source, {}),
      /requires/,
      `${file} must fail closed when loaded before its dependencies`
    );
  }
});

test('relations bind source-local participants rather than the first two retrieved nodes', () => {
  const api = require(path.join(phaseDir, 'simulatte-graph-synthesis.js'));
  const result = api.synthesizeWorldIntent('a cat. a mouse runs inside a hamster wheel');
  const relation = result.synthGraph.relations.find(row => row.type === 'inside');
  assert.ok(relation);
  const participants = relation.participants.map(id => result.synthGraph.nodes.find(node => node.id === id).cardId);
  assert.deepEqual(participants, ['mouse', 'hamster_wheel']);
  assert.equal(result.prompt.slice(relation.evidence.start, relation.evidence.end), 'inside');
});

test('unbound relation retrieval cannot manufacture a causal edge', () => {
  const api = require(path.join(phaseDir, 'simulatte-graph-synthesis.js'));
  const result = api.synthesizeWorldIntent('a mouse and a hamster wheel attached to', {
    cardMatches: [{ cardId: 'attached_to', score: 1 }]
  });
  assert.equal(result.synthGraph.relations.filter(row => row.type === 'attached_to').length, 0);
  assert.ok(result.synthGraph.unsupported.some(row => row.cardId === 'attached_to'));
  assert.equal(result.validation.valid, false);
});
