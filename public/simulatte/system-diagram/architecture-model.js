(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory();
  if (node) module.exports = api; else root.SimulatteArchitectureModel = api;
})(globalThis, function () {
  'use strict';
  // One architecture model read by the Lucyd simulation editor and the Excalidraw study workspace.
  // Semantics (identities, typed ports, connections, containment, groups) live in `definitions` and `graph`.
  // `simulation` is an optional binding to kernels and run settings; `presentation` holds per-view layout.
  const SCHEMA = 'simulatte.architecture.v1';
  const STUDY_SCHEMA = 'simulatte.architectureStudy.v1';
  const MODES = Object.freeze(['request-response', 'event-stream', 'storage', 'local-call', 'message']);
  // Simulator ports accept any design contract; the simulator's own validator checks payload compatibility.
  const ANY_CONTRACT = '*';
  const VIEWS = Object.freeze(['lucyd', 'study']);
  const NODE_KEYS = Object.freeze(['id', 'label', 'componentId', 'componentVersion']);
  const NODE_OPTIONAL = Object.freeze(['parentId', 'boundaryId', 'lineageIds', 'groupId']);
  const EDGE_KEYS = Object.freeze(['id', 'from', 'to', 'contractId', 'mode']);
  const OPS = Object.freeze(['insert', 'remove', 'connect', 'disconnect', 'reconnect', 'replace', 'expand', 'rebind', 'merge', 'relabel', 'regroup', 'setGroups', 'move', 'bind', 'unbind']);

  const clone = value => structuredClone(value);
  const fail = message => { throw Error('Architecture model: ' + message); };
  const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const text = (value, name) => { if (typeof value !== 'string' || !value.trim()) fail(name + ' must be nonempty text'); };
  const refKey = (id, version) => id + '@' + version;

  function keys(value, required, optional, name) {
    if (!isRecord(value)) fail(name + ' must be an object');
    for (const k of required) if (!has(value, k)) fail(name + ' missing ' + k);
    for (const k of Object.keys(value)) if (!required.includes(k) && !optional.includes(k)) fail(name + ' unknown field ' + k);
  }
  function unique(rows, name) {
    if (!Array.isArray(rows)) fail(name + ' must be an array');
    const map = new Map();
    for (const row of rows) { text(row && row.id, name + ' ID'); if (map.has(row.id)) fail('duplicate ' + name + ' ' + row.id); map.set(row.id, row); }
    return map;
  }

  // Definitions resolve from the model first, then from inherited (study-level) definitions.
  function vocabulary(model, inherited) {
    const components = new Map(), contracts = new Map(), boundaries = new Map();
    for (const defs of [inherited, model.definitions].filter(Boolean)) {
      for (const c of defs.components || []) components.set(refKey(c.id, c.version), c);
      for (const c of defs.contracts || []) contracts.set(c.id, c);
      for (const b of defs.boundaries || []) boundaries.set(b.id, b);
    }
    return { components, contracts, boundaries };
  }

  function validateDefinitions(defs, name) {
    keys(defs, ['contracts', 'components', 'boundaries'], [], name);
    unique(defs.contracts, 'contract');
    for (const c of defs.components) {
      if (!isRecord(c)) fail('component must be an object');
      text(c.id, 'component ID');
      if (!Number.isInteger(c.version) || c.version < 1) fail('component version for ' + c.id);
      for (const p of c.ports || []) { keys(p, ['id', 'direction', 'contractId'], [], 'port ' + c.id); if (!['in', 'out'].includes(p.direction)) fail('port direction ' + c.id + '/' + p.id); }
    }
    const seen = new Set();
    for (const c of defs.components) { const k = refKey(c.id, c.version); if (seen.has(k)) fail('duplicate component ' + k); seen.add(k); }
    for (const b of unique(defs.boundaries, 'boundary').values()) {
      keys(b, ['id', 'componentId', 'componentVersion', 'ports'], [], 'boundary ' + b.id);
      for (const p of b.ports) { keys(p, ['id', 'direction', 'contractId', 'target'], [], 'boundary port'); keys(p.target, ['nodeId', 'portId'], [], 'boundary port target'); }
    }
  }

  function portOf(node, portId, vocab) {
    const def = vocab.components.get(refKey(node.componentId, node.componentVersion));
    if (node.boundaryId) {
      const exposed = vocab.boundaries.get(node.boundaryId).ports.find(p => p.id === portId);
      if (exposed) return exposed;
    }
    return (def.ports || []).find(p => p.id === portId);
  }

  // Structural check shared by every view: references resolve, endpoints are typed, containment is acyclic.
  function validate(model, inherited) {
    keys(model, ['schema', 'id', 'name', 'definitions', 'graph', 'simulation', 'presentation'], ['description'], 'model');
    if (model.schema !== SCHEMA) fail('unsupported schema ' + model.schema);
    text(model.id, 'model ID');
    if (typeof model.name !== 'string') fail('model name must be text');
    validateDefinitions(model.definitions, 'definitions');
    if (model.simulation !== null && !isRecord(model.simulation)) fail('simulation must be null or a binding record');
    keys(model.presentation, [], VIEWS, 'presentation');
    keys(model.graph, ['nodes', 'edges', 'groups'], [], 'graph');
    const vocab = vocabulary(model, inherited);
    const groups = unique(model.graph.groups, 'group');
    for (const g of groups.values()) { keys(g, ['id', 'label', 'kind'], ['capacity'], 'group ' + g.id); }
    const nodes = unique(model.graph.nodes, 'node');
    for (const n of nodes.values()) {
      keys(n, NODE_KEYS, NODE_OPTIONAL, 'node ' + n.id);
      if (typeof n.label !== 'string') fail('node label ' + n.id);
      if (!vocab.components.has(refKey(n.componentId, n.componentVersion))) fail('unknown component ' + refKey(n.componentId, n.componentVersion) + ' on ' + n.id);
      if (has(n, 'groupId') && n.groupId !== null && !groups.has(n.groupId)) fail('missing group ' + n.groupId);
      if (n.parentId !== undefined && !nodes.has(n.parentId)) fail('missing parent ' + n.parentId);
      const visited = new Set([n.id]);
      for (let cursor = n; cursor && cursor.parentId !== undefined; cursor = nodes.get(cursor.parentId)) { if (visited.has(cursor.parentId)) fail('containment cycle at ' + n.id); visited.add(cursor.parentId); }
      if (n.boundaryId !== undefined) {
        const b = vocab.boundaries.get(n.boundaryId);
        if (!b || b.componentId !== n.componentId) fail('invalid boundary ' + n.boundaryId + ' on ' + n.id);
        for (const q of b.ports) { const child = nodes.get(q.target.nodeId); if (!child || child.parentId !== n.id) fail('boundary binding is not a direct child: ' + q.id); }
      }
    }
    const edges = unique(model.graph.edges, 'edge');
    for (const e of edges.values()) {
      keys(e, EDGE_KEYS, ['label'], 'edge ' + e.id);
      if (!MODES.includes(e.mode)) fail('unknown edge mode ' + e.mode);
      if (!vocab.contracts.has(e.contractId)) fail('unknown contract ' + e.contractId);
      for (const [end, direction] of [[e.from, 'out'], [e.to, 'in']]) {
        keys(end, ['nodeId', 'portId'], [], 'edge endpoint ' + e.id);
        const n = nodes.get(end.nodeId);
        if (!n) fail('edge ' + e.id + ' references absent node ' + end.nodeId);
        const p = portOf(n, end.portId, vocab);
        if (!p || p.direction !== direction || (p.contractId !== e.contractId && p.contractId !== ANY_CONTRACT)) fail('incompatible ' + direction + ' endpoint ' + end.nodeId + '/' + end.portId + ' for ' + e.id);
      }
    }
    return model;
  }

  function setPosition(model, nodeId, positions) {
    for (const [view, at] of Object.entries(positions || {})) {
      if (!VIEWS.includes(view)) fail('unknown view ' + view);
      model.presentation[view] ||= { nodes: {} };
      model.presentation[view].nodes ||= {};
      model.presentation[view].nodes[nodeId] = { x: at.x, y: at.y };
    }
  }
  function dropNode(model, id) {
    for (const view of VIEWS) if (model.presentation[view]?.nodes) delete model.presentation[view].nodes[id];
    if (model.simulation?.nodes) delete model.simulation.nodes[id];
  }
  function dropEdge(model, id) { if (model.simulation?.edges) delete model.simulation.edges[id]; }

  // Shared editing commands. Each returns a new validated model; the input is never mutated.
  function apply(input, command, inherited) { return validate(step(input, command), inherited); }

  // One command without the final check. Authored stages may pass through intermediate states
  // (an expansion whose bound children arrive in a later command of the same stage), so replay
  // validates once per stage, as the study contract does.
  function step(input, command) {
    if (!isRecord(command) || !OPS.includes(command.op)) fail('unsupported command ' + (command && command.op));
    const model = clone(input), graph = model.graph;
    const node = id => graph.nodes.find(n => n.id === id);
    const need = id => node(id) || fail('command references absent node ' + id);
    const insert = n => { if (node(n.id)) fail('insert duplicate ' + n.id); graph.nodes.push(clone(n)); };
    const connect = e => { need(e.from.nodeId); need(e.to.nodeId); if (graph.edges.some(q => q.id === e.id)) fail('connect duplicate ' + e.id); graph.edges.push(clone(e)); };
    const c = command;
    switch (c.op) {
      case 'insert': insert(c.node); setPosition(model, c.node.id, c.positions); break;
      case 'remove': {
        need(c.nodeId);
        if (graph.nodes.some(n => n.parentId === c.nodeId)) fail('remove children before their boundary ' + c.nodeId);
        for (const e of graph.edges.filter(e => e.from.nodeId === c.nodeId || e.to.nodeId === c.nodeId)) dropEdge(model, e.id);
        graph.edges = graph.edges.filter(e => e.from.nodeId !== c.nodeId && e.to.nodeId !== c.nodeId);
        graph.nodes = graph.nodes.filter(n => n.id !== c.nodeId); dropNode(model, c.nodeId); break;
      }
      case 'connect': connect(c.edge); break;
      case 'disconnect': if (!graph.edges.some(e => e.id === c.edgeId)) fail('disconnect absent edge ' + c.edgeId); graph.edges = graph.edges.filter(e => e.id !== c.edgeId); dropEdge(model, c.edgeId); break;
      case 'reconnect': {
        text(c.reason, 'reconnect reason');
        if (c.edgeId !== c.edge.id) fail('reconnect must preserve edge identity');
        const i = graph.edges.findIndex(e => e.id === c.edgeId); if (i < 0) fail('reconnect absent edge ' + c.edgeId);
        need(c.edge.from.nodeId); need(c.edge.to.nodeId); graph.edges[i] = clone(c.edge); break;
      }
      case 'replace': {
        text(c.migration, 'replacement migration');
        const n = need(c.nodeId); if (n.boundaryId !== undefined) fail('replacing an expanded boundary needs a new explicit expansion');
        n.componentId = c.componentId; if (c.componentVersion !== undefined) n.componentVersion = c.componentVersion;
        if (c.label !== undefined) { text(c.label, 'replacement label'); n.label = c.label; } break;
      }
      case 'expand': {
        const parent = need(c.nodeId); if (parent.boundaryId !== undefined) fail('expand already expanded ' + c.nodeId);
        parent.boundaryId = c.boundaryId;
        for (const child of c.nodes) { insert({ ...child, parentId: c.nodeId }); }
        for (const [id, at] of Object.entries(c.positions || {})) setPosition(model, id, at);
        for (const e of c.edges) connect(e); break;
      }
      case 'rebind': text(c.reason, 'rebind reason'); { const n = need(c.nodeId); if (n.boundaryId === undefined) fail('rebind requires an expanded boundary'); n.boundaryId = c.boundaryId; } break;
      case 'merge': {
        text(c.reason, 'merge reason');
        if (!Array.isArray(c.nodeIds) || c.nodeIds.length < 2 || new Set(c.nodeIds).size !== c.nodeIds.length) fail('merge needs distinct nodes');
        const old = c.nodeIds.map(need), parents = new Set(old.map(n => n.parentId ?? null));
        if (parents.size !== 1) fail('merge containment mismatch');
        if (old.some(n => n.boundaryId !== undefined)) fail('cannot implicitly flatten a boundary');
        if ((c.node.parentId ?? null) !== [...parents][0]) fail('merge lost containment');
        if (node(c.node.id)) fail('merge identity already exists ' + c.node.id);
        const ids = new Set(c.nodeIds), moved = end => ids.has(end.nodeId) ? { ...end, nodeId: c.node.id } : end;
        for (const e of graph.edges.filter(e => ids.has(e.from.nodeId) && ids.has(e.to.nodeId))) dropEdge(model, e.id);
        graph.edges = graph.edges.filter(e => !(ids.has(e.from.nodeId) && ids.has(e.to.nodeId))).map(e => ({ ...e, from: moved(e.from), to: moved(e.to) }));
        graph.nodes = graph.nodes.filter(n => !ids.has(n.id)); for (const id of ids) dropNode(model, id);
        insert({ ...c.node, lineageIds: clone(c.nodeIds) }); setPosition(model, c.node.id, c.positions); break;
      }
      case 'relabel': { const n = need(c.nodeId); if (typeof c.label !== 'string') fail('label must be text'); n.label = c.label; break; }
      case 'regroup': { const n = need(c.nodeId); if (c.groupId === undefined) delete n.groupId; else n.groupId = c.groupId; break; }
      case 'setGroups': graph.groups = clone(c.groups); break;
      case 'move': need(c.nodeId); setPosition(model, c.nodeId, { [c.view]: { x: c.x, y: c.y } }); break;
      case 'bind': need(c.nodeId); if (!isRecord(c.binding)) fail('bind needs a binding record'); model.simulation ||= { nodes: {}, edges: {} }; model.simulation.nodes ||= {}; model.simulation.nodes[c.nodeId] = clone(c.binding); break;
      case 'unbind': need(c.nodeId); if (model.simulation?.nodes) delete model.simulation.nodes[c.nodeId]; break;
    }
    return model;
  }

  // Order-insensitive semantic comparison: replay appends while snapshots keep their authored order.
  function canonicalGraph(graph) {
    const byId = rows => [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return JSON.stringify({ nodes: byId(graph.nodes), edges: byId(graph.edges), groups: byId(graph.groups) }, (k, v) => (isRecord(v) ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v));
  }
  const sameGraph = (a, b) => canonicalGraph(a) === canonicalGraph(b);

  // Derives semantic commands that turn one snapshot into the next, for catalogues authored as snapshots.
  function diff(before, after) {
    const ops = [], prevNodes = new Map(before.nodes.map(n => [n.id, n])), nextNodes = new Map(after.nodes.map(n => [n.id, n]));
    const prevEdges = new Map(before.edges.map(e => [e.id, e])), nextEdges = new Map(after.edges.map(e => [e.id, e]));
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const removedNodes = new Set([...prevNodes.keys()].filter(id => !nextNodes.has(id)));
    const replaced = new Set([...nextNodes].filter(([id, n]) => prevNodes.has(id) && (prevNodes.get(id).componentId !== n.componentId || prevNodes.get(id).componentVersion !== n.componentVersion)).map(([id]) => id));
    const touches = e => [e.from.nodeId, e.to.nodeId].some(id => removedNodes.has(id) || replaced.has(id));
    // A changed edge on a removed or replaced node is detached first so no intermediate graph has a dangling port.
    for (const [id, e] of prevEdges) {
      const next = nextEdges.get(id);
      if (!next || (!same(e, next) && (touches(e) || touches(next)))) ops.push({ op: 'disconnect', edgeId: id });
    }
    for (const id of removedNodes) ops.push({ op: 'remove', nodeId: id });
    // Leave groups that are about to disappear before replacing the group list; join new groups after it.
    const oldGroups = new Set(before.groups.map(g => g.id)), late = [];
    for (const [id, n] of nextNodes) {
      const prev = prevNodes.get(id);
      if (!prev || ((prev.groupId ?? null) === (n.groupId ?? null) && has(prev, 'groupId') === has(n, 'groupId'))) continue;
      const op = { op: 'regroup', nodeId: id, ...(has(n, 'groupId') ? { groupId: n.groupId } : {}) };
      if (n.groupId === undefined || n.groupId === null || oldGroups.has(n.groupId)) ops.push(op); else late.push(op);
    }
    if (!same(before.groups, after.groups)) ops.push({ op: 'setGroups', groups: clone(after.groups) });
    for (const [id, n] of nextNodes) {
      const prev = prevNodes.get(id);
      if (!prev) { ops.push({ op: 'insert', node: clone(n) }); continue; }
      if (prev.componentId !== n.componentId || prev.componentVersion !== n.componentVersion) ops.push({ op: 'replace', nodeId: id, componentId: n.componentId, componentVersion: n.componentVersion, migration: 'Simulator class changed between stages' });
      if (prev.label !== n.label) ops.push({ op: 'relabel', nodeId: id, label: n.label });
    }
    ops.push(...late);
    for (const [id, e] of nextEdges) {
      const prev = prevEdges.get(id);
      if (!prev || ops.some(o => o.op === 'disconnect' && o.edgeId === id)) ops.push({ op: 'connect', edge: clone(e) });
      else if (!same(prev, e)) ops.push({ op: 'reconnect', edgeId: id, edge: clone(e), reason: 'Connection changed between stages' });
    }
    return ops;
  }

  // Replays semantic commands from a graph and refuses a stored graph that diverges.
  function replay(graph, operations, definitions, inherited) {
    let model = { schema: SCHEMA, id: 'replay', name: '', definitions, graph: clone(graph), simulation: null, presentation: {} };
    for (const op of operations) model = step(model, op);
    return validate(model, inherited).graph;
  }

  function emptyDefinitions() { return { contracts: [], components: [], boundaries: [] }; }

  return Object.freeze({ SCHEMA, STUDY_SCHEMA, MODES, VIEWS, OPS, ANY_CONTRACT, validate, apply, diff, replay, sameGraph, canonicalGraph, vocabulary, emptyDefinitions, refKey, clone });
});
