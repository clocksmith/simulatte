(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteGraphDocument = api;
})(globalThis, function () {
  'use strict';
  const SCHEMA = 'simulatte.systemDiagram.v2';
  const PAYLOAD_TYPES = Object.freeze(['natural-language', 'structured', 'unstructured']);
  const TYPES = Object.freeze(['client', 'cpu', 'gpu', 'queue', 'rpc', 'database', 'replica', 'scheduler', 'crawler', 'rag', 'model']);
  const SOURCES = Object.freeze(['client', 'scheduler']);
  const PROPERTY_KEYS = Object.freeze(['serviceTime', 'concurrency', 'queueCapacity', 'memoryMiB', 'memoryLimitMiB', 'retries', 'retryDelay', 'failureAt', 'recoveryAt', 'outputType', 'spawnCount']);
  const clone = value => structuredClone(value);
  function definition(type, label, defaults = {}, inputs = PAYLOAD_TYPES, outputs = PAYLOAD_TYPES) {
    return { id: `class-${type}`, type, label, defaults: { serviceTime: 0.25, concurrency: 2, queueCapacity: 16, memoryMiB: 1, memoryLimitMiB: 1024,
      retries: 3, retryDelay: 0.5, failureAt: null, recoveryAt: null, outputType: 'preserve', spawnCount: 1, ...defaults }, ports: { in: [...inputs], out: [...outputs] } };
  }
  const DEFAULT_CLASSES = Object.freeze([
    definition('client', 'Client', { serviceTime: 0 }, [], PAYLOAD_TYPES),
    definition('cpu', 'CPU worker', { serviceTime: 0.3 }),
    definition('gpu', 'GPU worker', { serviceTime: 0.8, memoryMiB: 64, memoryLimitMiB: 512, concurrency: 1 }),
    definition('queue', 'Task queue', { serviceTime: 0.05, concurrency: 1, queueCapacity: 8 }),
    definition('rpc', 'RPC service', { serviceTime: 0.4, failureAt: 2, recoveryAt: 4 }),
    definition('database', 'Database', { serviceTime: 0.2, outputType: 'structured' }, PAYLOAD_TYPES, ['structured']),
    definition('replica', 'Database replica', { serviceTime: 0.35, outputType: 'structured' }, ['structured'], ['structured']),
    definition('scheduler', 'Cron scheduler', { serviceTime: 0, outputType: 'structured' }, [], ['structured']),
    definition('crawler', 'Crawler', { serviceTime: 0.6, concurrency: 1, outputType: 'unstructured', spawnCount: 2 }, ['structured'], ['unstructured']),
    definition('rag', 'RAG retrieval', { serviceTime: 0.45, outputType: 'structured' }, ['natural-language', 'unstructured'], ['structured']),
    definition('model', 'Model stage', { serviceTime: 0.7, memoryMiB: 32, outputType: 'natural-language' }, ['natural-language', 'structured'], ['natural-language', 'structured'])
  ]);
  const ASSUMPTIONS = Object.freeze([
    'Synthetic discrete events, seeded service jitter, bounded DAGs and FIFO queues; no external requests or model inference.',
    'Links serialize payloads FIFO at capacity MiB/s plus fixed latency; no TCP, packet loss or congestion control.',
    'Classes define service time, concurrency, admission memory and finite retries. Clusters share concurrency slots, not arbitrary failure domains.',
    'Database and replica effects are idempotent per logical request and node. Replication is asynchronous fan-out, not consensus or quorum.',
    'Crawler fan-out produces bounded synthetic collection items; RAG/model stages transform declared payload types without semantic AI quality claims.'
  ]);
  function create(example = 'pipeline') {
    const doc = { schema: SCHEMA, revision: 1, nextId: 1, classes: clone(DEFAULT_CLASSES), nodes: [], links: [], clusters: [],
      workload: { seed: 42, count: 12, interval: 0.5, deadline: 10, payloadType: 'natural-language', payloadMiB: 1 }, assumptions: [...ASSUMPTIONS] };
    if (example === 'blank') return doc;
    const types = example === 'collection' ? ['scheduler', 'crawler', 'cpu', 'database', 'replica'] : ['client', 'queue', 'rpc', 'rag', 'gpu', 'model', 'database', 'replica'];
    if (!['pipeline', 'rag', 'collection'].includes(example)) throw Error(`Unknown graph example ${example}`);
    let previous = null;
    types.forEach((type, index) => { const id = addNode(doc, `class-${type}`, 90 + (index % 3) * 260, 90 + Math.floor(index / 3) * 190);
      if (previous) connect(doc, { from: previous, to: id, fromPort: 'out', toPort: 'in', capacity: 100, latency: 0.02 }); previous = id; });
    return doc;
  }
  function exact(value, keys, context) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k)) || keys.some(k => !Object.hasOwn(value, k))) throw Error(`${context}: missing or undeclared fields`);
  }
  function bounded(value, min, max, label, integer = false) {
    if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw Error(`${label} must be ${integer ? 'an integer ' : ''}in [${min}, ${max}]`);
  }
  function properties(value, partial = false) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !PROPERTY_KEYS.includes(k))) throw Error('Unknown class property or instance override');
    if (!partial && PROPERTY_KEYS.some(k => !Object.hasOwn(value, k))) throw Error('Missing class defaults');
    for (const [key, v] of Object.entries(value)) {
      if (key === 'outputType') { if (!['preserve', ...PAYLOAD_TYPES].includes(v)) throw Error('Unsupported output payload type'); }
      else if (['failureAt', 'recoveryAt'].includes(key)) { if (v !== null) bounded(v, 0, 60, key); }
      else if (['concurrency', 'queueCapacity', 'retries', 'spawnCount'].includes(key)) bounded(v, key === 'retries' ? 0 : 1, key === 'queueCapacity' ? 256 : key === 'spawnCount' ? 4 : 16, key, true);
      else bounded(v, key === 'serviceTime' || key === 'memoryMiB' ? 0 : 0.001, key === 'memoryLimitMiB' ? 1048576 : key === 'memoryMiB' ? 65536 : 60, key);
    }
  }
  function resolveNode(doc, nodeOrId) {
    const node = typeof nodeOrId === 'string' ? doc.nodes.find(n => n.id === nodeOrId) : nodeOrId;
    if (!node) throw Error('Node does not exist');
    const cls = doc.classes.find(c => c.id === node.classId); if (!cls) throw Error(`Missing class ${node.classId}`);
    return { ...node, type: cls.type, properties: { ...cls.defaults, ...node.overrides }, ports: clone(cls.ports), classLabel: cls.label };
  }
  function outputTypes(node, doc) { return node.properties.outputType === 'preserve' ? SOURCES.includes(node.type) ? [doc.workload.payloadType] : node.ports.out : [node.properties.outputType]; }
  function validateConnection(doc, link, ignoreId = null) {
    const from = resolveNode(doc, link.from), to = resolveNode(doc, link.to);
    if (from.id === to.id) throw Error('A node cannot connect to itself');
    if (link.fromPort !== 'out' || link.toPort !== 'in') throw Error('Connect an output port to an input port');
    if (!from.ports.out.length || !to.ports.in.length) throw Error('Source nodes have output ports only');
    if (!outputTypes(from, doc).some(t => to.ports.in.includes(t))) throw Error(`Incompatible ports: ${from.label} outputs ${outputTypes(from, doc).join(', ')}; ${to.label} accepts ${to.ports.in.join(', ')}`);
    bounded(link.capacity, 0.001, 100000, 'Link capacity'); bounded(link.latency, 0, 60, 'Link latency');
    if (doc.links.some(l => l.id !== ignoreId && l.from === from.id && l.to === to.id)) throw Error('Connection already exists');
    const adjacency = new Map(doc.nodes.map(n => [n.id, []]));
    for (const l of doc.links.filter(l => l.id !== ignoreId)) adjacency.get(l.from)?.push(l.to);
    adjacency.get(from.id).push(to.id);
    const visiting = new Set(), seen = new Set();
    function visit(id) { if (visiting.has(id)) throw Error('Cyclic routing is unsupported. Configure retries on a node instead'); if (seen.has(id)) return; visiting.add(id); for (const next of adjacency.get(id) || []) visit(next); visiting.delete(id); seen.add(id); }
    doc.nodes.forEach(n => visit(n.id)); return true;
  }
  function validate(doc, options = {}) {
    exact(doc, ['schema', 'revision', 'nextId', 'classes', 'nodes', 'links', 'clusters', 'workload', 'assumptions'], 'Graph document');
    if (doc.schema !== SCHEMA) throw Error('Unsupported graph schema'); bounded(doc.revision, 1, 1e9, 'Revision', true); bounded(doc.nextId, 1, 1e9, 'ID counter', true);
    for (const [key, limit] of [['classes', 64], ['nodes', 64], ['links', 128], ['clusters', 16]]) if (!Array.isArray(doc[key]) || doc[key].length > limit) throw Error(`Graph ${key} exceeds ${limit}`);
    const ids = new Set();
    for (const item of [...doc.classes, ...doc.nodes, ...doc.links, ...doc.clusters]) { if (typeof item.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(item.id) || ids.has(item.id)) throw Error('Graph IDs must be unique safe strings'); ids.add(item.id); }
    for (const cls of doc.classes) {
      exact(cls, ['id', 'type', 'label', 'defaults', 'ports'], 'Class'); if (!TYPES.includes(cls.type) || typeof cls.label !== 'string' || cls.label.length > 80) throw Error('Invalid class type/label');
      properties(cls.defaults); exact(cls.ports, ['in', 'out'], 'Ports');
      for (const direction of ['in', 'out']) if (!Array.isArray(cls.ports[direction]) || cls.ports[direction].length > 3 || cls.ports[direction].some(t => !PAYLOAD_TYPES.includes(t)) || new Set(cls.ports[direction]).size !== cls.ports[direction].length) throw Error('Invalid payload port types');
      if (SOURCES.includes(cls.type) ? cls.ports.in.length || !cls.ports.out.length : !cls.ports.in.length || !cls.ports.out.length) throw Error('Source classes have no input; processing classes require input/output ports');
    }
    for (const group of doc.clusters) { exact(group, ['id', 'label', 'capacity'], 'Cluster'); bounded(group.capacity, 1, 64, 'Cluster concurrency slots', true); if (typeof group.label !== 'string' || group.label.length > 80) throw Error('Invalid cluster label'); }
    for (const node of doc.nodes) {
      exact(node, ['id', 'classId', 'label', 'x', 'y', 'overrides', 'clusterId'], 'Node'); bounded(node.x, -10000, 10000, 'Node x'); bounded(node.y, -10000, 10000, 'Node y');
      if (typeof node.label !== 'string' || node.label.length > 80) throw Error('Invalid node label'); properties(node.overrides, true);
      const resolved = resolveNode(doc, node), p = resolved.properties; properties(p);
      if ((p.failureAt === null) !== (p.recoveryAt === null) || (p.failureAt !== null && p.recoveryAt <= p.failureAt)) throw Error('Recovery must follow failure; configure both times or neither');
      if (p.outputType !== 'preserve' && !resolved.ports.out.includes(p.outputType)) throw Error('Output payload must match class output port');
      if (node.clusterId !== null && !doc.clusters.some(c => c.id === node.clusterId)) throw Error('Missing node cluster');
      if (node.clusterId !== null && SOURCES.includes(resolved.type)) throw Error('Source nodes cannot consume cluster worker slots');
    }
    for (const link of doc.links) { exact(link, ['id', 'from', 'to', 'fromPort', 'toPort', 'capacity', 'latency'], 'Link'); validateConnection(doc, link, link.id); }
    exact(doc.workload, ['seed', 'count', 'interval', 'deadline', 'payloadType', 'payloadMiB'], 'Workload');
    bounded(doc.workload.seed, 0, 4294967295, 'Seed', true); bounded(doc.workload.count, 1, 128, 'Request count', true); bounded(doc.workload.interval, 0.01, 60, 'Arrival interval'); bounded(doc.workload.deadline, 0.01, 60, 'Deadline'); bounded(doc.workload.payloadMiB, 0.001, 1024, 'Payload size');
    if (!PAYLOAD_TYPES.includes(doc.workload.payloadType)) throw Error('Unsupported workload payload');
    if (!Array.isArray(doc.assumptions) || doc.assumptions.length > 32 || doc.assumptions.some(s => typeof s !== 'string' || s.length > 1000)) throw Error('Invalid assumptions');
    if (options.execution) {
      const sources = doc.nodes.filter(n => SOURCES.includes(resolveNode(doc, n).type)); if (!sources.length) throw Error('Add a client or scheduler before running');
      const seen = new Set(); function visit(id) { if (seen.has(id)) return; seen.add(id); doc.links.filter(l => l.from === id).forEach(l => visit(l.to)); } sources.forEach(n => visit(n.id));
      if (seen.size !== doc.nodes.length) throw Error('Connect all processing nodes to a client or scheduler before running');
      if (!doc.links.length) throw Error('Connect a source to a processing node before running');
      const payloads = new Map();
      function carriedTypes(id) {
        if (payloads.has(id)) return payloads.get(id);
        const n = resolveNode(doc, id), incoming = doc.links.filter(l => l.to === id).flatMap(l => carriedTypes(l.from));
        if (incoming.some(t => !n.ports.in.includes(t))) throw Error(`Incompatible executable payload at ${n.label}: receives ${[...new Set(incoming)].join(', ')}; accepts ${n.ports.in.join(', ')}`);
        const out = n.properties.outputType === 'preserve' ? SOURCES.includes(n.type) ? [doc.workload.payloadType] : incoming : [n.properties.outputType];
        if (out.some(t => !n.ports.out.includes(t))) throw Error(`Output payload does not match ${n.label} output port`);
        payloads.set(id, [...new Set(out)]); return payloads.get(id);
      }
      doc.nodes.forEach(n => carriedTypes(n.id));
    }
    return doc;
  }
  function allocate(doc, kind) { let id; do { id = `${kind}-${doc.nextId++}`; } while ([...doc.nodes, ...doc.links, ...doc.clusters, ...doc.classes].some(n => n.id === id)); return id; }
  function addNode(doc, classId, x = 100, y = 100) { const cls = doc.classes.find(c => c.id === classId); if (!cls) throw Error('Select an existing node class'); if (doc.nodes.length >= 64) throw Error('Maximum 64 nodes'); const id = allocate(doc, 'node'); doc.nodes.push({ id, classId, label: cls.label, x, y, overrides: {}, clusterId: null }); return id; }
  function duplicate(doc, id) { const node = doc.nodes.find(n => n.id === id); if (!node) throw Error('Select a node to duplicate'); const result = addNode(doc, node.classId, node.x + 40, node.y + 80); Object.assign(doc.nodes.find(n => n.id === result), { label: `${node.label} copy`.slice(0, 80), overrides: clone(node.overrides), clusterId: node.clusterId }); return result; }
  function remove(doc, id) { doc.nodes = doc.nodes.filter(n => n.id !== id); doc.links = doc.links.filter(l => l.id !== id && l.from !== id && l.to !== id); doc.clusters = doc.clusters.filter(c => c.id !== id); doc.nodes.forEach(n => { if (n.clusterId === id) n.clusterId = null; }); }
  function connect(doc, link) { if (doc.links.length >= 128) throw Error('Maximum 128 links'); validateConnection(doc, link); const id = allocate(doc, 'link'); doc.links.push({ id, from: link.from, to: link.to, fromPort: link.fromPort, toPort: link.toPort, capacity: link.capacity, latency: link.latency }); return id; }
  function identity(doc) { let h = 2166136261; for (const c of JSON.stringify(validate(doc))) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`; }
  return Object.freeze({ SCHEMA, TYPES, SOURCES, PAYLOAD_TYPES, PROPERTY_KEYS, DEFAULT_CLASSES, ASSUMPTIONS, create, validate, resolveNode, validateConnection, addNode, duplicate, remove, connect, identity });
});
