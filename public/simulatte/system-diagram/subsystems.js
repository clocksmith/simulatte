(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteSystemDiagramSubsystems = api;
})(globalThis, function () {
  'use strict';
  const SCHEMA = 'simulatte.systemDiagram.v4';
  const REF = /^subsystem\.([A-Za-z][A-Za-z0-9_-]{0,47})@([1-9][0-9]*)$/;
  const ID = /^[A-Za-z][A-Za-z0-9_-]{0,47}$/;
  const MAX_DEPTH = 8, MAX_DEFINITIONS = 100;
  const collections = ['nodes', 'edges', 'groups', 'notes', 'faults'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const fail = message => { throw Error(`system-diagram subsystem: ${message}`); };
  const isComposite = id => typeof id === 'string' && id.startsWith('subsystem.');
  const ref = def => `subsystem.${def.id}@${def.version}`;
  function definition(doc, classId) {
    const match = REF.exec(classId);
    if (!match || !Number.isSafeInteger(Number(match[2]))) fail(`invalid pinned reference ${classId}`);
    const found = (doc.subsystems || []).find(d => d.id === match[1] && d.version === Number(match[2]));
    if (!found) fail(`missing definition ${classId}`);
    return found;
  }
  function keys(value, required, optional, path) {
    if (!record(value)) fail(`${path} must be an object`);
    for (const key of required) if (!Object.hasOwn(value, key)) fail(`${path}.${key} is required`);
    for (const key of Object.keys(value)) if (![...required, ...optional].includes(key)) fail(`${path}.${key} is not supported`);
  }
  function graphDocument(doc, def) {
    const result = { ...doc, schema: SCHEMA };delete result.intent;delete result.concepts;
    for (const key of collections) result[key] = def[key];
    return result;
  }
  function checkGraph(doc, def, stack = [], memo = new Map()) {
    const key = ref(def);
    if (stack.includes(key)) fail(`recursive definition cycle: ${[...stack, key].join(' -> ')}`);
    if (memo.has(key)) return memo.get(key);
    let depth = 1;
    for (const node of def.nodes) if (isComposite(node.classId)) depth = Math.max(depth, 1 + checkGraph(doc, definition(doc, node.classId), [...stack, key], memo));
    if (depth > MAX_DEPTH) fail(`nesting depth exceeds ${MAX_DEPTH}`);
    memo.set(key, depth); return depth;
  }
  function target(doc, graph, endpoint, library, config, D, stack = []) {
    const node = graph.nodes.find(n => n.id === endpoint.nodeId);
    if (!node) fail(`port targets missing node ${endpoint.nodeId}`);
    if (isComposite(node.classId)) {
      const def = definition(doc, node.classId), key = ref(def);
      if (stack.includes(key) || stack.length >= MAX_DEPTH) fail('cyclic or excessively deep port mapping');
      const port = def.ports.find(p => p.id === endpoint.portId);
      if (!port) fail(`missing external port ${key}.${endpoint.portId}`);
      return target(doc, def, port.target, library, config, D, [...stack, key]);
    }
    const resolved = D.resolveNodeParams(node, doc, library, config);
    const port = library.kernels[resolved.klass.kernel].ports.find(p => p.id === endpoint.portId);
    if (!port) fail(`missing primitive port ${node.id}.${endpoint.portId}`);
    return { node, port, values: resolved.values };
  }
  function resolveClass(classId, doc, library, config, D) {
    const def = definition(doc, classId);
    const ports = def.ports.map(p => {
      const t = target(doc, def, p.target, library, config, D);
      if (t.port.direction !== p.direction) fail(`port ${classId}.${p.id} direction disagrees with its target`);
      const spec = { ...t.port, id: p.id, label: p.label };
      if (spec.emits) spec.emits = spec.emits.map(v => v.startsWith('param:') ? t.values[v.slice(6)] : v);
      return spec;
    });
    return { id: classId, label: def.label, category: 'application', glyph: 'service', description: `Reusable subsystem ${def.id}, pinned version ${def.version}.`, builtin: false, builtinId: null, kernel: 'subsystem', chain: [classId], defaults: {}, sources: {}, ports };
  }
  function validateDefinitions(doc, library, config, D) {
    if (!Object.hasOwn(doc, 'subsystems')) {
      if (doc.nodes?.some(n => isComposite(n.classId))) fail('subsystems registry is required');
      return;
    }
    if (![SCHEMA,'simulatte.systemDiagram.v5'].includes(doc.schema) || !Array.isArray(doc.subsystems) || doc.subsystems.length > MAX_DEFINITIONS) fail(`v4 subsystems must be an array of at most ${MAX_DEFINITIONS} definitions`);
    const seen = new Set();
    for (const def of doc.subsystems) {
      keys(def, ['id', 'version', 'label', ...collections, 'ports'], [], 'definition');
      if (typeof def.id !== 'string' || !ID.test(def.id) || !Number.isSafeInteger(def.version) || def.version < 1) fail('definition needs an identifier and positive integer version');
      if (seen.has(ref(def))) fail(`duplicate definition ${ref(def)}`);
      seen.add(ref(def));
      D.label('subsystem.label', def.label, config.bounds.maxLabelLength);
      for (const key of collections) if (!Array.isArray(def[key])) fail(`definition.${key} must be an array`);
      for (const node of def.nodes) if (!isComposite(node.classId) && !library.classes[node.classId]) fail('definition primitives must pin a built-in class and resolved parameters, not mutable user classes');
      if (!Array.isArray(def.ports) || def.ports.length > config.bounds.maxEdges) fail('definition.ports must be a bounded array');
      const ports = new Set(), targets = new Set();
      for (const p of def.ports) {
        keys(p, ['id', 'label', 'direction', 'target'], [], 'port');
        keys(p.target, ['nodeId', 'portId'], [], 'port.target');
        if (typeof p.id !== 'string' || !ID.test(p.id) || ports.has(p.id)) fail('external port identifiers must be valid and unique');
        ports.add(p.id); D.label('port.label', p.label, config.bounds.maxLabelLength);
        if (!['in', 'out'].includes(p.direction)) fail('external port direction must be in or out');
        const mapped = `${p.target.nodeId}.${p.target.portId}`;
        if (targets.has(mapped)) fail(`duplicate external alias for ${mapped}`);
        targets.add(mapped);
      }
    }
    const depths = new Map();
    for (const def of doc.subsystems) checkGraph(doc, def, [], depths);
    for (const def of doc.subsystems) {
      resolveClass(ref(def), doc, library, config, D);
      D.validate(graphDocument(doc, def), library, config, true);
      // Validate expanded cardinality, parameter overrides and bounds even for unused definitions.
      D.validate(lower(graphDocument(doc, def), library, config, D), library, config, true);
    }
  }
  function primitiveAt(doc, def, path) {
    const parts = path.split('/');
    if (!parts.length || parts.length > MAX_DEPTH + 1) fail(`invalid override path ${path}`);
    let graph = def, node;
    for (let i = 0; i < parts.length; i++) {
      node = graph.nodes.find(n => n.id === parts[i]);
      if (!node) fail(`override path ${path} does not exist`);
      if (i < parts.length - 1) {
        if (!isComposite(node.classId)) fail(`override path ${path} crosses a primitive`);
        graph = definition(doc, node.classId);
      }
    }
    if (isComposite(node.classId)) fail(`override ${path} must target primitive parameters`);
    return node;
  }
  function validateOverrides(node, doc, library, config, D) {
    const overrides = node.overrides === undefined ? {} : node.overrides;
    if (!record(overrides) || Object.keys(overrides).length > config.bounds.maxNodes) fail('instance overrides must be a bounded object');
    const def = definition(doc, node.classId);
    const group = doc.groups.find(g => g.id === node.groupId);
    if (group && group.kind !== 'boundary') fail('subsystem instances support boundary groups only; author resource and failure-domain groups inside definitions');
    for (const [path, params] of Object.entries(overrides)) {
      const leaf = primitiveAt(doc, def, path), cls = D.resolveClass(leaf.classId, doc, library, config);
      D.validateParams(`subsystem ${node.id}.overrides.${path}`, params, library.kernels[cls.kernel].params);
    }
  }
  function lower(doc, library, config, D) {
    if (!doc.nodes.some(n => isComposite(n.classId))) { const flat = clone(doc); delete flat.subsystems; return flat; }
    const output = clone(doc); delete output.subsystems;
    for (const key of collections) output[key] = [];
    const instances = []; let expandedInstances = 0;
    const rows = [], endpoints = new Map(), reserved = new Set(collections.filter(k => k !== 'notes').flatMap(k => doc[k].map(r => r.id)));
    const keyFor = (path, id) => JSON.stringify([...path, id]);
    function visit(graph, path, inheritedGroup, overrides, depth) {
      if (depth > MAX_DEPTH) fail(`nesting depth exceeds ${MAX_DEPTH}`);
      const local = new Map();
      for (const n of graph.nodes) {
        const key = keyFor(path, n.id); local.set(n.id, key);
        if (isComposite(n.classId)) {
          if (++expandedInstances > config.bounds.maxNodes) fail(`expanded instances exceed ${config.bounds.maxNodes}`);
          instances.push({ path: [...path, n.id], classId: n.classId, overrides: clone(n.overrides || {}) });
          const def = definition(doc, n.classId), next = { ...(n.overrides || {}) };
          for (const [p, params] of Object.entries(overrides)) if (p.startsWith(`${n.id}/`)) next[p.slice(n.id.length + 1)] = { ...(next[p.slice(n.id.length + 1)] || {}), ...params };
          const child = visit(def, [...path, n.id], n.groupId ? keyFor(path, n.groupId) : inheritedGroup, next, depth + 1);
          for (const p of def.ports) endpoints.set(`${key}.${p.id}`, child(p.target));
        } else {
          const row = clone(n); row.params = { ...row.params, ...(overrides[n.id] || {}) }; delete row.overrides;
          const group = row.groupId ? keyFor(path, row.groupId) : inheritedGroup;
          rows.push({ kind: 'nodes', key, path, row, group });
          for (const p of D.portsForNode(n, doc, library, config)) endpoints.set(`${key}.${p.id}`, { key, portId: p.id });
        }
        if (rows.filter(r => r.kind === 'nodes').length > config.bounds.maxNodes) fail(`expanded nodes exceed ${config.bounds.maxNodes}`);
      }
      const endpoint = end => {
        const value = endpoints.get(`${local.get(end.nodeId)}.${end.portId}`);
        if (!value) fail(`cannot lower endpoint ${end.nodeId}.${end.portId}`);
        return value;
      };
      for (const kind of ['groups', 'notes', 'edges', 'faults']) for (const row of graph[kind]) {
        const entry = { kind, key: keyFor(path, row.id), path, row: clone(row) };
        if (kind === 'edges') { entry.from = endpoint(row.from); entry.to = endpoint(row.to); }
        if (kind === 'faults') entry.target = keyFor(path, row.target.id);
        rows.push(entry);
        const bound = config.bounds[`max${kind[0].toUpperCase()}${kind.slice(1)}`];
        if (rows.filter(r => r.kind === kind).length > bound) fail(`expanded ${kind} exceed ${bound}`);
      }
      return endpoint;
    }
    visit(doc, [], null, {}, 0);
    const ids = new Map();
    // Path-derived executable identifiers never depend on annotation count or array order.
    function stableId(entry) {
      const text = `${entry.kind}:${entry.key}`; let a = 2166136261, b = 5381;
      for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
      return `sub-${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
    }
    const sorted = [...rows].sort((a, b) => Number(a.kind === 'notes') - Number(b.kind === 'notes') || a.key.localeCompare(b.key));
    for (const entry of sorted) {
      let id = entry.row.id;
      if (entry.path.length || (entry.kind === 'notes' && reserved.has(id))) {
        const base = stableId(entry); id = base; let collision = 0;
        while (reserved.has(id)) id = `${base}-${++collision}`;
      }
      reserved.add(id); ids.set(entry.key, id);
    }
    for (const entry of rows) {
      const row = entry.row; row.id = ids.get(entry.key);
      if (entry.kind === 'nodes') { if (entry.group) row.groupId = ids.get(entry.group); else delete row.groupId; }
      if (entry.kind === 'edges') for (const side of ['from', 'to']) row[side] = { nodeId: ids.get(entry[side].key), portId: entry[side].portId };
      if (entry.kind === 'faults') row.target.id = ids.get(entry.target);
      output[entry.kind].push(row);
    }
    Object.defineProperty(output, 'composition', { value: { schema: 'simulatte.systemDiagramComposition.v1', instances, mapping: rows.filter(e => e.kind !== 'notes').map(e => ({ id: ids.get(e.key), path: JSON.parse(e.key), kind: e.kind })) } });
    return output;
  }
  function pinParameters(doc, def, library, config, D) {
    for (const node of def.nodes) if (!isComposite(node.classId)) {
      const resolved = D.resolveNodeParams(node, doc, library, config);
      node.classId = resolved.klass.builtinId;
      node.params = clone(resolved.values);
    }
    return def;
  }
  function capture(input, nodeIds, options, library, config, D) {
    const doc = clone(input), selected = new Set(nodeIds);
    if (!selected.size || [...selected].some(id => !doc.nodes.some(n => n.id === id))) fail('capture requires existing selected nodes');
    const id = options.id, label = options.label;
    if ((doc.subsystems || []).some(d => d.id === id)) fail(`definition ${id} already exists; publish a new version instead`);
    const def = { id, version: 1, label, nodes: [], edges: [], groups: [], notes: [], faults: [], ports: [] };
    const groups = new Set();
    for (const g of doc.groups) {
      const members = doc.nodes.filter(n => n.groupId === g.id);
      if (members.length && members.every(n => selected.has(n.id))) { groups.add(g.id); def.groups.push(clone(g)); }
      else if (g.kind !== 'boundary' && members.some(n => selected.has(n.id))) fail(`capture must include every member of ${g.kind} group ${g.id}`);
    }
    def.nodes = doc.nodes.filter(n => selected.has(n.id)).map(n => { const copy = clone(n); if (!groups.has(copy.groupId)) delete copy.groupId; return copy; });
    const internal = new Set(doc.edges.filter(e => selected.has(e.from.nodeId) && selected.has(e.to.nodeId)).map(e => e.id));
    def.edges = doc.edges.filter(e => internal.has(e.id));
    const instanceId = D.newId(doc, 'subsystem');
    const portMap = new Map();
    // Expose every primitive/composite port, including currently unconnected ports, for later reuse.
    for (const n of def.nodes) for (const p of D.portsForNode(n, doc, library, config)) {
      const pid = `port-${def.ports.length + 1}`;
      def.ports.push({ id: pid, label: `${n.label || n.id}: ${p.label}`.slice(0, config.bounds.maxLabelLength), direction: p.direction, target: { nodeId: n.id, portId: p.id } });
      portMap.set(`${n.id}.${p.id}`, pid);
    }
    const moved = new Set([...selected, ...internal, ...groups]);
    def.faults = doc.faults.filter(f => moved.has(f.target.id));
    doc.faults = doc.faults.filter(f => !moved.has(f.target.id));
    doc.nodes = doc.nodes.filter(n => !selected.has(n.id)); doc.groups = doc.groups.filter(g => !groups.has(g.id));
    doc.edges = doc.edges.filter(e => !internal.has(e.id)).map(e => { for (const side of ['from', 'to']) if (selected.has(e[side].nodeId)) e[side] = { nodeId: instanceId, portId: portMap.get(`${e[side].nodeId}.${e[side].portId}`) }; return e; });
    doc.nodes.push({ id: instanceId, classId: ref(def), label, x: Math.min(...def.nodes.map(n => n.x)), y: Math.min(...def.nodes.map(n => n.y)), params: {}, overrides: {} });
    pinParameters(doc, def, library, config, D);
    doc.schema = SCHEMA; (doc.subsystems ||= []).push(def);
    return { diagram: D.validate(doc, library, config), definition: clone(def), instanceId };
  }
  function insert(input, id, version, options, library, config, D) {
    const doc = clone(input), def = definition(doc, `subsystem.${id}@${version}`), instanceId = D.newId(doc, 'subsystem');
    if (doc.schema !== D.DESIGN_SCHEMA) doc.schema = SCHEMA;
    doc.nodes.push({ id: instanceId, classId: ref(def), label: options.label ?? def.label, x: options.x, y: options.y, params: {}, overrides: {} });
    return { diagram: D.validate(doc, library, config), instanceId };
  }
  function publish(input, candidate, library, config, D) {
    const doc = clone(input), def = clone(candidate);
    const latest = Math.max(0, ...(doc.subsystems || []).filter(d => d.id === def.id).map(d => d.version));
    if (def.version !== latest + 1) fail(`publish requires version ${latest + 1}; existing versions are immutable`);
    pinParameters(doc, def, library, config, D);
    doc.schema = SCHEMA; (doc.subsystems ||= []).push(def);
    return { diagram: D.validate(doc, library, config), definition: clone(def) };
  }
  function upgrade(input, nodeId, version, library, config, D) {
    const doc = clone(input), node = doc.nodes.find(n => n.id === nodeId);
    if (!node || !isComposite(node.classId)) fail('upgrade requires a subsystem instance');
    const old = definition(doc, node.classId), next = definition(doc, `subsystem.${old.id}@${version}`);
    if (version <= old.version) fail('upgrade requires a newer published version');
    node.classId = ref(next);
    return { diagram: D.validate(doc, library, config) };
  }
  return Object.freeze({ isComposite, definition, resolveClass, validateDefinitions, validateOverrides, lower, capture, insert, publish, upgrade });
});
