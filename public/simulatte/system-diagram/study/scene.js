// Turns an exact authored stage graph into Excalidraw elements with stable identities, and keeps a
// learner's per-stage edits as an overlay (patches to authored elements plus their own elements).
// The authored graph is never modified: overlays are applied on top of a freshly built scene.
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./spatial-layout.js') : root.SimulatteSpatialLayout, node ? require('./spatial-routing.js') : root.SimulatteSpatialRouting, node ? require('./spatial-text.js') : root.SimulatteSpatialText, node ? require('./spatial-check.js') : root.SimulatteSpatialCheck);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteStudyScene = api;
})(globalThis, function (Spatial, Routing, Text, Checker) {
  'use strict';
  const BOX = {w: 200, h: 80}, PAD = 34, TITLE = 26, INK = 0.52;
  const FILL = {client: '#e7f5ff', service: '#ebfbee', module: '#f8f9fa', store: '#f3f0ff', log: '#fff4e6', queue: '#ffe8cc', worker: '#e6fcf5', cache: '#fff9db', directory: '#f1f3f5', external: '#ffffff'};
  const CHANGE = {added: '#1971c2', changed: '#9c36b5', merged: '#2f9e44', removed: '#adb5bd', none: '#1e1e1e'};
  const MODE_STROKE = {'request-response': 'solid', 'event-stream': 'dashed', storage: 'solid', 'local-call': 'dotted'};
  // Fields a learner can change on an element; everything else is regenerated from authored data.
  const EDITABLE = ['x', 'y', 'width', 'height', 'angle', 'strokeColor', 'backgroundColor', 'fillStyle', 'strokeWidth', 'strokeStyle', 'roughness', 'opacity', 'roundness', 'points', 'text', 'originalText', 'fontSize', 'fontFamily', 'textAlign', 'verticalAlign', 'lineHeight', 'startBinding', 'endBinding', 'boundElements', 'startArrowhead', 'endArrowhead', 'locked', 'link', 'groupIds', 'frameId', 'customData'];
  const PREFIX = 'study:';

  function hash(value) { let h = 2166136261; for (const c of value) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
    return value;
  }
  const equal = (a, b) => JSON.stringify(canonical(a ?? null)) === JSON.stringify(canonical(b ?? null));
  function wrap(text, width) {
    const lines = [];
    for (const paragraph of String(text).split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        if (line && (line + ' ' + word).length > width) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word;
      }
      lines.push(line);
    }
    return lines.join('\n');
  }
  function base(id, type, extra) {
    return {id, type, angle: 0, strokeColor: CHANGE.none, backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid', roughness: 1, opacity: 100,
      groupIds: [], frameId: null, roundness: null, seed: hash(id), version: 1, versionNonce: hash(id + ':v'), isDeleted: false, boundElements: [], updated: 1, link: null, locked: false, ...extra};
  }
  function textSize(value, size) { const lines = value.split('\n'); return {width: Math.max(1, ...lines.map(l => l.length)) * size * INK + 4, height: lines.length * size * 1.25}; }
  function text(id, value, {x, y, size, containerId = null, align = 'center', color = CHANGE.none, study}) {
    const m = Text.measure(value, size), s = {width: m.width, height: m.height};
    return base(id, 'text', {x: containerId ? x - s.width / 2 : x, y: containerId ? y - s.height / 2 : y, width: s.width, height: s.height, strokeColor: color, text: value, originalText: value,
      fontSize: size, fontFamily: Spatial.metrics.fontFamily, textAlign: align, verticalAlign: containerId ? 'middle' : 'top', containerId, lineHeight: Spatial.policy.label.lineHeight, baseline: Math.round(size * 0.9), customData: {study}});
  }
  const rect = (x, y, w, h) => ({x, y, w, h});
  const overlaps = (a, b, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

  const layout = (document, solution, graph, options) => Spatial.shapes(document, solution, graph, options);
  const routeCache = new WeakMap();

  function changesFor(before, after) {
    const prev = new Map(before.nodes.map(n => [n.id, n])), prevEdges = new Map(before.edges.map(e => [e.id, e]));
    const node = new Map(), edge = new Map();
    for (const n of after.nodes) node.set(n.id, !prev.has(n.id) ? (n.lineageIds ? 'merged' : 'added') : equal(prev.get(n.id), n) ? null : 'changed');
    for (const e of after.edges) edge.set(e.id, !prevEdges.has(e.id) ? 'added' : equal(prevEdges.get(e.id), e) ? null : 'changed');
    return {node, edge, removedNodes: before.nodes.filter(n => !node.has(n.id)), removedEdges: before.edges.filter(e => !edge.has(e.id))};
  }

  // Plain-language summary of a stage's operations, in order.
  function describe(stage, before) {
    const label = id => [...before.nodes, ...stage.graph.nodes].find(n => n.id === id)?.label || id;
    return stage.operations.map(op => {
      if (op.op === 'insert') return `Insert ${op.node.label}`;
      if (op.op === 'connect') return `Connect ${label(op.edge.from.nodeId)} → ${label(op.edge.to.nodeId)} (${op.edge.contractId}, ${op.edge.mode})`;
      if (op.op === 'disconnect') return `Disconnect ${op.edgeId}`;
      if (op.op === 'reconnect') return `Reconnect ${op.edgeId}: ${label(op.edge.from.nodeId)} → ${label(op.edge.to.nodeId)} (${op.edge.contractId}). ${op.reason}`;
      if (op.op === 'replace') return `Replace ${label(op.nodeId)} with ${op.definitionId}${op.label ? ` (${op.label})` : ''}. ${op.migration}`;
      if (op.op === 'expand') return `Expand ${label(op.nodeId)} into ${op.nodes.map(n => n.label).join(', ')}`;
      if (op.op === 'merge') return `Merge ${op.nodeIds.map(label).join(' + ')} into ${op.node.label}. ${op.reason}`;
      if (op.op === 'rebind') return `Rebind ${label(op.nodeId)} to subsystem ${op.subsystemId}. ${op.reason}`;
      return `${op.op}`;
    });
  }

  // Build the authored scene for one stage. stageIndex -1 shows the initial graph.
  function build(document, solution, stageIndex, options = {}) {
    const LABEL_SIZE=Spatial.policy.node.fontSize, EDGE_LABEL_SIZE=Spatial.policy.label.fontSize;
    const graph = stageIndex < 0 ? solution.initialGraph : solution.stages[stageIndex].graph;
    const before = stageIndex <= 0 ? (stageIndex < 0 ? graph : solution.initialGraph) : solution.stages[stageIndex - 1].graph;
    const definitions = new Map(document.components.map(c => [c.id, c])), subsystems = new Map(document.subsystems.map(s => [s.id, s]));
    const kindOf = n => (definitions.get(n.definitionId)?.extends?.id || 'core.service').replace(/^core\./, '');
    const change = stageIndex < 0 ? {node: new Map(), edge: new Map(), removedNodes: [], removedEdges: []} : changesFor(before, graph);
    const view = layout(document, solution, graph, options), {shapes, hidden} = view;
    if (!routeCache.has(graph)) routeCache.set(graph, new Map());
    const routeKey = [...view.closed].sort().join('|');
    if (!routeCache.get(graph).has(routeKey)) routeCache.get(graph).set(routeKey, Routing.route(document, graph, view));
    const routes = routeCache.get(graph).get(routeKey), spatial = Checker.check(graph, view, routes);
    if (!spatial.ok) throw Error('Unreadable stage: ' + JSON.stringify(spatial.errors));
    const scope = {problem: document.problem.referenceId, solutionId: solution.id, stageId: stageIndex < 0 ? null : solution.stages[stageIndex].id};
    const elements = [], byNode = new Map(), labels = [], issues = [];
    const add = el => { elements.push(el); return el; };
    const nodes = graph.nodes.filter(n => !hidden.has(n.id));
    // Boundaries are drawn first so boxes and arrows sit above them.
    for (const n of nodes.filter(n => shapes.get(n.id).mode === 'boundary').sort((a, b) => shapes.get(b.id).r.w * shapes.get(b.id).r.h - shapes.get(a.id).r.w * shapes.get(a.id).r.h)) {
      const {r} = shapes.get(n.id), mark = change.node.get(n.id), study = {...scope, role: 'boundary', nodeId: n.id, change: mark || null};
      const el = add(base(`${PREFIX}b:${n.id}`, 'rectangle', {x: r.x, y: r.y, width: r.w, height: r.h, strokeColor: CHANGE[mark || 'none'], strokeStyle: 'dashed', strokeWidth: 1, roundness: {type: 3}, backgroundColor: 'transparent', customData: {study}}));
      add(text(`${PREFIX}bt:${n.id}`, Text.wrap(n.label, r.w - 24, LABEL_SIZE), {x: r.x + 12, y: r.y + 8, size: LABEL_SIZE, align: 'left', color: el.strokeColor, study: {...study, role: 'boundary-label'}}));
      byNode.set(n.id, el);
    }
    for (const n of nodes.filter(n => shapes.get(n.id).mode !== 'boundary')) {
      const {r, mode} = shapes.get(n.id), kind = kindOf(n), mark = change.node.get(n.id), study = {...scope, role: 'node', nodeId: n.id, definitionId: n.definitionId, change: mark || null, mapped: mode === 'mapped'};
      const el = add(base(`${PREFIX}n:${n.id}`, 'rectangle', {x: r.x, y: r.y, width: r.w, height: r.h, backgroundColor: FILL[kind] || FILL.service,
        strokeColor: CHANGE[mark || 'none'], strokeWidth: mark ? 3 : 2, strokeStyle: kind === 'external' ? 'dashed' : 'solid', roundness: kind === 'store' ? null : {type: 3}, customData: {study}}));
      const label = add(text(`${PREFIX}nt:${n.id}`, Text.node(n.label + (n.subsystemId && mode !== 'boundary' ? ' ⊞' : '')).text, {x: r.x + r.w / 2, y: r.y + r.h / 2, size: LABEL_SIZE, containerId: el.id, color: el.strokeColor, study: {...study, role: 'node-label'}}));
      el.boundElements.push({type: 'text', id: label.id}); byNode.set(n.id, el);
    }
    for (const route of routes) {
      const e = graph.edges.find(e => e.id === route.id), from = byNode.get(route.source), to = byNode.get(route.target), mark = change.edge.get(e.id);
      const study = {...scope, role: 'edge', edgeId: e.id, contractId: e.contractId, mode: e.mode, change: mark || null, fromNodeId: e.from.nodeId, toNodeId: e.to.nodeId};
      const [sx, sy] = route.points[0], points = route.points.map(([x,y]) => [x-sx,y-sy]);
      const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),id=`${PREFIX}e:${e.id}`,color=CHANGE[mark || 'none'];
      const binding = (el, endpoint) => { const r={x:el.x,y:el.y,w:el.width,h:el.height}, vertical=endpoint.side==='left'||endpoint.side==='right'; const focus=vertical?(endpoint.point[1]-r.y-r.h/2)/(r.h/2):(endpoint.point[0]-r.x-r.w/2)/(r.w/2); return {elementId:el.id,focus:Math.max(-.9,Math.min(.9,focus)),gap:1}; };
      const el=add(base(id,'arrow',{x:sx,y:sy,width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys),points,strokeColor:color,strokeStyle:MODE_STROKE[e.mode] || 'solid',strokeWidth:e.mode==='storage'?3:2,roughness:0,roundness:null,startBinding:binding(from,route.start),endBinding:binding(to,route.end),startArrowhead:null,endArrowhead:'arrow',lastCommittedPoint:null,customData:{study}}));
      from.boundElements.push({type:'arrow',id});to.boundElements.push({type:'arrow',id});
      const label=add(text(`${id}:label`,route.label.text,{x:route.label.center[0],y:route.label.center[1],size:EDGE_LABEL_SIZE,containerId:id,color,study:{...study,role:'edge-label'}}));
      el.boundElements.push({type:'text',id:label.id});
    }
    if (options.showRemoved) for (const n of change.removedNodes) {
      const study = {...scope, role: 'removed', nodeId: n.id};
      const el = add(base(`${PREFIX}g:${n.id}`, 'rectangle', {x: n.position.x, y: n.position.y, width: BOX.w, height: BOX.h, strokeColor: CHANGE.removed, strokeStyle: 'dashed', opacity: 45, locked: true, roundness: {type: 3}, customData: {study}}));
      const t = add(text(`${PREFIX}gt:${n.id}`, wrap(`${n.label} (removed)`, 20), {x: n.position.x + BOX.w / 2, y: n.position.y + BOX.h / 2, size: LABEL_SIZE, containerId: el.id, color: CHANGE.removed, study: {...study, role: 'removed-label'}}));
      t.opacity = 45; t.locked = true; el.boundElements.push({type: 'text', id: t.id});
    }
    return {elements, issues, spatial, summary: stageIndex < 0 ? [] : describe(solution.stages[stageIndex], before), changes: change};
  }

  const isStudy = el => typeof el?.id === 'string' && el.id.startsWith(PREFIX);
  // Text size comes from font metrics and bound-text position from its container; Excalidraw recomputes
  // both (for example when the hand-drawn font finishes loading), so they are not learner edits.
  const derived = (el, field) => el.type === 'text' && (field === 'width' || field === 'height' || (el.containerId && (field === 'x' || field === 'y')));
  // Overlay = what the learner changed relative to the authored scene for this stage. Entries for
  // authored elements not in the current view (inside a collapsed subsystem) carry over from `previous`.
  function diff(authored, current, previous = null) {
    const byId = new Map(authored.map(el => [el.id, el])), currentById = new Map(current.map(el => [el.id, el])), seen = new Set(), patches = {}, removed = [], elements = [];
    for (const el of current) {
      const original = byId.get(el.id);
      if (!original) { if (!el.isDeleted) elements.push(el); continue; }
      seen.add(el.id);
      if (el.isDeleted) { removed.push(el.id); continue; }
      const patch = {};
      const oldContainer=byId.get(el.containerId),container=currentById.get(el.containerId);
      const containerChanged=oldContainer&&container&&['x','y','width','height','angle','points'].some(key=>!equal(container[key],oldContainer[key]));
      for (const field of EDITABLE) if ((!derived(el, field)||containerChanged) && !equal(el[field], original[field])) patch[field] = el[field] === undefined ? null : structuredClone(el[field]);
      if (Object.keys(patch).length) patches[el.id] = patch;
    }
    for (const id of byId.keys()) if (!seen.has(id)) removed.push(id);
    const currentIds = new Set(current.map(el => el.id));
    for (const [id, patch] of Object.entries(previous?.patches || {})) if (!byId.has(id) && !currentIds.has(id)) patches[id] = structuredClone(patch);
    for (const id of previous?.removed || []) if (!byId.has(id) && !currentIds.has(id)) removed.push(id);
    return {patches, removed: [...new Set(removed)].sort(), elements: structuredClone(elements)};
  }
  const isEmpty = overlay => !overlay || (!Object.keys(overlay.patches || {}).length && !(overlay.removed || []).length && !(overlay.elements || []).length);
  function applyOverlay(authored, overlay) {
    if (isEmpty(overlay)) return structuredClone(authored);
    const removed = new Set(overlay.removed || []), ids = new Set(authored.map(el => el.id));
    const out = authored.filter(el => !removed.has(el.id)).map(el => ({...structuredClone(el), ...structuredClone(overlay.patches?.[el.id] || {})}));
    // Bindings to authored elements that no longer exist would dangle; drop them.
    const present = new Set(out.map(el => el.id).concat((overlay.elements || []).map(el => el.id)));
    for (const el of out) {
      if (el.boundElements) el.boundElements = el.boundElements.filter(b => present.has(b.id));
      for (const side of ['startBinding', 'endBinding']) if (el[side] && !present.has(el[side].elementId)) el[side] = null;
      if (el.containerId && !present.has(el.containerId)) el.containerId = null;
    }
    // Older snapshots omitted derived label coordinates. Re-anchor labels whose
    // rectangular container moved; explicit current coordinates remain authoritative.
    const originals=new Map(authored.map(el=>[el.id,el])), restored=new Map(out.map(el=>[el.id,el]));
    for(const el of out){
      if(el.type!=='text'||!el.containerId)continue;
      const before=originals.get(el.containerId),after=restored.get(el.containerId),patch=overlay.patches?.[el.id]||{};
      if(!before||after?.type!=='rectangle')continue;
      if(!Object.hasOwn(patch,'x'))el.x+=after.x-before.x+(after.width-before.width)/2;
      if(!Object.hasOwn(patch,'y'))el.y+=after.y-before.y+(after.height-before.height)/2;
    }
    return out.concat(structuredClone(overlay.elements || []).filter(el => !ids.has(el.id)));
  }
  // Contracts a learner-drawn arrow could carry: an out-port of `fromId` and an in-port of `toId` with the
  // same contract, inside one containment scope. Otherwise explain why nothing is accepted.
  function portMatches(document, graph, fromId, toId) {
    const nodes = new Map(graph.nodes.map(n => [n.id, n])), defs = new Map(document.components.map(c => [c.id, c]));
    const a = nodes.get(fromId), b = nodes.get(toId);
    if (!a || !b) return {options: [], reason: 'Attach both ends of the arrow to components from this stage.'};
    if (a.id === b.id) return {options: [], reason: 'A connection needs two different components.'};
    if ((a.parentId || null) !== (b.parentId || null)) return {options: [], reason: `${a.label} and ${b.label} sit in different subsystems. Connect through an exposed port of the enclosing subsystem.`};
    const outs = defs.get(a.definitionId).ports.filter(p => p.direction === 'out'), ins = defs.get(b.definitionId).ports.filter(p => p.direction === 'in');
    const options = outs.flatMap(o => ins.filter(i => i.contractId === o.contractId).map(i => ({contractId: o.contractId, fromNodeId: a.id, fromPortId: o.id, toNodeId: b.id, toPortId: i.id})));
    if (options.length) return {options, reason: null};
    const names = ports => ports.map(p => p.contractId).join(', ') || 'nothing';
    return {options, reason: `${a.label} sends ${names(outs)}; ${b.label} accepts ${names(ins)}. No contract matches, so this arrow stays a sketch.`};
  }
  // A label bound to a learner's arrow, placed at its middle point.
  function labelFor(arrow, value, color) {
    const last = arrow.points[arrow.points.length - 1], mid = arrow.points.length % 2 ? arrow.points[(arrow.points.length - 1) / 2] : [last[0] / 2, last[1] / 2];
    return text(`${arrow.id}:contract`, value, {x: arrow.x + mid[0], y: arrow.y + mid[1], size: Spatial.policy.label.fontSize, containerId: arrow.id, color, study: {role: 'user-connection-label'}});
  }
  return Object.freeze({PREFIX, EDITABLE, BOX, layout, build, describe, changesFor, diff, applyOverlay, isEmpty, isStudy, wrap, portMatches, labelFor});
});
