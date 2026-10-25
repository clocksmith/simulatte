const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const libraryApi = require('../public/simulatte/system-diagram/class-library.js');
const doc = require('../public/simulatte/system-diagram/diagram.js');
const config = require('../public/data/system-diagram/config.json');
const library = libraryApi.loadSync(path.join(root, 'public/data/system-diagram'));

function sample() {
  return {
    schema: doc.SCHEMA, id: 'sample', name: 'Sample', seed: 7, run: { horizonSec: 60 },
    classes: [{ id: 'user.fast-api', label: 'Fast API', extends: 'web-server', defaults: { serviceMs: 2 } }],
    nodes: [
      { id: 'users', classId: 'web-client', label: 'Users', x: 0, y: 0, params: { ratePerSec: 40 } },
      { id: 'api', classId: 'user.fast-api', label: 'API', x: 240, y: 0, params: { concurrency: 4 }, groupId: 'zone-a' },
      { id: 'db', classId: 'database', label: 'DB', x: 480, y: 0, params: {} },
    ],
    edges: [
      { id: 'e1', from: { nodeId: 'users', portId: 'out' }, to: { nodeId: 'api', portId: 'in' }, params: { latencyMs: 20 } },
      { id: 'e2', from: { nodeId: 'api', portId: 'calls' }, to: { nodeId: 'db', portId: 'in' }, params: {} },
    ],
    groups: [{ id: 'zone-a', label: 'Zone A', kind: 'zone', x: -20, y: -40, w: 420, h: 160 }],
    notes: [], faults: [{ id: 'f1', atSec: 10, untilSec: 20, target: { kind: 'node', id: 'db' }, type: 'slow', params: {} }],
    view: { x: 0, y: 0, zoom: 1 },
  };
}

test('class library packs load with every kernel parameter defaulted and every class valid', () => {
  assert.ok(library.classOrder.length >= 45);
  for (const id of ['web-client', 'nl-input', 'task-queue', 'dead-letter-queue', 'circuit-breaker', 'retry-policy', 'replicated-db', 'cache', 'cron-scheduler', 'crawler', 'llm', 'embedder', 'vector-index', 'rag-retriever', 'structured-response', 'object-store', 'unstructured-feed']) assert.ok(library.classes[id], id);
  const manifest = require('../public/data/system-diagram/class-library.json');
  const packs = manifest.packs.map(p => require(path.join(root, 'public/data/system-diagram', p)));
  const broken = structuredClone(packs); broken[0].classes[0].defaults.ratePerSec = -1;
  assert.throws(() => libraryApi.build(manifest, broken), /number in \[0, 5000\]/);
  const unknown = structuredClone(packs); unknown[0].classes[0].defaults.bogus = 1;
  assert.throws(() => libraryApi.build(manifest, unknown), /parameter of kernel source/);
});

test('instance overrides win over user class defaults, built-in defaults and kernel defaults', () => {
  const d = doc.validate(sample(), library, config);
  const api = doc.resolveNodeParams(d.nodes[1], d, library, config);
  assert.deepEqual(api.klass.chain, ['user.fast-api', 'web-server']);
  assert.equal(api.klass.kernel, 'service');
  assert.equal(api.values.concurrency, 4); assert.equal(api.sources.concurrency, 'instance');
  assert.equal(api.values.serviceMs, 2); assert.equal(api.sources.serviceMs, 'user.fast-api');
  assert.equal(api.values.queueCapacity, 1000); assert.equal(api.sources.queueCapacity, 'kernel');
  const compiled = doc.compile(d, library, config);
  assert.ok(Object.isFrozen(compiled.nodes[0].params));
  assert.deepEqual(compiled.nodes.find(n => n.id === 'api').out.calls, ['e2']);
  assert.equal(compiled.edges[0].params.latencyMs, 20); assert.equal(compiled.edges[1].params.latencyMs, library.edgeParams.latencyMs.default);
  assert.deepEqual(compiled.groups[0].nodeIds, ['api']);
  assert.equal(compiled.faults[0].params.factor, 5);
});

