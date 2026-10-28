// Parses and replays simulatte.composableStudy.v1 documents in the browser and in Node.
// Replay mirrors tools/simulatte/study-contract.cjs so a stage graph is accepted only when its
// ordered operations reproduce it exactly. Authored documents are never edited here.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteComposableStudy = api;
})(globalThis, function () {
  'use strict';
  const SCHEMA = 'simulatte.composableStudy.v2';
  const SCHEMAS = ['simulatte.composableStudy.v1', SCHEMA];   // v2 adds rebind and replacement labels
  const MAX_BYTES = 8 * 1024 * 1024;
  const MODES = ['request-response', 'event-stream', 'storage', 'local-call', 'message'];
  const clone = value => structuredClone(value);
  function fail(path, message) { const error = Error(`${path}: ${message}`); error.path = path; throw error; }
  function list(value, path) { if (!Array.isArray(value)) fail(path, 'expected an array'); return value; }
  function text(value, path) { if (typeof value !== 'string' || !value.trim()) fail(path, 'expected non-empty text'); }
  function indexed(rows, path) {
    const result = new Map();
    list(rows, path).forEach((row, i) => {
      if (!row || typeof row !== 'object') fail(`${path}[${i}]`, 'expected an object');
      text(row.id, `${path}[${i}].id`);
      if (result.has(row.id)) fail(path, `duplicate identity ${row.id}`);
      result.set(row.id, row);
    });
    return result;
  }
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
    return value;
  }
  const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

  // One operation, exactly as the contract validator applies it (array order included).
  function applyOperation(graph, op, path) {
    const next = clone(graph);
    const find = id => next.nodes.find(n => n.id === id);
    const need = id => find(id) || fail(path, `operation references absent node ${id}`);
    const insert = n => { if (find(n.id)) fail(path, `insert duplicate ${n.id}`); next.nodes.push(clone(n)); };
    const connect = e => {
      if (!e || typeof e !== 'object') fail(path, 'expected an edge');
      need(e.from?.nodeId); need(e.to?.nodeId);
      if (next.edges.some(q => q.id === e.id)) fail(path, `connect duplicate ${e.id}`);
      next.edges.push(clone(e));
    };
    if (!op || typeof op !== 'object') fail(path, 'expected an operation');
    switch (op.op) {
      case 'insert': insert(op.node); break;
      case 'connect': connect(op.edge); break;
      case 'disconnect':
        if (!next.edges.some(e => e.id === op.edgeId)) fail(path, `disconnect absent edge ${op.edgeId}`);
        next.edges = next.edges.filter(e => e.id !== op.edgeId); break;
      case 'reconnect':
        text(op.reason, `${path}.reason`);
        if (!op.edge || op.edgeId !== op.edge.id) fail(path, 'reconnect must preserve edge identity');
        if (!next.edges.some(e => e.id === op.edgeId)) fail(path, `reconnect absent edge ${op.edgeId}`);
        next.edges = next.edges.filter(e => e.id !== op.edgeId); connect(op.edge); break;
      case 'replace': {
        text(op.migration, `${path}.migration`);
        const n = need(op.nodeId); if (n.subsystemId) fail(path, 'replace of an expanded boundary needs a new explicit expansion');
        n.definitionId = op.definitionId;
        if (op.label !== undefined) { text(op.label, `${path}.label`); n.label = op.label; }
        break;
      }
      case 'rebind': {
        text(op.reason, `${path}.reason`);
        const n = need(op.nodeId); if (!n.subsystemId) fail(path, 'rebind requires an expanded boundary');
        n.subsystemId = op.subsystemId; break;
      }
      case 'expand': {
        const parent = need(op.nodeId); if (parent.subsystemId) fail(path, `expand already expanded ${op.nodeId}`);
        parent.subsystemId = op.subsystemId;
        for (const child of list(op.nodes, `${path}.nodes`)) insert({...child, parentId: op.nodeId});
        for (const e of list(op.edges, `${path}.edges`)) connect(e);
        break;
      }
      case 'merge': {
        text(op.reason, `${path}.reason`);
        const ids = new Set(list(op.nodeIds, `${path}.nodeIds`));
        if (ids.size < 2 || ids.size !== op.nodeIds.length) fail(path, 'merge needs distinct nodes');
        const old = op.nodeIds.map(need), parents = new Set(old.map(n => n.parentId || null));
        if (parents.size !== 1) fail(path, 'merge containment mismatch');
        if (old.some(n => n.subsystemId)) fail(path, 'cannot implicitly flatten a subsystem');
        if ((op.node?.parentId || null) !== [...parents][0]) fail(path, 'merge lost containment');
        if (find(op.node.id)) fail(path, `merge identity ${op.node.id} already exists`);
        next.edges = next.edges.filter(e => !(ids.has(e.from.nodeId) && ids.has(e.to.nodeId))).map(e => ({...e,
          from: ids.has(e.from.nodeId) ? {...e.from, nodeId: op.node.id} : e.from,
          to: ids.has(e.to.nodeId) ? {...e.to, nodeId: op.node.id} : e.to}));
        next.nodes = next.nodes.filter(n => !ids.has(n.id));
        insert({...op.node, lineageIds: clone(op.nodeIds)}); break;
      }
      default: fail(path, `unsupported operation ${String(op.op)}`);
    }
    return next;
  }
  function apply(graph, operations, path = 'operations') {
    let next = graph;
    list(operations, path).forEach((op, i) => { next = applyOperation(next, op, `${path}[${i}]`); });
    return next;
  }

  function validateGraph(graph, document, path) {
    if (!graph || typeof graph !== 'object') fail(path, 'expected an exact graph');
    const nodes = indexed(graph.nodes, `${path}.nodes`), edges = indexed(graph.edges, `${path}.edges`);
    const definitions = new Map(document.components.map(c => [c.id, c])), contracts = new Map(document.contracts.map(c => [c.id, c]));
    const portOf = (nodeId, portId) => definitions.get(nodes.get(nodeId)?.definitionId)?.ports.find(p => p.id === portId);
    for (const n of nodes.values()) {
      const d = definitions.get(n.definitionId);
      if (!d || n.version !== d.version) fail(path, `node ${n.id} has an unresolved definition/version`);
      text(n.label, `${path}.${n.id}.label`);
      if (!n.position || !Number.isFinite(n.position.x) || !Number.isFinite(n.position.y)) fail(path, `node ${n.id} needs a finite position`);
      if (n.parentId && !nodes.has(n.parentId)) fail(path, `node ${n.id} has a missing parent`);
      const visited = new Set([n.id]); let parent = n.parentId;
      while (parent) { if (visited.has(parent)) fail(path, 'cyclic containment'); visited.add(parent); parent = nodes.get(parent)?.parentId; }
      if (n.subsystemId) {
        const sub = document.subsystems.find(s => s.id === n.subsystemId);
        if (!sub || sub.definitionId !== n.definitionId) fail(path, `node ${n.id} has an unresolved subsystem`);
        for (const exposed of sub.ports) {
          const inner = portOf(exposed.target?.nodeId, exposed.target?.portId);
          if (!inner || nodes.get(exposed.target.nodeId).parentId !== n.id || inner.direction !== exposed.direction || inner.contractId !== exposed.contractId) fail(path, `subsystem ${sub.id} has an invalid exposed-port mapping ${exposed.id}`);
        }
      }
    }
    for (const edge of edges.values()) {
      if (!contracts.has(edge.contractId)) fail(path, `edge ${edge.id} has an unresolved contract`);
      if (!MODES.includes(edge.mode)) fail(path, `edge ${edge.id} has unknown mode ${edge.mode}`);
      for (const [side, direction] of [['from', 'out'], ['to', 'in']]) {
        const endpoint = edge[side], port = portOf(endpoint?.nodeId, endpoint?.portId);
        if (!port || port.direction !== direction || port.contractId !== edge.contractId) fail(path, `edge ${edge.id}.${side} does not match its typed port/contract`);
      }
      if ((nodes.get(edge.from.nodeId).parentId || null) !== (nodes.get(edge.to.nodeId).parentId || null)) fail(path, `edge ${edge.id} crosses a subsystem boundary without exposed ports`);
    }
    return graph;
  }

  function validate(document) {
    if (!document || !SCHEMAS.includes(document.schema) || document.version !== 1) fail('schema', `expected ${SCHEMAS.join(' or ')}, version 1`);
    text(document.problem?.referenceId, 'problem.referenceId');
    text(document.problem?.studyLabel, 'problem.studyLabel');
    text(document.problem?.scope, 'problem.scope');
    const contracts = indexed(document.contracts, 'contracts'), components = indexed(document.components, 'components');
    indexed(document.subsystems, 'subsystems'); indexed(document.references, 'references'); indexed(document.problem.requirements, 'problem.requirements');
    for (const c of contracts.values()) if (!Number.isInteger(c.version) || c.version < 1 || !c.request || !c.response) fail(`contracts.${c.id}`, 'expected versioned request and response shapes');
    for (const c of components.values()) {
      if (!Number.isInteger(c.version) || c.version < 1) fail(`components.${c.id}`, 'missing version');
      text(c.responsibility, `components.${c.id}.responsibility`);
      list(c.stateOwnership, `components.${c.id}.stateOwnership`);
      for (const p of indexed(c.ports, `components.${c.id}.ports`).values()) if (!['in', 'out'].includes(p.direction) || !contracts.has(p.contractId)) fail(`components.${c.id}.ports.${p.id}`, 'unresolved direction or contract');
    }
    const solutions = indexed(document.solutions, 'solutions');
    if (!solutions.size) fail('solutions', 'no authored approaches');
    for (const s of solutions.values()) {
      text(s.title, `solutions.${s.id}.title`);
      const checks = indexed(s.acceptanceCases, `solutions.${s.id}.acceptanceCases`);
      let graph = validateGraph(s.initialGraph, document, `${s.id}.initialGraph`);
      const stages = indexed(s.stages, `${s.id}.stages`);
      if (!stages.size) fail(s.id, 'no authored stages');
      for (const stage of stages.values()) {
        const path = `${s.id}.${stage.id}`;
        text(stage.title, `${path}.title`); text(stage.reason, `${path}.reason`);
        list(stage.checkIds, `${path}.checkIds`).forEach(id => { if (!checks.has(id)) fail(path, `missing correctness check ${id}`); });
        if (document.schema !== SCHEMA) stage.operations.forEach((op, i) => { if (op?.op === 'rebind' || (op?.op === 'replace' && op.label !== undefined)) fail(`${path}.operations[${i}]`, `${op.op === 'rebind' ? 'rebind' : 'a replacement label'} requires ${SCHEMA}`); });
        graph = apply(graph, stage.operations, `${path}.operations`);
        validateGraph(graph, document, path);
        if (!same(graph, stage.graph)) fail(path, 'supplied stage graph differs from replayed operations');
      }
    }
    return document;
  }
  function parse(raw) {
    if (typeof raw !== 'string') fail('file', 'expected JSON text');
    if (new TextEncoder().encode(raw).length > MAX_BYTES) fail('file', 'import exceeds 8 MB');
    let value; try { value = JSON.parse(raw); } catch (error) { fail('file', `not JSON (${error.message})`); }
    return validate(value);
  }
  function serialize(document) { validate(document); return JSON.stringify(document, null, 2) + '\n'; }
  // Graph before a stage: the initial graph for stage 1, otherwise the previous stage's exact graph.
  function previousGraph(solution, stageIndex) { return stageIndex === 0 ? solution.initialGraph : solution.stages[stageIndex - 1].graph; }
  function difference(before, after) {
    const out = {};
    for (const kind of ['nodes', 'edges']) {
      const a = new Map(before[kind].map(x => [x.id, x])), b = new Map(after[kind].map(x => [x.id, x]));
      out[kind] = {added: [...b.keys()].filter(id => !a.has(id)), removed: [...a.keys()].filter(id => !b.has(id)), changed: [...b.keys()].filter(id => a.has(id) && !same(a.get(id), b.get(id)))};
    }
    return out;
  }
  return Object.freeze({SCHEMA, SCHEMAS, MAX_BYTES, MODES, clone, same, canonical, applyOperation, apply, validateGraph, validate, parse, serialize, previousGraph, difference});
});
