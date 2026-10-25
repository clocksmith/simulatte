const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const D = require('../public/simulatte/system-diagram/diagram.js');
const L = require('../public/simulatte/system-diagram/class-library.js');
const engine = require('../public/simulatte/system-diagram/engine.js');
const kernels = require('../public/simulatte/system-diagram/kernels-all.js');
const config = require('../public/data/system-diagram/config.json');
const library = L.loadSync(path.resolve(__dirname, '../public/data/system-diagram'));
const deps = { library, config, kernels };
const node = (id, classId, params = {}) => ({ id, classId, label: id, x: 0, y: 0, params });
const edge = (id, from, fromPort, to, toPort) => ({ id, from: { nodeId: from, portId: fromPort }, to: { nodeId: to, portId: toPort }, params: {} });
function sample() {
  const d = D.emptyDiagram(config); d.run.horizonSec = 10;
  d.nodes = [node('client', 'web-client', { ratePerSec: 20 }), node('api', 'web-server', { serviceMs: 10, concurrency: 1 }), node('db', 'database')];
  d.edges = [edge('request', 'client', 'out', 'api', 'in'), edge('query', 'api', 'calls', 'db', 'in')];
  return d;
}
const capture = (d, ids, id) => D.subsystems.capture(d, ids, { id, label: id }, library, config);
const compiled = d => D.compile(d, library, config);
function run(d) { const c = compiled(d), s = engine.initialize(c, deps); engine.advance(c, s, 10, deps); return { c, s, metrics: engine.metrics(c, s, deps) }; }

test('capture replaces an executable subgraph with typed external ports and lowerable pinned instance', () => {
  const original = sample(), saved = capture(original, ['api', 'db'], 'backend');
  assert.equal(original.nodes.length, 3);
  assert.equal(saved.diagram.nodes.length, 2);
  const instance = saved.diagram.nodes.find(n => n.id === saved.instanceId);
  assert.equal(instance.classId, 'subsystem.backend@1');
  const cls = D.resolveClass(instance.classId, saved.diagram, library, config);
  assert.ok(cls.ports.some(p => p.direction === 'in' && p.accepts.length));
  const c = compiled(saved.diagram);
  assert.equal(c.nodes.length, 3); assert.equal(c.edges.length, 2);
  assert.equal(c.composition.instances[0].classId, instance.classId);
  assert.ok(c.composition.mapping.some(m => m.path.join('/') === `${instance.id}/api`));
  assert.equal(c.nodes.find(n => n.kernel === 'service').params.serviceMs, 10);
  assert.deepEqual(run(saved.diagram).metrics, run(saved.diagram).metrics);
});

test('nested reuse, scoped overrides and immutable published versions compile independently', () => {
  const first = capture(sample(), ['api', 'db'], 'backend');
  const nested = capture(first.diagram, [first.instanceId], 'platform');
  const inserted = D.subsystems.insert(nested.diagram, 'platform', 1, { x: 300, y: 0 }, library, config);
  const d = inserted.diagram;
  d.nodes.find(n => n.id === inserted.instanceId).overrides = { [`${first.instanceId}/api`]: { serviceMs: 900 } };
  const c = compiled(d), apiRows = c.nodes.filter(n => n.kernel === 'service');
  assert.deepEqual(apiRows.map(n => n.params.serviceMs).sort((a,b) => a-b), [10, 900]);
  const next = structuredClone(d.subsystems.find(s => s.id === 'backend')); next.version = 2; next.nodes.find(n => n.id === 'api').params.serviceMs = 50;
  const published = D.subsystems.publish(d, next, library, config).diagram;
  assert.deepEqual(compiled(published), c, 'publishing alone does not alter pinned instances');
  assert.throws(() => D.subsystems.publish(published, next, library, config), /immutable/);
  const direct = D.subsystems.insert(published, 'backend', 1, { x: 400, y: 0 }, library, config);
  const upgraded = D.subsystems.upgrade(direct.diagram, direct.instanceId, 2, library, config).diagram;
  assert.equal(compiled(upgraded).nodes.filter(n => n.kernel === 'service').some(n => n.params.serviceMs === 50), true);
  assert.ok(Object.isFrozen(c.composition.mapping));
});

test('cycles, missing ports, wrong directions, invalid overrides and expanded bounds fail closed', () => {
  const saved = capture(sample(), ['api', 'db'], 'backend');
  const mutate = fn => { const d = structuredClone(saved.diagram); fn(d); return d; };
  assert.throws(() => D.validate(mutate(d => { d.subsystems[0].nodes[0].classId = 'subsystem.backend@1'; }), library, config), /cycle/);
  assert.throws(() => D.validate(mutate(d => { d.subsystems[0].ports[0].target.nodeId = 'missing'; }), library, config), /missing node/);
  assert.throws(() => D.validate(mutate(d => { d.subsystems[0].ports[0].direction = d.subsystems[0].ports[0].direction === 'in' ? 'out' : 'in'; }), library, config), /direction/);
  assert.throws(() => D.validate(mutate(d => { d.nodes[1].overrides = { missing: { serviceMs: 20 } }; }), library, config), /does not exist/);
  assert.throws(() => D.validate(mutate(d => { d.nodes[1].overrides = { api: { serviceMs: -1 } }; }), library, config), /serviceMs/);
  const tiny = structuredClone(config); tiny.bounds.maxNodes = 2;
  assert.throws(() => D.validate(saved.diagram, library, tiny), /expanded nodes/);
});

