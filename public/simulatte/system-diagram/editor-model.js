(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./diagram.js') : root.SimulatteSystemDiagramDocument);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteSystemDiagramEditorModel = api;
})(globalThis, function (documents) {
  'use strict';
  const SELECTION_KEYS = Object.freeze(['nodes', 'edges', 'groups', 'notes']);
  const clone = value => documents.clone(value);
  const emptySelection = () => ({ nodes: [], edges: [], groups: [], notes: [] });
  const record = value => value && typeof value === 'object' && !Array.isArray(value);
  function create({ diagram, library, config }) {
    let current = documents.validate(diagram, library, config), selection = emptySelection();
    const past = [], future = [], listeners = new Set();
    if (!Number.isInteger(config.editor.historyLimit) || config.editor.historyLimit < 1) throw Error('Editor historyLimit must be a positive integer');
    function cleanSelection(value, doc = current) {
      if (!record(value) || Object.keys(value).some(k => !SELECTION_KEYS.includes(k))) throw Error('Selection expects nodes, edges, groups and notes ID arrays');
      const result = emptySelection();
      for (const key of SELECTION_KEYS) {
        if (value[key] !== undefined && (!Array.isArray(value[key]) || value[key].some(id => typeof id !== 'string'))) throw Error(`Selection ${key} expects ID array`);
        result[key] = [...new Set(value[key] || [])].filter(id => doc[key].some(item => item.id === id));
      }
      return result;
    }
    function emit(kind, result) { const event = { kind, diagram: clone(current), selection: clone(selection), result }; for (const listener of listeners) listener(event); }
    function remember() { past.push({ diagram: clone(current), selection: clone(selection) }); if (past.length > config.editor.historyLimit) past.shift(); future.length = 0; }
    function find(doc, key, id) { const item = doc[key].find(row => row.id === id); if (!item) throw Error(`Expected existing ${key} item ${id}`); return item; }
    function selected(cmd, doc) { return cleanSelection(cmd.selection || selection, doc); }
    function selectionNodes(doc, selected) { return new Set([...selected.nodes, ...doc.nodes.filter(n => selected.groups.includes(n.groupId)).map(n => n.id)]); }
    function removeItems(doc, items) {
      const nodes = new Set(items.nodes), edges = new Set(items.edges), groups = new Set(items.groups), notes = new Set(items.notes);
      for (const edge of doc.edges) if (nodes.has(edge.from.nodeId) || nodes.has(edge.to.nodeId)) edges.add(edge.id);
      doc.nodes = doc.nodes.filter(n => !nodes.has(n.id)); doc.edges = doc.edges.filter(e => !edges.has(e.id));
      doc.groups = doc.groups.filter(g => !groups.has(g.id)); doc.notes = doc.notes.filter(n => !notes.has(n.id));
      doc.nodes.forEach(n => { if (groups.has(n.groupId)) delete n.groupId; });
      doc.faults = doc.faults.filter(f => !(f.target.kind === 'node' && nodes.has(f.target.id)) && !(f.target.kind === 'edge' && edges.has(f.target.id)) && !(f.target.kind === 'group' && groups.has(f.target.id)));
    }
    function applyParams(item, cmd) {
      if (!record(cmd.params)) throw Error('Parameter command expects params object');
      if (cmd.reset !== undefined && (!Array.isArray(cmd.reset) || cmd.reset.some(k => typeof k !== 'string'))) throw Error('reset expects parameter names');
      item.params = cmd.replace ? clone(cmd.params) : { ...item.params, ...clone(cmd.params) };
      for (const key of cmd.reset || []) delete item.params[key];
    }
    function bounds(doc, ids) {
      const ns = doc.nodes.filter(n => ids.includes(n.id)); if (!ns.length) return { x: 40, y: 40, w: 400, h: 240 };
      const left = Math.min(...ns.map(n => n.x)) - 24, top = Math.min(...ns.map(n => n.y)) - 40;
      return { x: left, y: top, w: Math.max(...ns.map(n => n.x)) + config.editor.nodeWidth + 24 - left, h: Math.max(...ns.map(n => n.y)) + config.editor.nodeHeight + 24 - top };
    }
    function apply(cmd) {
      let doc = clone(current), nextSelection = clone(selection), kind, result = { ok: true };
      try {
        if (!record(cmd) || typeof cmd.type !== 'string') throw Error('Expected a named editor command');
        switch (cmd.type) {
          case 'addNode': {
            const klass = documents.resolveClass(cmd.classId, doc, library, config), id = cmd.id || documents.newId(doc, 'node');
            doc.nodes.push({ id, classId: cmd.classId, label: cmd.label ?? klass.label, x: cmd.x ?? 100, y: cmd.y ?? 100, params: clone(cmd.params || {}), ...(cmd.groupId ? { groupId: cmd.groupId } : {}) });
            nextSelection = { ...emptySelection(), nodes: [id] }; result.id = id; kind = 'structure'; break;
          }
          case 'deleteItems': { const items = selected(cmd, doc); removeItems(doc, items); nextSelection = emptySelection(); kind = 'structure'; break; }
          case 'connect': {
            const id = cmd.id || documents.newId(doc, 'edge'); doc.edges.push({ id, from: clone(cmd.from), to: clone(cmd.to), params: clone(cmd.params || {}) });
            nextSelection = { ...emptySelection(), edges: [id] }; result.id = id; kind = 'structure'; break;
          }
          case 'reconnect': { const edge = find(doc, 'edges', cmd.id); if (cmd.from) edge.from = clone(cmd.from); if (cmd.to) edge.to = clone(cmd.to); if (cmd.params) applyParams(edge, { params: cmd.params, replace: true }); kind = 'structure'; break; }
          case 'setNodeParams': { applyParams(find(doc, 'nodes', cmd.id), cmd); kind = 'params'; break; }
          case 'setEdgeParams': { applyParams(find(doc, 'edges', cmd.id), cmd); kind = 'params'; break; }
          case 'setNodeLabel': { find(doc, 'nodes', cmd.id).label = cmd.label; kind = 'label'; break; }
          case 'setNodeClass': {
            const changed = documents.changeClass(doc, cmd.id, cmd.classId, library, config); doc = changed.diagram; result.dropped = changed.dropped; result.removedEdges = changed.removedEdges; kind = 'structure'; break;
          }
          case 'setNodeGroup': { if (cmd.groupId !== null && typeof cmd.groupId !== 'string') throw Error('setNodeGroup expects groupId or explicit null'); const node = find(doc, 'nodes', cmd.id); if (cmd.groupId === null) delete node.groupId; else node.groupId = cmd.groupId; kind = 'structure'; break; }
          case 'deriveClass': {
            const changed = documents.deriveClass(doc, cmd.id, { label: cmd.label, id: cmd.classId }, library, config); doc = changed.diagram; result.id = changed.classId; kind = 'classes'; break;
          }
          case 'addUserClass': {
            if (!record(cmd.class)) throw Error('addUserClass expects class definition'); const klass = clone(cmd.class);
            if (!klass.id) klass.id = documents.newClassId(doc, library, klass.label || 'Custom'); doc.classes.push(klass); result.id = klass.id; kind = 'classes'; break;
          }
          case 'updateUserClass': { if (!record(cmd.patch)) throw Error('updateUserClass expects patch'); if (Object.hasOwn(cmd.patch, 'id')) throw Error('Class IDs are stable; derive a new class instead'); Object.assign(find(doc, 'classes', cmd.id), clone(cmd.patch)); kind = 'classes'; break; }
          case 'deleteUserClass': {
            find(doc, 'classes', cmd.id); if (doc.nodes.some(n => n.classId === cmd.id) || doc.classes.some(c => c.extends === cmd.id)) throw Error('Class is referenced by a node or another class');
            doc.classes = doc.classes.filter(c => c.id !== cmd.id); kind = 'classes'; break;
          }
          case 'addGroup': {
            const nodeIds = cmd.nodeIds || selected(cmd, doc).nodes, id = cmd.id || documents.newId(doc, 'group'), groupKind = cmd.kind || 'boundary';
            const geometry = bounds(doc, nodeIds); doc.groups.push({ id, label: cmd.label || (groupKind === 'resource' ? 'Worker cluster' : 'Group'), kind: groupKind,
              x: cmd.x ?? geometry.x, y: cmd.y ?? geometry.y, w: cmd.w ?? geometry.w, h: cmd.h ?? geometry.h, ...(groupKind === 'resource' ? { capacity: cmd.capacity ?? 2 } : {}) });
            nodeIds.forEach(id => { find(doc, 'nodes', id).groupId = doc.groups.at(-1).id; }); nextSelection = { ...emptySelection(), groups: [id] }; result.id = id; kind = 'structure'; break;
          }
          case 'updateGroup': {
            const group = find(doc, 'groups', cmd.id); if (!record(cmd.patch)) throw Error('updateGroup expects patch');
            if (Object.hasOwn(cmd.patch, 'id')) throw Error('Group IDs are stable');
            const oldKind = group.kind; Object.assign(group, clone(cmd.patch));
            if (oldKind !== group.kind) {
              if (group.kind === 'resource') group.capacity = cmd.patch.capacity ?? 2; else delete group.capacity;
              if (!documents.FAILURE_DOMAIN_KINDS.includes(group.kind)) doc.faults = doc.faults.filter(f => f.target.kind !== 'group' || f.target.id !== group.id);
            }
            kind = Object.keys(cmd.patch).some(k => ['kind', 'capacity'].includes(k)) ? 'structure' : Object.keys(cmd.patch).every(k => k === 'label') ? 'label' : 'layout'; break;
          }
          case 'duplicate': {
            const items = selected(cmd, doc), nodeIds = selectionNodes(doc, items), dx = cmd.dx ?? 32, dy = cmd.dy ?? 32, nodeMap = new Map(), groupMap = new Map();
            const groups = doc.groups.filter(g => items.groups.includes(g.id)), nodes = doc.nodes.filter(n => nodeIds.has(n.id)), notes = doc.notes.filter(n => items.notes.includes(n.id)), edges = doc.edges.filter(e => nodeIds.has(e.from.nodeId) && nodeIds.has(e.to.nodeId));
            nextSelection = emptySelection();
            for (const group of groups) { const id = documents.newId(doc, 'group'); groupMap.set(group.id, id); doc.groups.push({ ...clone(group), id, x: group.x + dx, y: group.y + dy }); nextSelection.groups.push(id); }
            for (const node of nodes) { const id = documents.newId(doc, 'node'); nodeMap.set(node.id, id); const n = { ...clone(node), id, x: node.x + dx, y: node.y + dy }; if (groupMap.has(n.groupId)) n.groupId = groupMap.get(n.groupId); doc.nodes.push(n); nextSelection.nodes.push(id); }
            for (const edge of edges) { const id = documents.newId(doc, 'edge'); doc.edges.push({ ...clone(edge), id, from: { ...edge.from, nodeId: nodeMap.get(edge.from.nodeId) }, to: { ...edge.to, nodeId: nodeMap.get(edge.to.nodeId) } }); nextSelection.edges.push(id); }
            for (const note of notes) { const id = documents.newId(doc, 'note'); doc.notes.push({ ...clone(note), id, x: note.x + dx, y: note.y + dy }); nextSelection.notes.push(id); }
            if (!nodes.length && !notes.length && !groups.length) throw Error('Select nodes, groups or notes to duplicate'); kind = 'structure'; result.ids = clone(nextSelection); break;
          }
          case 'moveItems': {
            if (!Number.isFinite(cmd.dx) || !Number.isFinite(cmd.dy)) throw Error('moveItems expects finite dx and dy');
            const items = selected(cmd, doc), nodeIds = selectionNodes(doc, items);
            for (const node of doc.nodes) if (nodeIds.has(node.id)) { node.x += cmd.dx; node.y += cmd.dy; }
            for (const key of ['groups', 'notes']) for (const item of doc[key]) if (items[key].includes(item.id)) { item.x += cmd.dx; item.y += cmd.dy; }
            kind = 'layout'; break;
          }
          case 'setPositions': {
            if (!Array.isArray(cmd.positions)) throw Error('setPositions expects positions array');
            for (const position of cmd.positions) { const item = [...doc.nodes, ...doc.groups, ...doc.notes].find(n => n.id === position.id); if (!item) throw Error(`Missing positioned item ${position.id}`);
              for (const key of Object.keys(position)) if (key !== 'id') { if (!['x', 'y', 'w', 'h'].includes(key) || !Object.hasOwn(item, key)) throw Error(`Cannot position ${key} on ${position.id}`); item[key] = position[key]; }
            }
            kind = 'layout'; break;
          }
          case 'setView': { doc.view = clone(cmd.view); kind = 'view'; break; }
          case 'setMeta': {
            const patch = cmd.patch || Object.fromEntries(Object.entries(cmd).filter(([key]) => key !== 'type'));
            if (!record(patch) || Object.keys(patch).some(k => !['name', 'description', 'seed', 'horizonSec'].includes(k))) throw Error('setMeta accepts name, description, seed and horizonSec');
            for (const [key, value] of Object.entries(patch)) { if (key === 'horizonSec') doc.run.horizonSec = value; else doc[key] = value; }
            kind = Object.keys(patch).some(k => ['seed', 'horizonSec'].includes(k)) ? 'meta' : 'label'; break;
          }
          case 'addNote': {
            const id = cmd.id || documents.newId(doc, 'note'); doc.notes.push({ id, text: cmd.text || '', x: cmd.x ?? 100, y: cmd.y ?? 100, ...(cmd.w !== undefined ? { w: cmd.w } : {}) });
            nextSelection = { ...emptySelection(), notes: [id] }; result.id = id; kind = 'label'; break;
          }
          case 'setNote': { find(doc, 'notes', cmd.id).text = cmd.text; kind = 'label'; break; }
          case 'addFault': { if (!record(cmd.fault)) throw Error('addFault expects fault record'); const fault = clone(cmd.fault); if (!fault.id) fault.id = documents.newId(doc, 'fault'); doc.faults.push(fault); result.id = fault.id; kind = 'faults'; break; }
          case 'updateFault': { if (!record(cmd.patch)) throw Error('updateFault expects patch'); if (Object.hasOwn(cmd.patch, 'id')) throw Error('Fault IDs are stable'); Object.assign(find(doc, 'faults', cmd.id), clone(cmd.patch)); kind = 'faults'; break; }
          case 'removeFault': { find(doc, 'faults', cmd.id); doc.faults = doc.faults.filter(f => f.id !== cmd.id); kind = 'faults'; break; }
          default: throw Error(`Unsupported editor command ${cmd.type}`);
        }
        doc = documents.validate(doc, library, config); nextSelection = cleanSelection(nextSelection, doc);
      } catch (error) { return { ok: false, kind: kind || 'invalid', error: error.message }; }
      result.kind = kind;
      if (JSON.stringify(current) !== JSON.stringify(doc)) { if (kind !== 'view') remember(); current = doc; selection = nextSelection; emit(kind, result); }
      return result;
    }
    function travel(from, to, kind) {
      if (!from.length) return false; const view = clone(current.view); to.push({ diagram: current, selection }); const entry = from.pop(); current = entry.diagram; current.view = view; selection = cleanSelection(entry.selection); emit(kind, { ok: true, kind }); return true;
    }
    function executionIdentity() {
      const compiled = clone(documents.compile(current, library, config)); delete compiled.name;
      compiled.nodes.forEach(n => { delete n.label; }); compiled.groups.forEach(g => { delete g.label; }); return JSON.stringify(compiled);
    }
    return Object.freeze({
      get diagram() { return clone(current); }, get selection() { return clone(selection); },
      apply, undo: () => travel(past, future, 'load'), redo: () => travel(future, past, 'load'), canUndo: () => past.length > 0, canRedo: () => future.length > 0,
      select(value, { additive = false } = {}) { const next = cleanSelection(value); if (additive) for (const key of SELECTION_KEYS) next[key] = [...new Set([...selection[key], ...next[key]])]; selection = next; emit('selection', { ok: true, kind: 'selection' }); return clone(selection); },
      replace(value) { let next; try { next = documents.validate(value, library, config); } catch (error) { return { ok: false, kind: 'load', error: error.message }; } remember(); current = next; selection = emptySelection(); const result = { ok: true, kind: 'load' }; emit('load', result); return result; },
      issues: () => documents.issues(current, library, config), executionIdentity,
      subscribe(listener) { if (typeof listener !== 'function') throw Error('Editor listener must be a function'); listeners.add(listener); return () => listeners.delete(listener); }
    });
  }
  return Object.freeze({ create });
});
