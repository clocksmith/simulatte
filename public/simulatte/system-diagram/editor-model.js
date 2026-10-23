(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./diagram.js') : root.SimulatteSystemDiagramDocument);
  if (node) module.exports = api; else root.SimulatteSystemDiagramEditorModel = api;
})(globalThis, function (D) {
  'use strict';
  // Higher rank wins when coalesced history entries mix kinds, so undo reports the most disruptive change.
  const KIND_RANK = Object.freeze({ selection: 0, view: 0, layout: 1, label: 2, params: 3, meta: 4, faults: 5, classes: 6, structure: 7, load: 8 });
  const SELECTION_KEYS = Object.freeze(['nodes', 'edges', 'groups', 'notes']);
  const COLLECTION_KEYS = Object.freeze(['nodes', 'edges', 'groups', 'notes', 'faults']);
  const DEFAULT_DUPLICATE_GRID_STEPS = 3;
  const COORD = 1e6;

  const has = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
  const maxKind = (a, b) => (KIND_RANK[b] > KIND_RANK[a] ? b : a);
  const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
    return value;
  }
  function refuse(message) { throw new Error(message); }
  function find(draft, key, id, what) {
    const item = draft[key].find(row => row.id === id);
    if (!item) refuse(`${what} ${JSON.stringify(id)} does not exist`);
    return item;
  }
  function patchParams(target, patch, what) {
    if (!isRecord(patch)) refuse(`${what} expects an object patch`);
    const next = { ...target };
    for (const [key, value] of Object.entries(patch)) { if (value === null) delete next[key]; else next[key] = value; }
    return next;
  }
  function pick(patch, allowed, what) {
    if (!isRecord(patch)) refuse(`${what} expects an object patch`);
    for (const key of Object.keys(patch)) if (!allowed.includes(key)) refuse(`${what} cannot change ${key}`);
    return patch;
  }
  function typeOf(draft, id) {
    for (const key of COLLECTION_KEYS) if (draft[key].some(row => row.id === id)) return key;
    return null;
  }
  function emptySelection() { return { nodes: [], edges: [], groups: [], notes: [] }; }
  function normalizeSelection(doc, input) {
    const out = emptySelection();
    if (!input) return out;
    for (const key of SELECTION_KEYS) {
      const ids = new Set(doc[key].map(row => row.id));
      for (const id of input[key] || []) if (ids.has(id) && !out[key].includes(id)) out[key].push(id);
    }
    return out;
  }
  function selectionFromIds(doc, ids) {
    const out = emptySelection();
    for (const id of ids) { const key = typeOf(doc, id); if (key && key !== 'faults') out[key].push(id); }
    return out;
  }
  const sameSelection = (a, b) => SELECTION_KEYS.every(key => a[key].length === b[key].length && a[key].every((id, i) => id === b[key][i]));
  const flatSelection = selection => SELECTION_KEYS.flatMap(key => selection[key]);

  function create({ diagram, library, config }) {
    if (!library || !config) throw new Error('SimulatteSystemDiagramEditorModel.create requires library and config');
    const historyLimit = config.editor.historyLimit;
    let doc = deepFreeze(D.validate(diagram || D.emptyDiagram(config), library, config));
    let selection = deepFreeze(emptySelection());
    let past = [], future = [], openCoalesce = null;
    const listeners = new Set();

    function notify(kind, command, result) {
      const event = { kind, diagram: doc, selection, command, result };
      for (const listener of [...listeners]) listener(event);
    }
    function setSelection(next) { selection = deepFreeze(normalizeSelection(doc, next)); }
    function pushHistory(before, kind, command, coalesce) {
      const top = past.at(-1);
      if (coalesce && top && openCoalesce === coalesce && top.coalesce === coalesce) {
        top.after = doc; top.kind = maxKind(top.kind, kind);
      } else {
        past.push({ before, after: doc, kind, command, coalesce: coalesce || null });
        if (past.length > historyLimit) past.splice(0, past.length - historyLimit);
      }
      openCoalesce = coalesce || null;
      future = [];
    }

    // Each handler mutates a draft clone; the result is validated before it replaces the document.
    const handlers = {
      addNode(draft, cmd) {
        const klass = D.resolveClass(cmd.classId, draft, library, config);
        const id = cmd.id || D.newId(draft, String(cmd.classId).replace(/^user\./, ''));
        const node = { id, classId: cmd.classId, label: cmd.label ?? klass.label, x: cmd.x, y: cmd.y, params: { ...(cmd.params || {}) } };
        if (cmd.groupId != null) node.groupId = cmd.groupId;
        draft.nodes.push(node);
        return { kind: 'structure', id, select: [id] };
      },
      moveItems(draft, cmd) {
        const ids = new Set(cmd.ids || []);
        if (!ids.size) refuse('moveItems needs ids');
        if (!Number.isFinite(cmd.dx) || !Number.isFinite(cmd.dy)) refuse('moveItems needs finite dx and dy');
        for (const id of ids) if (!typeOf(draft, id) || typeOf(draft, id) === 'edges' || typeOf(draft, id) === 'faults') refuse(`moveItems: ${JSON.stringify(id)} is not a node, group or note`);
        const movedGroups = new Set(draft.groups.filter(g => ids.has(g.id)).map(g => g.id));
        for (const row of [...draft.nodes, ...draft.groups, ...draft.notes]) {
          if (ids.has(row.id) || (row.groupId && movedGroups.has(row.groupId) && draft.nodes.includes(row))) { row.x += cmd.dx; row.y += cmd.dy; }
        }
        return { kind: 'layout' };
      },
      setPositions(draft, cmd) {
        if (!isRecord(cmd.positions)) refuse('setPositions needs a positions object');
        for (const [id, pos] of Object.entries(cmd.positions)) {
          const key = typeOf(draft, id);
          if (!['nodes', 'groups', 'notes'].includes(key)) refuse(`setPositions: ${JSON.stringify(id)} is not a node, group or note`);
          const row = draft[key].find(item => item.id === id);
          const allowed = key === 'groups' ? ['x', 'y', 'w', 'h'] : key === 'notes' ? ['x', 'y', 'w'] : ['x', 'y'];
          for (const [field, value] of Object.entries(pick(pos, allowed, `setPositions ${id}`))) row[field] = value;
        }
        return { kind: 'layout' };
      },
      setNodeLabel(draft, cmd) {
        find(draft, 'nodes', cmd.id, 'node').label = cmd.label;
        return { kind: 'label', id: cmd.id };
      },
      setNodeParams(draft, cmd) {
        const node = find(draft, 'nodes', cmd.id, 'node');
        node.params = patchParams(node.params, cmd.params, 'setNodeParams');
        return { kind: 'params', id: cmd.id };
      },
      setNodeClass(draft, cmd) {
        find(draft, 'nodes', cmd.id, 'node');
        const result = D.changeClass(draft, cmd.id, cmd.classId, library, config);
        return { kind: 'structure', id: cmd.id, replace: result.diagram, extras: { dropped: result.dropped, removedEdges: result.removedEdges } };
      },
      setNodeGroup(draft, cmd) {
        const ids = cmd.ids || [cmd.id];
        if (cmd.groupId != null) find(draft, 'groups', cmd.groupId, 'group');
        for (const id of ids) {
          const node = find(draft, 'nodes', id, 'node');
          if (cmd.groupId == null) delete node.groupId; else node.groupId = cmd.groupId;
        }
        return { kind: 'structure', id: ids.length === 1 ? ids[0] : undefined };
      },
      deleteItems(draft, cmd) {
        const ids = [...new Set(cmd.ids || [])];
        if (!ids.length) refuse('deleteItems needs ids');
        const removed = { nodes: [], edges: [], groups: [], notes: [], faults: [] };
        for (const id of ids) { const key = typeOf(draft, id); if (!key) refuse(`deleteItems: ${JSON.stringify(id)} does not exist`); removed[key].push(id); }
        const nodeIds = new Set(removed.nodes);
        for (const edge of draft.edges) if (!removed.edges.includes(edge.id) && (nodeIds.has(edge.from.nodeId) || nodeIds.has(edge.to.nodeId))) removed.edges.push(edge.id);
        const gone = new Set([...removed.nodes, ...removed.edges, ...removed.groups]);
        for (const fault of draft.faults) if (!removed.faults.includes(fault.id) && gone.has(fault.target.id)) removed.faults.push(fault.id);
        for (const key of COLLECTION_KEYS) { const drop = new Set(removed[key]); draft[key] = draft[key].filter(row => !drop.has(row.id)); }
        const groupIds = new Set(removed.groups);
        for (const node of draft.nodes) if (node.groupId && groupIds.has(node.groupId)) delete node.groupId;
        return { kind: 'structure', extras: { removed } };
      },
      connect(draft, cmd) {
        const id = cmd.id || D.newId(draft, 'edge');
        draft.edges.push({ id, from: { nodeId: cmd.from?.nodeId, portId: cmd.from?.portId }, to: { nodeId: cmd.to?.nodeId, portId: cmd.to?.portId }, params: { ...(cmd.params || {}) } });
        return { kind: 'structure', id, select: [id], after: next => ({ warning: D.issues(next, library, config).find(w => w.kind === 'payload-mismatch' && w.edgeId === id)?.message || null }) };
      },
      setEdgeParams(draft, cmd) {
        const edge = find(draft, 'edges', cmd.id, 'edge');
        edge.params = patchParams(edge.params, cmd.params, 'setEdgeParams');
        return { kind: 'params', id: cmd.id };
      },
      addGroup(draft, cmd) {
        const kind = cmd.kind || 'zone';
        const id = cmd.id || D.newId(draft, kind);
        const count = draft.groups.filter(g => g.kind === kind).length + 1;
        draft.groups.push({ id, label: cmd.label ?? `${kind[0].toUpperCase()}${kind.slice(1)} ${count}`, kind, x: cmd.x, y: cmd.y, w: cmd.w, h: cmd.h });
        return { kind: 'structure', id, select: [id] };
      },
      updateGroup(draft, cmd) {
        const group = find(draft, 'groups', cmd.id, 'group');
        let kind = 'layout';
        for (const [field, value] of Object.entries(pick(cmd.patch, ['label', 'kind', 'x', 'y', 'w', 'h'], 'updateGroup'))) {
          if (group[field] === value) continue;
          kind = maxKind(kind, field === 'kind' ? 'structure' : field === 'label' ? 'label' : 'layout');
          group[field] = value;
        }
        return { kind, id: cmd.id };
      },
      addNote(draft, cmd) {
        const id = cmd.id || D.newId(draft, 'note');
        const note = { id, text: cmd.text ?? '', x: cmd.x, y: cmd.y };
        if (cmd.w != null) note.w = cmd.w;
        draft.notes.push(note);
        return { kind: 'label', id, select: [id] };
      },
      updateNote(draft, cmd) {
        const note = find(draft, 'notes', cmd.id, 'note');
        let kind = 'layout';
        for (const [field, value] of Object.entries(pick(cmd.patch, ['text', 'x', 'y', 'w'], 'updateNote'))) {
          if (field === 'text') kind = 'label';
          if (field === 'w' && value === null) delete note.w; else note[field] = value;
        }
        return { kind, id: cmd.id };
      },
      addFault(draft, cmd) {
        const fault = cmd.fault;
        if (!isRecord(fault)) refuse('addFault needs a fault object');
        const id = fault.id || D.newId(draft, 'fault');
        draft.faults.push({ id, atSec: fault.atSec, untilSec: fault.untilSec, target: isRecord(fault.target) ? { kind: fault.target.kind, id: fault.target.id } : fault.target, type: fault.type, params: { ...(fault.params || {}) } });
        return { kind: 'faults', id };
      },
      updateFault(draft, cmd) {
        const fault = find(draft, 'faults', cmd.id, 'fault');
        for (const [field, value] of Object.entries(pick(cmd.patch, ['atSec', 'untilSec', 'target', 'type', 'params'], 'updateFault'))) {
          if (field === 'params') fault.params = patchParams(fault.params, value, 'updateFault params');
          else if (field === 'target') fault.target = isRecord(value) ? { kind: value.kind, id: value.id } : value;
          else fault[field] = value;
        }
        return { kind: 'faults', id: cmd.id };
      },
      removeFault(draft, cmd) {
        find(draft, 'faults', cmd.id, 'fault');
        draft.faults = draft.faults.filter(f => f.id !== cmd.id);
        return { kind: 'faults', id: cmd.id };
      },
      addUserClass(draft, cmd) {
        if (typeof cmd.label !== 'string' || !cmd.label.trim()) refuse('addUserClass needs a label');
        const id = cmd.id || D.newClassId(draft, library, cmd.label);
        const klass = { id, label: cmd.label, extends: cmd.extends, defaults: { ...(cmd.defaults || {}) } };
        for (const field of ['category', 'glyph', 'description']) if (cmd[field] != null) klass[field] = cmd[field];
        draft.classes.push(klass);
        return { kind: 'classes', id };
      },
      updateUserClass(draft, cmd) {
        const klass = find(draft, 'classes', cmd.id, 'user class');
        for (const [field, value] of Object.entries(pick(cmd.patch, ['label', 'extends', 'defaults', 'category', 'glyph', 'description'], 'updateUserClass'))) {
          if (field === 'defaults') klass.defaults = patchParams(klass.defaults, value, 'updateUserClass defaults');
          else if (value === null && field !== 'label' && field !== 'extends') delete klass[field];
          else klass[field] = value;
        }
        return { kind: 'classes', id: cmd.id };
      },
      deleteUserClass(draft, cmd) {
        find(draft, 'classes', cmd.id, 'user class');
        const node = draft.nodes.find(n => n.classId === cmd.id);
        if (node) refuse(`user class ${cmd.id} is used by node ${node.id}`);
        const child = draft.classes.find(k => k.extends === cmd.id);
        if (child) refuse(`user class ${cmd.id} is extended by ${child.id}`);
        draft.classes = draft.classes.filter(k => k.id !== cmd.id);
        return { kind: 'classes', id: cmd.id };
      },
      deriveClass(draft, cmd) {
        find(draft, 'nodes', cmd.nodeId, 'node');
        const result = D.deriveClass(draft, cmd.nodeId, { label: cmd.label, id: cmd.id }, library, config);
        return { kind: 'structure', id: result.classId, replace: result.diagram };
      },
      setMeta(draft, cmd) {
        let kind = 'label';
        for (const [field, value] of Object.entries(pick(cmd.patch, ['id', 'name', 'description', 'seed', 'horizonSec'], 'setMeta'))) {
          if (field === 'horizonSec') { draft.run.horizonSec = value; kind = 'meta'; }
          else if (field === 'description' && value === null) delete draft.description;
          else { draft[field] = value; if (field === 'seed' || field === 'id') kind = 'meta'; }
        }
        return { kind };
      },
      duplicate(draft, cmd) {
        const ids = new Set(cmd.ids || flatSelection(selection));
        if (!ids.size) refuse('duplicate needs ids or a selection');
        const step = config.editor.grid * DEFAULT_DUPLICATE_GRID_STEPS;
        const dx = cmd.dx ?? step, dy = cmd.dy ?? step;
        const groups = draft.groups.filter(g => ids.has(g.id));
        const groupMap = new Map(), nodeMap = new Map(), created = [];
        for (const g of groups) { const id = D.newId(draft, g.id.replace(/-\d+$/, '')); groupMap.set(g.id, id); draft.groups.push({ ...g, id, x: g.x + dx, y: g.y + dy }); created.push(id); }
        const nodes = draft.nodes.filter(n => ids.has(n.id) || (n.groupId && groupMap.has(n.groupId)));
        for (const n of nodes) {
          const id = D.newId(draft, n.id.replace(/-\d+$/, ''));
          nodeMap.set(n.id, id);
          const copy = { ...n, id, x: n.x + dx, y: n.y + dy, params: { ...n.params } };
          if (n.groupId && groupMap.has(n.groupId)) copy.groupId = groupMap.get(n.groupId);
          draft.nodes.push(copy); created.push(id);
        }
        for (const e of draft.edges.filter(e => nodeMap.has(e.from.nodeId) && nodeMap.has(e.to.nodeId))) {
          const id = D.newId(draft, 'edge');
          draft.edges.push({ id, from: { nodeId: nodeMap.get(e.from.nodeId), portId: e.from.portId }, to: { nodeId: nodeMap.get(e.to.nodeId), portId: e.to.portId }, params: { ...e.params } });
          created.push(id);
        }
        for (const note of draft.notes.filter(n => ids.has(n.id))) { const id = D.newId(draft, 'note'); draft.notes.push({ ...note, id, x: note.x + dx, y: note.y + dy }); created.push(id); }
        if (!created.length) refuse('duplicate found no nodes, groups or notes to copy');
        return { kind: 'structure', select: created, extras: { created } };
      },
    };

    function setView(view) {
      if (!isRecord(view)) return { ok: false, kind: 'view', error: 'setView needs a view object' };
      const next = { x: view.x ?? doc.view.x, y: view.y ?? doc.view.y, zoom: view.zoom ?? doc.view.zoom };
      if (![next.x, next.y].every(v => Number.isFinite(v) && Math.abs(v) <= COORD)) return { ok: false, kind: 'view', error: `view x and y must be finite within ${COORD}` };
      if (!Number.isFinite(next.zoom) || next.zoom < config.editor.minZoom || next.zoom > config.editor.maxZoom) return { ok: false, kind: 'view', error: `zoom must be in [${config.editor.minZoom}, ${config.editor.maxZoom}]` };
      if (next.x === doc.view.x && next.y === doc.view.y && next.zoom === doc.view.zoom) return { ok: true, kind: 'view', unchanged: true };
      doc = deepFreeze({ ...doc, view: next });
      const result = { ok: true, kind: 'view' };
      notify('view', { type: 'setView', view: next }, result);
      return result;
    }

    function select(input, options = {}) {
      const incoming = Array.isArray(input) ? selectionFromIds(doc, input) : normalizeSelection(doc, input);
      let next = incoming;
      if (options.additive || options.toggle) {
        next = { nodes: [...selection.nodes], edges: [...selection.edges], groups: [...selection.groups], notes: [...selection.notes] };
        for (const key of SELECTION_KEYS) for (const id of incoming[key]) {
          const at = next[key].indexOf(id);
          if (at < 0) next[key].push(id); else if (options.toggle) next[key].splice(at, 1);
        }
      }
      next = normalizeSelection(doc, next);
      if (sameSelection(next, selection)) return { ok: true, kind: 'selection', unchanged: true };
      selection = deepFreeze(next);
      const result = { ok: true, kind: 'selection' };
      notify('selection', { type: 'select', selection: next, ...options }, result);
      return result;
    }

    function replace(diagram) {
      let next;
      try { next = deepFreeze(D.validate(diagram, library, config)); } catch (error) { return { ok: false, kind: 'load', error: error.message }; }
      doc = next; past = []; future = []; openCoalesce = null;
      setSelection(null);
      const result = { ok: true, kind: 'load' };
      notify('load', { type: 'replace' }, result);
      return result;
    }

    function apply(command) {
      if (!isRecord(command) || typeof command.type !== 'string') return { ok: false, kind: null, error: 'command needs a string type' };
      if (command.type === 'setView') return setView(command.view);
      if (command.type === 'select') return select(command.selection, { additive: command.additive, toggle: command.toggle });
      if (command.type === 'replace') return replace(command.diagram);
      const handler = handlers[command.type];
      if (!handler) return { ok: false, kind: null, error: `unknown command ${command.type}` };
      let outcome, next;
      try {
        const draft = D.clone(doc);
        outcome = handler(draft, command);
        next = deepFreeze(D.validate(outcome.replace || draft, library, config));
      } catch (error) {
        return { ok: false, kind: outcome?.kind || null, error: error.message };
      }
      const result = { ok: true, kind: outcome.kind, ...(outcome.id !== undefined ? { id: outcome.id } : {}), ...(outcome.extras || {}), ...(outcome.after ? outcome.after(next) : {}) };
      if (JSON.stringify(next) === JSON.stringify(doc)) return { ...result, unchanged: true };
      const before = doc;
      doc = next;
      pushHistory(before, outcome.kind, command, command.coalesce);
      setSelection(outcome.select ? selectionFromIds(doc, outcome.select) : selection);
      notify(outcome.kind, command, result);
      return result;
    }

    function step(from, to, type) {
      const entry = from.pop();
      if (!entry) return { ok: false, kind: null, error: `nothing to ${type}` };
      to.push(entry);
      openCoalesce = null;
      doc = deepFreeze({ ...(type === 'undo' ? entry.before : entry.after), view: doc.view });
      setSelection(selection);
      const result = { ok: true, kind: entry.kind };
      notify(entry.kind, { type, of: entry.command }, result);
      return result;
    }

    return {
      get diagram() { return doc; },
      get selection() { return selection; },
      library, config,
      apply,
      undo: () => step(past, future, 'undo'),
      redo: () => step(future, past, 'redo'),
      canUndo: () => past.length > 0,
      canRedo: () => future.length > 0,
      select,
      replace,
      issues: () => D.issues(doc, library, config),
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      selectedIds: () => flatSelection(selection),
      itemType: id => typeOf(doc, id),
    };
  }

  return Object.freeze({ create, KIND_RANK, SELECTION_KEYS });
});
