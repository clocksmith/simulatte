// Turns an exact authored stage graph into Excalidraw elements with stable identities, and keeps a
// learner's per-stage edits as an overlay (patches to authored elements plus their own elements).
// The authored graph is never modified: overlays are applied on top of a freshly built scene.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteStudyScene = api;
})(globalThis, function () {
  'use strict';
  const BOX = {w: 200, h: 80}, PAD = 34, TITLE = 26, LABEL_SIZE = 16, EDGE_LABEL_SIZE = 14, INK = 0.52;
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
    const s = textSize(value, size);
    return base(id, 'text', {x: containerId ? x - s.width / 2 : x, y: containerId ? y - s.height / 2 : y, width: s.width, height: s.height, strokeColor: color, text: value, originalText: value,
      fontSize: size, fontFamily: 1, textAlign: align, verticalAlign: containerId ? 'middle' : 'top', containerId, lineHeight: 1.25, baseline: Math.round(size * 0.9), customData: {study}});
  }
  const rect = (x, y, w, h) => ({x, y, w, h});
  const overlaps = (a, b, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

  // Which nodes are drawn, and how: a box, an enclosing boundary, or hidden inside a collapsed parent.
  function layout(graph, {collapsed = []} = {}) {
    const nodes = new Map(graph.nodes.map(n => [n.id, n])), children = new Map();
    for (const n of graph.nodes) if (n.parentId) { if (!children.has(n.parentId)) children.set(n.parentId, []); children.get(n.parentId).push(n.id); }
    const closed = new Set(collapsed.filter(id => nodes.get(id)?.subsystemId));
    const hidden = new Set();
    const hide = id => { for (const c of children.get(id) || []) { hidden.add(c); hide(c); } };
    for (const id of closed) hide(id);
    const descendants = id => (children.get(id) || []).flatMap(c => [c, ...descendants(c)]);
    const shapes = new Map();
    const box = n => rect(n.position.x, n.position.y, BOX.w, BOX.h);
    // Children first so nested boundaries enclose their own boundaries.
    const depth = id => { let d = 0, p = nodes.get(id).parentId; while (p) { d++; p = nodes.get(p).parentId; } return d; };
    const order = graph.nodes.filter(n => !hidden.has(n.id)).sort((a, b) => depth(b.id) - depth(a.id));
    for (const n of order) {
      const kids = (children.get(n.id) || []).filter(c => !hidden.has(c));
      if (!n.subsystemId || closed.has(n.id) || !kids.length) { shapes.set(n.id, {mode: 'box', r: box(n)}); continue; }
      const inner = kids.map(c => shapes.get(c).r);
      const x0 = Math.min(...inner.map(r => r.x)) - PAD, y0 = Math.min(...inner.map(r => r.y)) - PAD - TITLE;
      const x1 = Math.max(...inner.map(r => r.x + r.w)) + PAD, y1 = Math.max(...inner.map(r => r.y + r.h)) + PAD;
      shapes.set(n.id, {mode: 'boundary', r: rect(x0, y0, x1 - x0, y1 - y0)});
    }
    // A boundary that would visually swallow an unrelated node is misleading; draw a mapped box instead.
    for (const n of order) {
      const s = shapes.get(n.id); if (s.mode !== 'boundary') continue;
      const own = new Set([n.id, ...descendants(n.id)]);
      let ancestor = n.parentId; while (ancestor) { own.add(ancestor); ancestor = nodes.get(ancestor).parentId; }
      if ([...shapes].some(([id, other]) => !own.has(id) && overlaps(s.r, other.r, 4))) shapes.set(n.id, {mode: 'mapped', r: box(n)});
    }
    return {shapes, hidden, children, closed};
  }

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
    const graph = stageIndex < 0 ? solution.initialGraph : solution.stages[stageIndex].graph;
    const before = stageIndex <= 0 ? (stageIndex < 0 ? graph : solution.initialGraph) : solution.stages[stageIndex - 1].graph;
    const definitions = new Map(document.components.map(c => [c.id, c])), subsystems = new Map(document.subsystems.map(s => [s.id, s]));
    const kindOf = n => (definitions.get(n.definitionId)?.extends?.id || 'core.service').replace(/^core\./, '');
    const change = stageIndex < 0 ? {node: new Map(), edge: new Map(), removedNodes: [], removedEdges: []} : changesFor(before, graph);
    const {shapes, hidden} = layout(graph, options);
    const scope = {problem: document.problem.referenceId, solutionId: solution.id, stageId: stageIndex < 0 ? null : solution.stages[stageIndex].id};
    const elements = [], byNode = new Map(), labels = [], issues = [];
    const add = el => { elements.push(el); return el; };
    const nodes = graph.nodes.filter(n => !hidden.has(n.id));
    // Boundaries are drawn first so boxes and arrows sit above them.
    for (const n of nodes.filter(n => shapes.get(n.id).mode === 'boundary').sort((a, b) => shapes.get(b.id).r.w * shapes.get(b.id).r.h - shapes.get(a.id).r.w * shapes.get(a.id).r.h)) {
      const {r} = shapes.get(n.id), mark = change.node.get(n.id), study = {...scope, role: 'boundary', nodeId: n.id, change: mark || null};
      const el = add(base(`${PREFIX}b:${n.id}`, 'rectangle', {x: r.x, y: r.y, width: r.w, height: r.h, strokeColor: CHANGE[mark || 'none'], strokeStyle: 'dashed', strokeWidth: 1, roundness: {type: 3}, backgroundColor: 'transparent', customData: {study}}));
      add(text(`${PREFIX}bt:${n.id}`, n.label, {x: r.x + 12, y: r.y + 8, size: LABEL_SIZE, align: 'left', color: el.strokeColor, study: {...study, role: 'boundary-label'}}));
      byNode.set(n.id, el);
    }
    for (const n of nodes.filter(n => shapes.get(n.id).mode !== 'boundary')) {
      const {r, mode} = shapes.get(n.id), kind = kindOf(n), mark = change.node.get(n.id), study = {...scope, role: 'node', nodeId: n.id, definitionId: n.definitionId, change: mark || null, mapped: mode === 'mapped'};
      const el = add(base(`${PREFIX}n:${n.id}`, kind === 'store' ? 'ellipse' : 'rectangle', {x: r.x, y: r.y, width: r.w, height: r.h, backgroundColor: FILL[kind] || FILL.service,
        strokeColor: CHANGE[mark || 'none'], strokeWidth: mark ? 3 : 2, strokeStyle: kind === 'external' ? 'dashed' : 'solid', roundness: kind === 'store' ? null : {type: 3}, customData: {study}}));
      const label = add(text(`${PREFIX}nt:${n.id}`, wrap(n.label + (n.subsystemId && mode !== 'boundary' ? ' ⊞' : ''), 20), {x: r.x + r.w / 2, y: r.y + r.h / 2, size: LABEL_SIZE, containerId: el.id, color: el.strokeColor, study: {...study, role: 'node-label'}}));
      el.boundElements.push({type: 'text', id: label.id}); byNode.set(n.id, el);
    }
    const nodeRects = [...byNode.values()].filter(el => el.customData.study.role === 'node').map(el => ({id: el.customData.study.nodeId, ...rect(el.x, el.y, el.width, el.height)}));
    const arrow = ({id, from, to, p0: [sx, sy], p1: [ex, ey], label, stroke, color, width, study, head}) => {
      let points = [[0, 0], [ex - sx, ey - sy]], mid = [(sx + ex) / 2, (sy + ey) / 2];
      if (label) {   // slide the label along the arrow until it clears other labels and boxes
        const s = textSize(label, EDGE_LABEL_SIZE), at = f => rect(sx + (ex - sx) * f - s.width / 2, sy + (ey - sy) * f - s.height / 2, s.width, s.height);
        const free = f => !labels.some(l => overlaps(l, at(f), 3)) && !nodeRects.some(b => overlaps(b, at(f)));
        const f = [0.5, 0.38, 0.62, 0.28, 0.72].find(free);
        if (f === undefined) issues.push(`label of ${id} overlaps`);
        const t = f ?? 0.5; labels.push(at(t));
        if (t !== 0.5) { mid = [sx + (ex - sx) * t, sy + (ey - sy) * t]; points = [[0, 0], [mid[0] - sx, mid[1] - sy], [ex - sx, ey - sy]]; }
      }
      const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
      const el = add(base(id, 'arrow', {x: sx, y: sy, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), points, strokeColor: color, strokeStyle: stroke, strokeWidth: width, roundness: {type: 2},
        startBinding: {elementId: from.id, focus: 0, gap: 4}, endBinding: {elementId: to.id, focus: 0, gap: 4}, startArrowhead: null, endArrowhead: head, lastCommittedPoint: null, customData: {study}}));
      from.boundElements.push({type: 'arrow', id}); to.boundElements.push({type: 'arrow', id});
      if (label) { const t = add(text(`${id}:label`, label, {x: mid[0], y: mid[1], size: EDGE_LABEL_SIZE, containerId: id, color, study: {...study, role: 'edge-label'}})); el.boundElements.push({type: 'text', id: t.id}); }
      return el;
    };
    // Plan every arrow first so endpoints that share one side of a shape spread along it.
    const plans = [];
    for (const e of graph.edges) {
      const from = byNode.get(e.from.nodeId), to = byNode.get(e.to.nodeId);
      if (!from || !to) continue;                       // inside a collapsed subsystem
      const mark = change.edge.get(e.id);
      plans.push({id: `${PREFIX}e:${e.id}`, from, to, label: e.label || e.contractId, stroke: MODE_STROKE[e.mode] || 'solid', width: e.mode === 'storage' ? 3 : 2, color: CHANGE[mark || 'none'], head: 'arrow',
        study: {...scope, role: 'edge', edgeId: e.id, contractId: e.contractId, mode: e.mode, change: mark || null}});
    }
    // A subsystem drawn as a separate box (its boundary would cover unrelated nodes) shows its exposed
    // ports as dotted lines to the internal component behind each port. Enclosing boundaries do not need them.
    for (const n of nodes.filter(n => n.subsystemId && shapes.get(n.id).mode === 'mapped')) {
      for (const port of subsystems.get(n.subsystemId)?.ports || []) {
        const parent = byNode.get(n.id), child = byNode.get(port.target.nodeId);
        if (!parent || !child) continue;
        plans.push({id: `${PREFIX}m:${n.id}:${port.id}`, from: port.direction === 'in' ? parent : child, to: port.direction === 'in' ? child : parent, label: null, stroke: 'dotted', width: 1, color: '#868e96', head: 'arrow',
          study: {...scope, role: 'port-mapping', nodeId: n.id, portId: port.id, contractId: port.contractId, direction: port.direction}});
      }
    }
    const box = el => rect(el.x, el.y, el.width, el.height), centre = r => [r.x + r.w / 2, r.y + r.h / 2];
    const sideOf = (a, b) => { const [ax, ay] = centre(a), [bx, by] = centre(b), dx = bx - ax, dy = by - ay; return Math.abs(dx) * (a.h + b.h) >= Math.abs(dy) * (a.w + b.w) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top'); };
    const slots = new Map();
    for (const plan of plans) for (const [end, self, other] of [['p0', plan.from, plan.to], ['p1', plan.to, plan.from]]) {
      const side = sideOf(box(self), box(other)), key = `${self.id}:${side}`, c = centre(box(other));
      if (!slots.has(key)) slots.set(key, []);
      slots.get(key).push({plan, end, self, side, along: side === 'left' || side === 'right' ? c[1] : c[0]});
    }
    for (const list of slots.values()) {
      list.sort((a, b) => a.along - b.along);
      list.forEach((slot, i) => {
        const r = box(slot.self), f = (i + 1) / (list.length + 1);
        slot.plan[slot.end] = slot.side === 'left' ? [r.x, r.y + r.h * f] : slot.side === 'right' ? [r.x + r.w, r.y + r.h * f] : slot.side === 'top' ? [r.x + r.w * f, r.y] : [r.x + r.w * f, r.y + r.h];
      });
    }
    const length = plan => Math.hypot(plan.p1[0] - plan.p0[0], plan.p1[1] - plan.p0[1]);
    plans.sort((a, b) => length(a) - length(b)).forEach(arrow);   // short arrows have fewest label spots, so they choose first
    if (options.showRemoved) for (const n of change.removedNodes) {
      const study = {...scope, role: 'removed', nodeId: n.id};
      const el = add(base(`${PREFIX}g:${n.id}`, 'rectangle', {x: n.position.x, y: n.position.y, width: BOX.w, height: BOX.h, strokeColor: CHANGE.removed, strokeStyle: 'dashed', opacity: 45, locked: true, roundness: {type: 3}, customData: {study}}));
      const t = add(text(`${PREFIX}gt:${n.id}`, wrap(`${n.label} (removed)`, 20), {x: n.position.x + BOX.w / 2, y: n.position.y + BOX.h / 2, size: LABEL_SIZE, containerId: el.id, color: CHANGE.removed, study: {...study, role: 'removed-label'}}));
      t.opacity = 45; t.locked = true; el.boundElements.push({type: 'text', id: t.id});
    }
    return {elements, issues, summary: stageIndex < 0 ? [] : describe(solution.stages[stageIndex], before), changes: change};
  }

  const isStudy = el => typeof el?.id === 'string' && el.id.startsWith(PREFIX);
  // Text size comes from font metrics and bound-text position from its container; Excalidraw recomputes
  // both (for example when the hand-drawn font finishes loading), so they are not learner edits.
  const derived = (el, field) => el.type === 'text' && (field === 'width' || field === 'height' || (el.containerId && (field === 'x' || field === 'y')));
  // Overlay = what the learner changed relative to the authored scene for this stage. Entries for
  // authored elements not in the current view (inside a collapsed subsystem) carry over from `previous`.
  function diff(authored, current, previous = null) {
    const byId = new Map(authored.map(el => [el.id, el])), seen = new Set(), patches = {}, removed = [], elements = [];
    for (const el of current) {
      const original = byId.get(el.id);
      if (!original) { if (!el.isDeleted) elements.push(el); continue; }
      seen.add(el.id);
      if (el.isDeleted) { removed.push(el.id); continue; }
      const patch = {};
      for (const field of EDITABLE) if (!derived(el, field) && !equal(el[field], original[field])) patch[field] = el[field] === undefined ? null : structuredClone(el[field]);
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
    return text(`${arrow.id}:contract`, value, {x: arrow.x + mid[0], y: arrow.y + mid[1], size: EDGE_LABEL_SIZE, containerId: arrow.id, color, study: {role: 'user-connection-label'}});
  }
  return Object.freeze({PREFIX, EDITABLE, BOX, layout, build, describe, changesFor, diff, applyOverlay, isEmpty, isStudy, wrap, portMatches, labelFor});
});
