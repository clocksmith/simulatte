'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const base = path.resolve(__dirname, '../public/data/system-diagram');
const C = require('../public/data/system-diagram/config.json'), L = require('../public/simulatte/system-diagram/class-library.js').loadSync(base);
const D = require('../public/simulatte/system-diagram/diagram.js'), A = require('../public/simulatte/system-diagram/architecture-model.js'), X = require('../public/simulatte/system-diagram/architecture-adapters.js');
const problems = JSON.parse(fs.readFileSync(path.join(base, 'problems.json'), 'utf8')).problems;
const manifest = JSON.parse(fs.readFileSync(path.join(base, 'composable-solutions/manifest.json'), 'utf8'));
const studyDocs = manifest.problems.map(e => ({ entry: e, doc: JSON.parse(fs.readFileSync(path.join(base, 'composable-solutions', e.path), 'utf8')) }));

test('every Lucyd problem converts to the shared model and back exactly, and each stage replays from its commands', () => {
  let stages = 0;
  for (const p of problems) {
    const study = X.fromLucydProblem(p, L, C);
    assert.ok(X.verifyStudy(study));
    assert.deepEqual(X.toLucydProblem(study, L, C), p, p.id);
    stages += study.solutions.reduce((n, s) => n + s.stages.length, 0);
  }
  assert.equal(stages, problems.reduce((n, p) => n + p.solutions.reduce((m, s) => m + s.stages.length, 0), 0));
});

test('every Excalidraw study document converts to the shared model and back exactly, and replays', () => {
  for (const { entry, doc } of studyDocs) {
    const study = X.fromStudyDocument(doc, entry.problemId);
    assert.ok(X.verifyStudy(study));
    assert.deepEqual(X.toStudyDocument(study), doc, entry.path);
  }
});

test('one merged record holds both authored solution sets and returns each to its own format', () => {
  const overlapping = studyDocs.filter(({ entry }) => problems.some(p => p.id === entry.problemId));
  assert.ok(overlapping.length > 0);
  for (const { entry, doc } of overlapping) {
    const lucyd = problems.find(p => p.id === entry.problemId);
    const merged = X.mergeStudies(X.fromLucydProblem(lucyd, L, C), X.fromStudyDocument(doc, entry.problemId));
    assert.equal(merged.solutions.length, lucyd.solutions.length + doc.solutions.length);
    assert.ok(X.verifyStudy(merged));
    assert.deepEqual(X.toLucydProblem(merged, L, C), lucyd);
    assert.deepEqual(X.toStudyDocument(merged), doc);
  }
});

test('design-only stages open in the Lucyd editor as unbound responsibilities that refuse to simulate', () => {
  let count = 0;
  for (const { entry, doc } of studyDocs) {
    const study = X.fromStudyDocument(doc, entry.problemId);
    for (const s of study.solutions) for (const st of s.stages) {
      const { diagram, ids } = X.toDesignDiagram(st.model, study.definitions, L, C, { outcome: st.meta.question });
      assert.equal(diagram.schema, D.DESIGN_SCHEMA);
      assert.throws(() => D.executable(diagram, L, C), /Unbound responsibilities/);
      assert.ok(A.sameGraph(X.fromDesignDiagram(diagram, ids, st.model, study.definitions, L, C).graph, st.model.graph));
      count++;
    }
  }
  assert.ok(count > 0);
});

// A two-component design: client sends to an API. Binding both makes it runnable; binding one does not.
const fixture = () => ({
  schema: A.SCHEMA, id: 'fixture', name: 'Fixture',
  definitions: { contracts: [{ id: 'api', version: 1, request: { q: 'text' }, response: { r: 'text' } }],
    components: [{ id: 'client', version: 1, label: 'Client', ports: [{ id: 'out-api', direction: 'out', contractId: 'api' }] }, { id: 'api', version: 1, label: 'API', ports: [{ id: 'in-api', direction: 'in', contractId: 'api' }] }], boundaries: [] },
  graph: { nodes: [{ id: 'c', label: 'Client', componentId: 'client', componentVersion: 1 }, { id: 'a', label: 'API', componentId: 'api', componentVersion: 1 }],
    edges: [{ id: 'e', from: { nodeId: 'c', portId: 'out-api' }, to: { nodeId: 'a', portId: 'in-api' }, contractId: 'api', mode: 'request-response' }], groups: [] },
  simulation: null, presentation: { study: { nodes: { c: { x: 0, y: 0 }, a: { x: 300, y: 0 } } } },
});

test('binding every component lowers a design to a runnable simulator diagram; partial binding refuses', () => {
  let m = A.validate(fixture());
  assert.deepEqual(X.unboundNodes(m), ['c', 'a']);
  m = A.apply(m, { op: 'bind', nodeId: 'c', binding: { classId: 'web-client', params: {}, ports: { 'out-api': 'out' } } });
  assert.throws(() => X.toSystemDiagram(m, L, C), /unbound components cannot lower.*a/);
  m = A.apply(m, { op: 'bind', nodeId: 'a', binding: { classId: 'web-server', params: {}, ports: { 'in-api': 'in' } } });
  const diagram = X.toSystemDiagram(m, L, C);
  assert.deepEqual(diagram.edges[0].from, { nodeId: 'c', portId: 'out' });
  assert.equal(D.compile(diagram, L, C).nodes.length, 2);
});

test('shared commands refuse contract mismatches, orphaned children and duplicate identities', () => {
  const m = A.validate(fixture());
  assert.throws(() => A.apply(m, { op: 'connect', edge: { id: 'x', from: { nodeId: 'a', portId: 'in-api' }, to: { nodeId: 'c', portId: 'out-api' }, contractId: 'api', mode: 'request-response' } }), /incompatible out endpoint/);
  assert.throws(() => A.apply(m, { op: 'insert', node: { id: 'c', label: 'Dup', componentId: 'api', componentVersion: 1 } }), /duplicate/);
  const removed = A.apply(m, { op: 'remove', nodeId: 'a' });
  assert.deepEqual(removed.graph.edges, []);
  assert.equal(removed.presentation.study.nodes.a, undefined);
  const parent = A.apply(m, { op: 'insert', node: { id: 'k', label: 'Child', componentId: 'api', componentVersion: 1, parentId: 'a' } });
  assert.throws(() => A.apply(parent, { op: 'remove', nodeId: 'a' }), /remove children before/);
  const moved = A.apply(m, { op: 'move', nodeId: 'c', view: 'lucyd', x: 10, y: 20 });
  assert.deepEqual(moved.presentation.lucyd.nodes.c, { x: 10, y: 20 });
  assert.ok(A.sameGraph(moved.graph, m.graph), 'layout never changes semantics');
});
