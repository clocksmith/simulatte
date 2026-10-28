(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = node ? factory(require('./architecture-model.js'), require('./diagram.js')) : factory(root.SimulatteArchitectureModel, root.SimulatteSystemDiagramDocument);
  if (node) module.exports = api; else root.SimulatteArchitectureAdapters = api;
})(globalThis, function (A, D) {
  'use strict';
  // Lossless converters between the shared architecture model and the two authored formats:
  // Lucyd simulation diagrams (systemDiagram v4/v5, lucydProblems) and Excalidraw study documents (composableStudy v2).
  const LUCYD_CONTRACT = Object.freeze({ id: 'lucyd.message', version: 1, request: { payload: 'simulator payload type' }, response: { payload: 'simulator payload type' } });
  const CLASS_PREFIX = 'class:';
  const ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
  const { clone } = A;
  const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const pick = (object, keys) => Object.fromEntries(keys.filter(k => has(object, k)).map(k => [k, clone(object[k])]));
  const omit = (object, keys) => Object.fromEntries(Object.entries(object).filter(([k]) => !keys.includes(k)).map(([k, v]) => [k, clone(v)]));
  const fail = message => { throw Error('Architecture adapter: ' + message); };

  // ---- Lucyd simulation diagrams ----

  function liftedComponent(classId, doc, library, config) {
    const klass = D.resolveClass(classId, doc, library, config);
    const ports = D.portsForNode({ classId }, doc, library, config);
    return { id: CLASS_PREFIX + classId, version: 1, label: klass.label || classId, ports: ports.map(p => ({ id: p.id, direction: p.direction, contractId: A.ANY_CONTRACT })) };
  }

  function fromSystemDiagram(doc, library, config) {
    const valid = D.validate(doc, library, config);
    const classIds = [...new Set(doc.nodes.map(n => n.classId))];
    const components = classIds.map(id => liftedComponent(id, valid, library, config));
    const model = {
      schema: A.SCHEMA, id: doc.id, name: doc.name, ...pick(doc, ['description']),
      definitions: { contracts: [clone(LUCYD_CONTRACT)], components, boundaries: [] },
      graph: {
        nodes: doc.nodes.map(n => ({ id: n.id, label: n.label, componentId: CLASS_PREFIX + n.classId, componentVersion: 1, ...pick(n, ['groupId']) })),
        edges: doc.edges.map(e => ({ id: e.id, from: clone(e.from), to: clone(e.to), contractId: LUCYD_CONTRACT.id, mode: 'message', ...pick(e, ['label']) })),
        groups: doc.groups.map(g => ({ id: g.id, label: g.label, kind: g.kind, ...pick(g, ['capacity']) })),
      },
      simulation: {
        format: doc.schema, seed: doc.seed, run: clone(doc.run), classes: clone(doc.classes), faults: clone(doc.faults),
        ...pick(doc, ['subsystems', 'intent', 'concepts']),
        nodes: Object.fromEntries(doc.nodes.map(n => [n.id, { classId: n.classId, params: clone(n.params), ...pick(n, ['overrides']) }])),
        edges: Object.fromEntries(doc.edges.map(e => [e.id, { params: clone(e.params) }])),
      },
      presentation: { lucyd: {
        nodes: Object.fromEntries(doc.nodes.map(n => [n.id, { x: n.x, y: n.y }])),
        groups: Object.fromEntries(doc.groups.map(g => [g.id, { x: g.x, y: g.y, w: g.w, h: g.h, ...pick(g, ['collapsed']) }])),
        notes: clone(doc.notes), view: clone(doc.view),
      } },
    };
    return A.validate(model);
  }

  // Bound when every node carries a simulator class binding (or a lifted class component that implies one).
  // Expanded boundaries do not execute; their exposed ports route to the bound children inside them.
  const isBoundary = (model, n) => model.graph.nodes.some(c => c.parentId === n.id);
  function unboundNodes(model) {
    const sim = model.simulation || {};
    return model.graph.nodes.filter(n => !isBoundary(model, n) && !sim.nodes?.[n.id] && !n.componentId.startsWith(CLASS_PREFIX)).map(n => n.id);
  }

  // Exact inverse of fromSystemDiagram for models whose nodes are all bound and laid out in the Lucyd view.
  function toSystemDiagram(model, library, config, inherited) {
    const unbound = unboundNodes(model);
    if (unbound.length) fail('unbound components cannot lower to a runnable diagram: ' + unbound.join(', '));
    const sim = model.simulation, view = model.presentation.lucyd || {};
    const base = D.emptyDiagram(config);
    const binding = n => sim?.nodes?.[n.id] || { classId: n.componentId.slice(CLASS_PREFIX.length), params: {} };
    const at = (n, i) => view.nodes?.[n.id] || model.presentation.study?.nodes?.[n.id] || { x: (i % 6) * config.editor.nodeWidth * 1.5, y: Math.floor(i / 6) * config.editor.nodeHeight * 2 };
    const vocab = A.vocabulary(model, inherited), lowered = model.graph.nodes.filter(n => !isBoundary(model, n));
    const end = point => {
      let { nodeId, portId } = point;
      for (let n = model.graph.nodes.find(m => m.id === nodeId); n && isBoundary(model, n); n = model.graph.nodes.find(m => m.id === nodeId)) {
        const exposed = vocab.boundaries.get(n.boundaryId)?.ports.find(p => p.id === portId);
        if (!exposed) fail('boundary ' + n.id + ' does not expose port ' + portId);
        ({ nodeId, portId } = exposed.target);
      }
      return { nodeId, portId: sim?.nodes?.[nodeId]?.ports?.[portId] ?? portId };
    };
    const doc = {
      schema: sim?.format || D.SCHEMA, id: model.id, name: model.name, ...pick(model, ['description']),
      seed: sim?.seed ?? base.seed, run: clone(sim?.run ?? base.run), classes: clone(sim?.classes ?? []),
      nodes: lowered.map((n, i) => { const b = binding(n), p = at(n, i); return { id: n.id, classId: b.classId, label: n.label, x: p.x, y: p.y, params: clone(b.params), ...pick(n, ['groupId']), ...pick(b, ['overrides']) }; }),
      edges: model.graph.edges.map(e => ({ id: e.id, from: end(e.from), to: end(e.to), params: clone(sim?.edges?.[e.id]?.params ?? {}), ...pick(e, ['label']) })),
      groups: model.graph.groups.map(g => ({ id: g.id, label: g.label, kind: g.kind, ...clone(view.groups?.[g.id] || { x: 0, y: 0, w: 320, h: 200 }), ...pick(g, ['capacity']) })),
      notes: clone(view.notes ?? []), faults: clone(sim?.faults ?? []), view: clone(view.view ?? base.view),
      ...(sim ? pick(sim, ['subsystems', 'intent', 'concepts']) : {}),
    };
    return doc;
  }

  // ---- Design-only graphs shown in the Lucyd editor ----

  // Study IDs may contain dots or exceed the simulator's 64-character identifiers, so the projection keeps a map.
  function shortId(raw, used, prefix) {
    let id = String(raw).replace(/[^A-Za-z0-9_-]/g, '-');
    if (!/^[A-Za-z]/.test(id)) id = prefix + '-' + id;
    if (!ID.test(id) || used.has(id)) {
      let h = 2166136261; for (const ch of String(raw)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
      id = id.slice(0, 50) + '-' + h.toString(16).padStart(8, '0');
    }
    used.add(id); return id;
  }

  // Projects a design graph into a v5 document whose components are unbound responsibilities.
  // Expanded boundaries draw as boundary groups around their children; nothing here can simulate until refined.
  function toDesignDiagram(model, inherited, library, config, intent) {
    const vocab = A.vocabulary(model, inherited), used = new Set(), ids = { nodes: {}, edges: {}, ports: {} };
    const base = D.emptyDiagram(config), study = model.presentation.study?.nodes || {}, lucyd = model.presentation.lucyd?.nodes || {};
    const W = config.editor.nodeWidth, H = config.editor.nodeHeight;
    for (const n of model.graph.nodes) ids.nodes[n.id] = shortId(n.id, used, 'n');
    const concepts = [], nodes = [], groups = [];
    for (const [i, n] of model.graph.nodes.entries()) {
      const def = vocab.components.get(A.refKey(n.componentId, n.componentVersion));
      const portUsed = new Set(), ports = [];
      const portRows = [...(def.ports || []), ...(n.boundaryId ? vocab.boundaries.get(n.boundaryId).ports : [])].filter((p, k, all) => all.findIndex(q => q.id === p.id) === k);
      ids.ports[n.id] = {};
      for (const p of portRows) { const pid = shortId(p.id, portUsed, 'p'); ids.ports[n.id][p.id] = pid; ports.push({ id: pid, direction: p.direction, payloadType: 'any' }); }
      const conceptId = ids.nodes[n.id];
      concepts.push({ id: conceptId, label: def.label || n.label || n.id, responsibility: def.responsibility || def.description || '', ports });
      const p = lucyd[n.id] || study[n.id] || { x: (i % 6) * W * 1.5, y: Math.floor(i / 6) * H * 2 };
      nodes.push({ id: ids.nodes[n.id], classId: 'concept.' + conceptId, label: n.label, x: p.x, y: p.y, params: {} });
    }
    for (const parent of model.graph.nodes.filter(n => model.graph.nodes.some(c => c.parentId === n.id))) {
      const kids = nodes.filter((_, i) => model.graph.nodes[i].parentId === parent.id);
      const x = Math.min(...kids.map(k => k.x)) - 20, y = Math.min(...kids.map(k => k.y)) - 40;
      const gid = shortId('g-' + parent.id, used, 'g');
      groups.push({ id: gid, label: parent.label, kind: 'boundary', x, y, w: Math.max(...kids.map(k => k.x)) + W + 20 - x, h: Math.max(...kids.map(k => k.y)) + H + 20 - y });
      for (const k of kids) k.groupId = gid;
    }
    // Study graphs may hold two contracts between the same ports; the simulator allows one edge per port pair,
    // so a repeated pair gets alias ports that map back to the same study port.
    const pairs = new Set(), conceptOf = id => concepts[model.graph.nodes.findIndex(n => n.id === id)];
    ids.aliases = {};
    const alias = (nodeId, portId, direction, n) => {
      const pid = shortId(ids.ports[nodeId][portId] + '-' + n, new Set(conceptOf(nodeId).ports.map(p => p.id)), 'p');
      conceptOf(nodeId).ports.push({ id: pid, direction, payloadType: 'any' });
      (ids.aliases[nodeId] ||= {})[pid] = portId; return pid;
    };
    const edges = model.graph.edges.map(e => {
      ids.edges[e.id] = shortId(e.id, used, 'e');
      let from = ids.ports[e.from.nodeId][e.from.portId], to = ids.ports[e.to.nodeId][e.to.portId];
      for (let n = 2; pairs.has([e.from.nodeId, from, e.to.nodeId, to].join('>')); n++) { from = alias(e.from.nodeId, e.from.portId, 'out', n); to = alias(e.to.nodeId, e.to.portId, 'in', n); }
      pairs.add([e.from.nodeId, from, e.to.nodeId, to].join('>'));
      return { id: ids.edges[e.id], from: { nodeId: ids.nodes[e.from.nodeId], portId: from }, to: { nodeId: ids.nodes[e.to.nodeId], portId: to }, params: {}, ...pick(e, ['label']) };
    });
    const diagram = { schema: D.DESIGN_SCHEMA, id: shortId(model.id, new Set(), 'd'), name: model.name, seed: base.seed, run: clone(base.run), classes: [], nodes, edges, groups, notes: [], faults: [], view: clone(base.view),
      intent: { outcome: intent?.outcome || model.name, users: intent?.users || '', constraints: intent?.constraints || '', success: intent?.success || '' }, concepts };
    return { diagram: D.validate(diagram, library, config), ids };
  }

  // Maps an edited design projection back onto the model: positions, labels and responsibility refinements.
  // New simulator nodes and connections drawn in the Lucyd editor join the model as bound class components.
  function fromDesignDiagram(diagram, ids, model, inherited, library, config) {
    const doc = D.validate(diagram, library, config), back = invert(ids.nodes), edgeBack = invert(ids.edges);
    let next = clone(model);
    const portBack = nodeId => ({ ...invert(ids.ports[nodeId] || {}), ...(ids.aliases?.[nodeId] || {}) });
    const original = new Set(Object.keys(ids.nodes));
    for (const id of [...original]) if (!doc.nodes.some(n => n.id === ids.nodes[id])) next = A.apply(next, { op: 'remove', nodeId: id }, inherited);
    for (const e of model.graph.edges) if (next.graph.edges.some(q => q.id === e.id) && !doc.edges.some(q => q.id === ids.edges[e.id])) next = A.apply(next, { op: 'disconnect', edgeId: e.id }, inherited);
    for (const n of doc.nodes) {
      const id = back[n.id];
      if (id) {
        if (next.graph.nodes.find(m => m.id === id).label !== n.label) next = A.apply(next, { op: 'relabel', nodeId: id, label: n.label }, inherited);
        next = A.apply(next, { op: 'move', nodeId: id, view: 'lucyd', x: n.x, y: n.y }, inherited);
        const concept = doc.concepts.find(c => 'concept.' + c.id === n.classId);
        if (concept?.binding) next = A.apply(next, { op: 'bind', nodeId: id, binding: { classId: concept.binding.classId, params: clone(n.params), ports: Object.fromEntries(Object.entries(concept.binding.ports).map(([cp, kp]) => [portBack(id)[cp], kp])) } }, inherited);
        continue;
      }
      if (D.isConcept(n.classId)) fail('new responsibilities need a component definition; add them in the study view: ' + n.id);
      const component = liftedComponent(n.classId, doc, library, config);
      if (!A.vocabulary(next, inherited).components.has(A.refKey(component.id, 1))) next.definitions.components.push(component);
      if (!next.definitions.contracts.some(c => c.id === LUCYD_CONTRACT.id)) next.definitions.contracts.push(clone(LUCYD_CONTRACT));
      next = A.apply(next, { op: 'insert', node: { id: n.id, label: n.label, componentId: component.id, componentVersion: 1 }, positions: { lucyd: { x: n.x, y: n.y } } }, inherited);
      next = A.apply(next, { op: 'bind', nodeId: n.id, binding: { classId: n.classId, params: clone(n.params) } }, inherited);
    }
    for (const e of doc.edges) {
      if (edgeBack[e.id]) continue;
      const end = side => { const id = back[e[side].nodeId] || e[side].nodeId; return { nodeId: id, portId: portBack(id)[e[side].portId] || e[side].portId }; };
      const from = end('from'), to = end('to'), vocab = A.vocabulary(next, inherited);
      const portOf = ({ nodeId, portId }) => { const n = next.graph.nodes.find(m => m.id === nodeId); return (vocab.components.get(A.refKey(n.componentId, n.componentVersion)).ports || []).find(p => p.id === portId); };
      const typed = [portOf(from), portOf(to)].map(p => p?.contractId).find(c => c && c !== A.ANY_CONTRACT);
      if (!typed && !next.definitions.contracts.some(c => c.id === LUCYD_CONTRACT.id)) next.definitions.contracts.push(clone(LUCYD_CONTRACT));
      next = A.apply(next, { op: 'connect', edge: { id: e.id, from, to, contractId: typed || LUCYD_CONTRACT.id, mode: typed ? 'request-response' : 'message', ...pick(e, ['label']) } }, inherited);
    }
    return next;
  }
  const invert = map => Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));

  // ---- Study documents (composableStudy v2) ----

  const semanticNode = n => ({ id: n.id, label: n.label, componentId: n.definitionId, componentVersion: n.version, ...pick(n, ['parentId', 'lineageIds']), ...(has(n, 'subsystemId') ? { boundaryId: n.subsystemId } : {}) });
  const studyNode = (n, position) => ({ id: n.id, definitionId: n.componentId, version: n.componentVersion, label: n.label, position: clone(position), ...pick(n, ['parentId', 'lineageIds']), ...(has(n, 'boundaryId') ? { subsystemId: n.boundaryId } : {}) });

  function studyModel(id, name, graph) {
    return { schema: A.SCHEMA, id, name, definitions: A.emptyDefinitions(), graph: { nodes: graph.nodes.map(semanticNode), edges: clone(graph.edges), groups: [] }, simulation: null,
      presentation: { study: { nodes: Object.fromEntries(graph.nodes.map(n => [n.id, clone(n.position)])) } } };
  }
  function studyGraph(model) {
    const at = model.presentation.study.nodes;
    return { nodes: model.graph.nodes.map(n => studyNode(n, at[n.id])), edges: clone(model.graph.edges) };
  }

  function fromStudyOperation(op) {
    switch (op.op) {
      case 'insert': return { op: 'insert', node: semanticNode(op.node), positions: { study: clone(op.node.position) } };
      case 'replace': return { op: 'replace', nodeId: op.nodeId, componentId: op.definitionId, migration: op.migration, ...pick(op, ['label']) };
      case 'expand': return { op: 'expand', nodeId: op.nodeId, boundaryId: op.subsystemId, nodes: op.nodes.map(semanticNode), positions: Object.fromEntries(op.nodes.map(n => [n.id, { study: clone(n.position) }])), edges: clone(op.edges) };
      case 'rebind': return { op: 'rebind', nodeId: op.nodeId, boundaryId: op.subsystemId, reason: op.reason };
      case 'merge': return { op: 'merge', nodeIds: clone(op.nodeIds), node: semanticNode(op.node), positions: { study: clone(op.node.position) }, reason: op.reason };
      default: return clone(op);
    }
  }
  function toStudyOperation(op) {
    switch (op.op) {
      case 'insert': return { op: 'insert', node: studyNode(op.node, op.positions.study) };
      case 'replace': return { op: 'replace', nodeId: op.nodeId, definitionId: op.componentId, migration: op.migration, ...pick(op, ['label']) };
      case 'expand': return { op: 'expand', nodeId: op.nodeId, subsystemId: op.boundaryId, nodes: op.nodes.map(n => studyNode(n, op.positions[n.id].study)), edges: clone(op.edges) };
      case 'rebind': return { op: 'rebind', nodeId: op.nodeId, subsystemId: op.boundaryId, reason: op.reason };
      case 'merge': return { op: 'merge', nodeIds: clone(op.nodeIds), node: studyNode(op.node, op.positions.study), reason: op.reason };
      default: return clone(op);
    }
  }

  function fromStudyDocument(doc, problemId) {
    const definitions = { contracts: clone(doc.contracts), components: clone(doc.components), boundaries: doc.subsystems.map(s => ({ id: s.id, componentId: s.definitionId, componentVersion: s.version, ports: clone(s.ports) })) };
    return {
      schema: A.STUDY_SCHEMA, id: problemId, definitions,
      sources: { study: omit(doc, ['contracts', 'components', 'subsystems', 'solutions']) },
      solutions: doc.solutions.map(s => ({
        id: s.id, origin: 'study', meta: omit(s, ['initialGraph', 'stages']),
        initial: studyModel(s.id + '-initial', s.title, s.initialGraph),
        stages: s.stages.map(st => ({ id: st.id, meta: omit(st, ['operations', 'graph']), operations: st.operations.map(fromStudyOperation), model: studyModel(st.id, st.title, st.graph) })),
      })),
    };
  }
  function toStudyDocument(study) {
    const src = study.sources.study;
    if (!src) fail('study has no Excalidraw source record: ' + study.id);
    const d = study.definitions;
    return { ...clone(src), contracts: clone(d.contracts), components: clone(d.components), subsystems: d.boundaries.map(b => ({ id: b.id, definitionId: b.componentId, version: b.componentVersion, ports: clone(b.ports) })),
      solutions: study.solutions.filter(s => s.origin === 'study').map(s => ({ ...clone(s.meta), initialGraph: studyGraph(s.initial), stages: s.stages.map(st => ({ ...clone(st.meta), operations: st.operations.map(toStudyOperation), graph: studyGraph(st.model) })) })) };
  }

  // ---- Lucyd problem catalogue (lucydProblems v6) ----

  function fromLucydProblem(problem, library, config) {
    return {
      schema: A.STUDY_SCHEMA, id: problem.id, definitions: A.emptyDefinitions(),
      sources: { lucyd: omit(problem, ['solutions']) },
      solutions: problem.solutions.map(s => {
        let prev = { nodes: [], edges: [], groups: [] }, prevDefs = A.emptyDefinitions();
        const stages = s.stages.map(st => {
          const model = fromSystemDiagram(st.diagram, library, config), operations = A.diff(prev, model.graph);
          prev = model.graph; const inherited = prevDefs; prevDefs = model.definitions;
          return { id: st.id, meta: omit(st, ['diagram']), operations, model, inherited };
        });
        return { id: s.id, origin: 'lucyd', meta: omit(s, ['stages', 'prelude']),
          ...(s.prelude ? { prelude: { id: s.prelude.id, meta: omit(s.prelude, ['diagram']), model: fromSystemDiagram(s.prelude.diagram, library, config) } } : {}),
          initial: null, stages: stages.map(({ inherited, ...rest }) => rest) };
      }),
    };
  }
  function toLucydProblem(study, library, config) {
    const src = study.sources.lucyd;
    if (!src) fail('study has no Lucyd source record: ' + study.id);
    return { ...clone(src), solutions: study.solutions.filter(s => s.origin === 'lucyd').map(s => ({ ...clone(s.meta),
      ...(s.prelude ? { prelude: { ...clone(s.prelude.meta), diagram: toSystemDiagram(s.prelude.model, library, config) } } : {}),
      stages: s.stages.map(st => ({ ...clone(st.meta), diagram: toSystemDiagram(st.model, library, config) })) })) };
  }

  // Both authored solution sets for one problem in one study record; each converts back to its own format.
  function mergeStudies(lucyd, study) {
    if (lucyd && study && lucyd.id !== study.id) fail('cannot merge different problems ' + lucyd.id + ' and ' + study.id);
    const base = lucyd || study;
    return { schema: A.STUDY_SCHEMA, id: base.id, definitions: clone((study || lucyd).definitions), sources: { ...clone(lucyd?.sources || {}), ...clone(study?.sources || {}) },
      solutions: [...clone(lucyd?.solutions || []), ...clone(study?.solutions || [])] };
  }

  // Replays every stage and refuses any stored graph that diverges from its commands.
  function verifyStudy(study) {
    for (const s of study.solutions) {
      let graph = s.initial ? s.initial.graph : { nodes: [], edges: [], groups: [] }, prevDefs = A.emptyDefinitions();
      for (const st of s.stages) {
        const inherited = s.origin === 'study' ? study.definitions : { contracts: [...prevDefs.contracts], components: [...prevDefs.components], boundaries: [...prevDefs.boundaries] };
        A.validate(st.model, s.origin === 'study' ? study.definitions : undefined);
        const replayed = A.replay(graph, st.operations, st.model.definitions, inherited);
        if (!A.sameGraph(replayed, st.model.graph)) fail('stage graph diverges from its commands at ' + study.id + '/' + s.id + '/' + st.id);
        graph = st.model.graph; prevDefs = st.model.definitions;
      }
    }
    return true;
  }

  return Object.freeze({ CLASS_PREFIX, LUCYD_CONTRACT, fromSystemDiagram, toSystemDiagram, unboundNodes, toDesignDiagram, fromDesignDiagram, fromStudyDocument, toStudyDocument, fromLucydProblem, toLucydProblem, mergeStudies, verifyStudy });
});
