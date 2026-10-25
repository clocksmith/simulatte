const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = '../public/simulatte/system-diagram/';
const libraryApi = require(base + 'class-library.js');
const documents = require(base + 'diagram.js');
const kernels = require(base + 'kernels-all.js');
const engine = require(base + 'engine.js');
const learning = require(base + 'learning.js');
const config = require('../public/data/system-diagram/config.json');
const library = libraryApi.loadSync(path.join(__dirname, '../public/data/system-diagram'));
const journeys = require('../public/data/system-diagram/learning-journeys.json');
const deps = { library, config, kernels };

test('each learning step identifies actual editable components in its runnable example', () => {
  learning.validate(journeys);
  for (const journey of journeys.journeys) {
    assert.ok(config.examples.some(row => row.id === journey.id));
    const diagram = require(`../public/data/system-diagram/examples/${journey.id}.json`);
    const compiled = documents.compile(diagram, library, config);
    assert.ok(compiled.nodes.length > 1);
    for (const step of journey.steps) {
      assert.ok(diagram.nodes.some(node => step.classes.includes(node.classId)), `${journey.id}: ${step.label}`);
      for (const classId of step.classes) assert.ok(library.classes[classId], classId);
    }
    for (const edge of diagram.edges) assert.ok(edge.label?.trim(), `${journey.id}: ${edge.id} must explain its operation`);
  }
});

test('record observation rejects sparse/non-object rows and bounds before scanning', () => {
  const diagram = require('../public/data/system-diagram/examples/chat-application.json');
  const compiled = documents.compile(diagram, library, config);
  const state = engine.initialize(compiled, deps);
  function observe(records) {
    const replacement = { ...deps, kernels: { has: id => kernels.has(id), get: id => ({ ...kernels.get(id), ...(id === 'applicationClient' ? { observe: () => ({ records }) } : {}) }) } };
    return engine.observe(compiled, state, replacement);
  }
  assert.throws(() => observe({ rows: new Array(1) }), /record object/);
  assert.throws(() => observe({ rows: ['user-1'] }), /record object/);
  assert.throws(() => observe({ rows: new Array(config.engine.maxRecords + 1) }), /at most/);
  const input = { rows: [{ id: 'one', nested: { value: 1 } }] };
  const result = observe(input);
  result.nodes.client.records.rows[0].nested.value = 7;
  assert.equal(input.rows[0].nested.value, 1);
});

test('record tables follow graph and selection identity rather than labels or example names', () => {
  const diagram = { nodes: [{ id: 'one', label: '<script>name</script>' }, { id: 'two', label: 'Same' }] };
  const view = { nodes: { one: { records: { messages: [{ id: 'm1' }] } }, two: { records: { tasks: [{ id: 't1' }] } } } };
  assert.equal(learning.tables(diagram, view, { nodes: [] }).length, 2);
  assert.deepEqual(learning.tables(diagram, view, { nodes: ['two'] }).map(row => row.rows[0].id), ['t1']);
  assert.equal(learning.tables(diagram, null, { nodes: [] }).length, 0);
});
