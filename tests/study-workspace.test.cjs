'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const study = require('../public/simulatte/system-diagram/study/composable-study.js');
const scene = require('../public/simulatte/system-diagram/study/scene.js');
const store = require('../public/simulatte/system-diagram/study/workspace-store.js');
const {applyOperation: contractApply} = require('../tools/simulatte/study-contract.cjs');

const DATA = path.join(__dirname, '../public/data/system-diagram/composable-solutions');
const manifest = JSON.parse(fs.readFileSync(path.join(DATA, 'manifest.json'), 'utf8'));
const raw = Object.fromEntries(manifest.problems.map(p => [p.referenceId, fs.readFileSync(path.join(DATA, p.path), 'utf8')]));
const first = Object.keys(raw)[0];
const spatial = require('../public/simulatte/system-diagram/study/spatial-layout.js');
test.before(async () => { for (const text of Object.values(raw)) await spatial.prepare(study.parse(text)); });

test('study adapter accepts every published study document', () => {
  for (const [id, text] of Object.entries(raw)) assert.equal(study.parse(text).problem.referenceId, id);
});

test('study adapter replays reconnect exactly like the contract validator', () => {
  const doc = study.parse(raw[first]), stage = doc.solutions[0].stages.find(s => s.graph.edges.length);
  const edge = stage.graph.edges[0], op = {op: 'reconnect', edgeId: edge.id, edge: {...edge, label: 'renamed'}, reason: 'contract owner renamed the label'};
  assert.deepEqual(study.applyOperation(stage.graph, op, 'probe'), contractApply(stage.graph, op));
  assert.throws(() => study.applyOperation(stage.graph, {...op, edge: {...op.edge, id: 'other'}}, 'probe'), /preserve edge identity/);
  assert.throws(() => study.applyOperation(stage.graph, {...op, reason: ''}, 'probe'), /reason/);
});

test('every published operation replays identically in the browser adapter and the contract validator', () => {
  let operations = 0;
  for (const text of Object.values(raw)) {
    const doc = study.parse(text);
    for (const solution of doc.solutions) {
      let graph = solution.initialGraph;
      for (const stage of solution.stages) for (const op of stage.operations) {
        const mine = study.applyOperation(graph, op, stage.id);
        assert.deepEqual(mine, contractApply(graph, op), `${solution.id}/${stage.id} ${op.op}`);
        graph = mine; operations++;
      }
    }
  }
  assert.ok(operations > 100);
});

test('v2-only operations are refused in v1 documents', () => {
  const doc = JSON.parse(raw[first]), stage = doc.solutions[0].stages.find(s => s.graph.nodes.some(n => n.subsystemId));
  doc.schema = 'simulatte.composableStudy.v1';
  const parent = stage.graph.nodes.find(n => n.subsystemId);
  stage.operations.push({op: 'rebind', nodeId: parent.id, subsystemId: parent.subsystemId, reason: 'probe'});
  assert.throws(() => study.validate(doc), /rebind requires simulatte\.composableStudy\.v2/);
});

test('study adapter rejects a stage graph that its operations do not produce, naming the stage', () => {
  const doc = JSON.parse(raw[first]), stage = doc.solutions[0].stages[1];
  stage.graph.nodes[0].label = 'tampered';
  assert.throws(() => study.validate(doc), new RegExp(`${doc.solutions[0].id}\\.${stage.id}`));
});

test('scene shows exactly the stage graph, with stable identities and marked changes', () => {
  for (const text of Object.values(raw)) {
    const doc = study.parse(text);
    for (const solution of doc.solutions) solution.stages.forEach((stage, i) => {
      const {elements} = scene.build(doc, solution, i);
      const ids = new Set(elements.map(el => el.id));
      for (const n of stage.graph.nodes) assert.ok(ids.has(`study:n:${n.id}`) || ids.has(`study:b:${n.id}`), `${solution.id}/${stage.id} missing ${n.id}`);
      for (const e of stage.graph.edges) assert.ok(ids.has(`study:e:${e.id}`), `${solution.id}/${stage.id} missing edge ${e.id}`);
      const nodeIds = new Set(stage.graph.nodes.map(n => n.id));
      for (const el of elements) if (el.customData.study.nodeId && el.customData.study.role !== 'removed') assert.ok(nodeIds.has(el.customData.study.nodeId));
      const before = study.previousGraph(solution, i), diff = study.difference(before, stage.graph);
      const marked = elements.filter(el => el.customData.study.role === 'node' && el.customData.study.change).map(el => el.customData.study.nodeId);
      assert.deepEqual(marked.sort(), [...diff.nodes.added, ...diff.nodes.changed].filter(id => elements.some(el => el.id === `study:n:${id}`)).sort());
    });
  }
});