test('captured class defaults are pinned; label/layout edits do not change lowering identity', () => {
  const d = sample(); d.classes.push({ id: 'user.custom', label: 'Custom', extends: 'web-server', defaults: { serviceMs: 25 } });
  d.nodes[1].classId = 'user.custom'; d.nodes[1].params = {};
  const saved = capture(d, ['api', 'db'], 'backend').diagram;
  saved.classes[0].defaults.serviceMs = 999;
  assert.equal(compiled(saved).nodes.find(n => n.kernel === 'service').params.serviceMs, 25);
  const before = compiled(saved).composition;
  saved.nodes[1].x = 100; saved.nodes[1].label = 'Renamed';
  assert.deepEqual(compiled(saved).composition, before);
  const broken = structuredClone(saved); broken.subsystems[0].nodes[0].classId = 'user.custom';
  assert.throws(() => D.validate(broken, library, config), /mutable user classes/);
});

test('legacy schemas retain behavior and generated IDs avoid authored IDs', () => {
  for (const schema of [D.LEGACY_SCHEMA, D.ANNOTATED_SCHEMA, D.GROUP_SCHEMA]) { const d = sample(); d.schema = schema; assert.equal(compiled(d).nodes.length, 3); }
  const d = sample(); d.nodes[0].id = 'sub-1'; d.edges[0].from.nodeId = 'sub-1';
  const saved = capture(d, ['api', 'db'], 'backend').diagram;
  const c = compiled(saved); assert.equal(new Set(c.nodes.map(n => n.id)).size, 3); assert.ok(c.nodes.some(n => n.id === 'sub-1'));
});

test('architecture and instance overrides change synthetic bottlenecks, not only the drawing', () => {
  const fast = capture(sample(), ['api', 'db'], 'backend');
  const slow = structuredClone(fast.diagram); slow.nodes.find(n => n.id === fast.instanceId).overrides = { api: { serviceMs: 900 } };
  const a = run(fast.diagram), b = run(slow);
  const serviceA = a.c.nodes.find(n => n.kernel === 'service'), serviceB = b.c.nodes.find(n => n.kernel === 'service');
  assert.ok(a.s.nodes[serviceA.id].served > b.s.nodes[serviceB.id].served);
  assert.deepEqual(run(slow).s, b.s);
});

test('definition faults and failure-domain groups lower to the exact internal targets', () => {
  const d = sample();
  d.groups = [{ id: 'zone', label: 'Zone', kind: 'zone', x: 0, y: 0, w: 100, h: 100 }];
  d.nodes[1].groupId = 'zone'; d.nodes[2].groupId = 'zone';
  d.faults = [{ id: 'outage', atSec: 2, untilSec: 4, target: { kind: 'group', id: 'zone' }, type: 'zone-outage', params: {} }];
  const type = library.faultTypes.find(f => f.targets.includes('group'));
  d.faults[0].type = type.id;
  assert.throws(() => capture(d, ['api'], 'partial'), /every member/);
  const saved = capture(d, ['api', 'db'], 'backend').diagram, c = compiled(saved);
  assert.equal(c.groups[0].nodeIds.length, 2);
  assert.equal(c.faults[0].target.id, c.groups[0].id);
  assert.equal(c.nodes.filter(n => n.groupId === c.groups[0].id).length, 2);
});

test('outer overrides win over nested overrides without mutating either definition', () => {
  const first = capture(sample(), ['api', 'db'], 'backend');
  first.diagram.nodes.find(n => n.id === first.instanceId).overrides = { api: { serviceMs: 100 } };
  const outer = capture(first.diagram, [first.instanceId], 'platform');
  outer.diagram.nodes.find(n => n.id === outer.instanceId).overrides = { [`${first.instanceId}/api`]: { serviceMs: 300 } };
  const c = compiled(outer.diagram);
  assert.equal(c.nodes.find(n => n.kernel === 'service').params.serviceMs, 300);
  assert.equal(outer.diagram.subsystems.find(d => d.id === 'backend').nodes.find(n => n.id === 'api').params.serviceMs, 10);
  assert.equal(outer.diagram.subsystems.find(d => d.id === 'platform').nodes[0].overrides.api.serviceMs, 100);
});

test('depth limit and duplicate aliases are rejected before lowering', () => {
  let saved = capture(sample(), ['api', 'db'], 'backend');
  for (let i = 0; i < 7; i++) saved = capture(saved.diagram, [saved.instanceId], `layer${i}`);
  assert.throws(() => capture(saved.diagram, [saved.instanceId], 'tooDeep'), /depth/);
  const bad = structuredClone(saved.diagram), def = bad.subsystems[0];
  def.ports.push({ ...def.ports[0], id: 'alias' });
  assert.throws(() => D.validate(bad, library, config), /duplicate external alias/);
});

test('nested annotations and reordering definitions never renumber executable paths', () => {
  const saved = capture(sample(), ['api', 'db'], 'backend').diagram;
  const before = compiled(saved);
  saved.subsystems[0].notes.push({ id: 'aaa', text: 'Explain the backend', x: 2, y: 2 });
  assert.deepEqual(compiled(saved), before);
  saved.subsystems[0].nodes.reverse();
  assert.deepEqual(new Map(compiled(saved).nodes.map(n => [n.label, n.id])), new Map(before.nodes.map(n => [n.label, n.id])));
});