test('phone overview camera survives JSON and browser storage without changing execution', () => {
  const Files = require('../public/simulatte/system-diagram/file-io.js');
  const initial = doc.validate(sample(), library, config), fitted = structuredClone(initial);
  fitted.view = {x:-150,y:-200,zoom:.08};
  const values = new Map(), store = Files.autosave(config,{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)});
  assert.equal(store.save(fitted),true);
  const restored=doc.validate(JSON.parse(JSON.stringify(store.loadRecord().diagram)),library,config);
  assert.deepEqual(restored.view,fitted.view);
  assert.deepEqual(doc.compile(restored,library,config),doc.compile(initial,library,config));
  restored.view.zoom=0;
  assert.throws(()=>doc.validate(restored,library,config),/diagram.view.zoom/);
});

test('deriving a class moves instance overrides into the new class and keeps resolved values', () => {
  const d = doc.validate(sample(), library, config);
  const before = doc.resolveNodeParams(d.nodes[1], d, library, config).values;
  const { diagram, classId } = doc.deriveClass(d, 'api', { label: 'Small API' }, library, config);
  const node = diagram.nodes.find(n => n.id === 'api');
  assert.equal(node.classId, classId); assert.deepEqual(node.params, {});
  assert.deepEqual(doc.resolveNodeParams(node, diagram, library, config).values, before);
  assert.deepEqual(diagram.classes.find(c => c.id === classId).defaults, { concurrency: 4 });
  const changed = doc.changeClass(diagram, 'api', 'task-queue', library, config);
  assert.deepEqual(changed.removedEdges, ['e2'], 'edges on ports the new kernel lacks are removed');
});

test('validation rejects undeclared fields, bad ports, single-port overuse, cycles in classes and bad faults', () => {
  const cases = [
    [d => { d.nodes[0].params.bogus = 1; }, /declared parameter/],
    [d => { d.edges[0].to.portId = 'calls'; }, /in port of service/],
    [d => { d.edges.push({ id: 'e3', from: { nodeId: 'users', portId: 'out' }, to: { nodeId: 'api', portId: 'in' }, params: {} }); }, /duplicate edge/],
    [d => { d.classes.push({ id: 'user.a', label: 'A', extends: 'user.b', defaults: {} }, { id: 'user.b', label: 'B', extends: 'user.a', defaults: {} }); }, /acyclic/],
    [d => { d.faults[0].type = 'partition'; }, /fault type for node/],
    [d => { d.faults[0].type = 'failLeader'; }, /fault supported by database/],
    [d => { d.nodes[1].groupId = 'missing'; }, /existing group/],
    [d => { d.extra = true; }, /declared field/],
    [d => { d.nodes[2].id = 'api'; }, /unique/],
  ];
  for (const [mutate, pattern] of cases) { const d = sample(); mutate(d); assert.throws(() => doc.validate(d, library, config), pattern); }
  const warnings = doc.issues(doc.validate({ ...sample(), edges: [] }, library, config), library, config);
  assert.ok(warnings.some(w => w.kind === 'unconnected-port' && w.nodeId === 'users'));
  const llm = sample(); llm.nodes.push({ id: 'gen', classId: 'llm', label: 'LLM', x: 0, y: 200, params: {} }); llm.edges.push({ id: 'e9', from: { nodeId: 'api', portId: 'calls' }, to: { nodeId: 'gen', portId: 'in' }, params: {} });
  assert.equal(doc.issues(doc.validate(llm, library, config), library, config).filter(w => w.kind === 'payload-mismatch').length, 0, 'inherit payloads are not flagged');
  assert.equal(doc.canConnect(doc.validate(sample(), library, config), library, config, { nodeId: 'db', portId: 'in' }, { nodeId: 'api', portId: 'in' }).ok, false);
});