test('collapsing a subsystem hides its internals but keeps edges to the boundary', () => {
  const doc = study.parse(raw[first]);
  for (const solution of doc.solutions) {
    const i = solution.stages.findIndex(s => s.graph.nodes.some(n => n.subsystemId));
    if (i < 0) continue;
    const graph = solution.stages[i].graph, parent = graph.nodes.find(n => n.subsystemId);
    const {elements} = scene.build(doc, solution, i, {collapsed: [parent.id]});
    assert.ok(elements.some(el => el.id === `study:n:${parent.id}`));
    for (const child of graph.nodes.filter(n => n.parentId === parent.id)) assert.ok(!elements.some(el => el.id === `study:n:${child.id}`));
    for (const e of graph.edges.filter(e => e.from.nodeId === parent.id || e.to.nodeId === parent.id)) assert.ok(elements.some(el => el.id === `study:e:${e.id}`));
    return;
  }
  assert.fail('no expanded subsystem in the first document');
});

test('a stage edit lives in that stage overlay only and survives rebuilding the authored scene', () => {
  const doc = study.parse(raw[first]), solution = doc.solutions[0];
  let ws = store.create(doc);
  const authored = scene.build(doc, solution, 2).elements, target = authored.find(el => el.customData.study.role === 'node');
  const edited = authored.map(el => (el.id === target.id ? {...el, x: el.x + 140, y: el.y + 60} : el));
  edited.push({id: 'sketch-1', type: 'freedraw', x: 0, y: 0, points: [[0, 0], [5, 5]]});
  const overlay = scene.diff(authored, edited);
  assert.deepEqual(Object.keys(overlay.patches), [target.id]);
  ws = store.withOverlay(ws, solution.id, solution.stages[2].id, overlay, scene.isEmpty);
  const again = scene.applyOverlay(scene.build(doc, solution, 2).elements, store.overlayFor(ws, solution.id, solution.stages[2].id));
  assert.equal(again.find(el => el.id === target.id).x, target.x + 140);
  assert.ok(again.some(el => el.id === 'sketch-1'));
  for (const i of [1, 3]) assert.equal(store.overlayFor(ws, solution.id, solution.stages[i].id), null);
  assert.deepEqual(ws.document, doc, 'authored document unchanged');
  assert.equal(scene.build(doc, solution, 3).elements.find(el => el.id === target.id)?.x ?? target.x, target.x);
});

test('workspace export and reimport round-trips document, overlays, view and unknown fields exactly', () => {
  const doc = study.parse(raw[first]), solution = doc.solutions[1] || doc.solutions[0];
  const authored = scene.build(doc, solution, 0).elements;
  let ws = {...store.create(doc), extensions: {futureTool: {kept: true}}};
  ws = store.withOverlay(ws, solution.id, solution.stages[0].id, scene.diff(authored, authored.slice(1)), scene.isEmpty);
  ws = store.withView(ws, {solutionId: solution.id, stageIndex: 0, collapsed: ['x'], showRemoved: true});
  const back = store.parse(store.serialize(ws));
  assert.equal(back.kind, 'workspace');
  assert.deepEqual(back.workspace, ws);
  assert.equal(store.parse(raw[first]).kind, 'document');
});

test('import failures name the offending location', () => {
  const ws = store.create(study.parse(raw[first]));
  const bad = structuredClone(ws); bad.overlays = {nope: {}};
  assert.throws(() => store.parse(JSON.stringify(bad)), /overlays\.nope/);
  const badStage = structuredClone(ws); badStage.overlays = {[ws.view.solutionId]: {missing: {patches: {}, removed: [], elements: []}}};
  assert.throws(() => store.parse(JSON.stringify(badStage)), /missing: no such stage/);
  const badDoc = structuredClone(ws); badDoc.document.solutions[0].stages[0].operations = [{op: 'teleport'}];
  assert.throws(() => store.parse(JSON.stringify(badDoc)), /document\..*unsupported operation teleport/);
  assert.throws(() => store.parse('{'), /file: not JSON/);
});


test('moved boxes retain bound-label coordinates across snapshots and old overlay restores',()=>{
 const doc=study.parse(raw[first]),solution=doc.solutions[0],authored=scene.build(doc,solution,0).elements;
 const node=authored.find(el=>el.customData.study.role==='node'),label=authored.find(el=>el.type==='text'&&el.containerId===node.id);
 const current=authored.map(el=>el.id===node.id||el.id===label.id?{...el,x:el.x+140,y:el.y+60}:el);
 const overlay=scene.diff(authored,current),restored=scene.applyOverlay(authored,overlay);
 assert.equal(overlay.patches[label.id].x,label.x+140);
 assert.equal(restored.find(el=>el.id===label.id).y,label.y+60);
 delete overlay.patches[label.id];
 const legacy=scene.applyOverlay(authored,overlay);
 assert.equal(legacy.find(el=>el.id===label.id).x,label.x+140);
 assert.equal(legacy.find(el=>el.id===label.id).y,label.y+60);
 assert.equal(authored.find(el=>el.id===label.id).x,label.x);
});
