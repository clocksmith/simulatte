(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./graph-document.js') : root.SimulatteGraphDocument);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteDiagramEditorSession = api;
})(globalThis, function (graph) {
  'use strict';
  const clone = value => structuredClone(value), LIMIT = 100;
  function create(document) {
    let draft = clone(graph.validate(document)), accepted = null, past = [], future = [];
    function change(operation, preserveRevision = false) {
      const candidate = clone(draft); operation(candidate); graph.validate(candidate);
      if (JSON.stringify(candidate) === JSON.stringify(draft)) return false;
      if (!preserveRevision) candidate.revision = draft.revision + 1; graph.validate(candidate);
      past.push(clone(draft)); if (past.length > LIMIT) past.shift(); draft = candidate; future = []; return true;
    }
    function replace(document) { const next = clone(graph.validate(document)); return change(candidate => { Object.keys(candidate).forEach(k => delete candidate[k]); Object.assign(candidate, next); }, true); }
    return Object.freeze({
      document: () => clone(draft), accepted: () => clone(accepted),
      dirty: () => !accepted || graph.identity(draft) !== graph.identity(accepted),
      canUndo: () => past.length > 0, canRedo: () => future.length > 0, change, replace,
      undo() { if (!past.length) return false; future.push(draft); draft = past.pop(); return true; },
      redo() { if (!future.length) return false; past.push(draft); draft = future.pop(); return true; },
      accept() { graph.validate(draft, { execution: true }); accepted = clone(draft); return clone(accepted); },
      allocate(document, prefix) { let id; do { id = `${prefix}-${document.nextId++}`; } while ([...document.nodes, ...document.classes, ...document.links, ...document.clusters].some(n => n.id === id)); return id; },
      export({ time = 0, checkpoint = null } = {}) { return { schema: 'simulatte.systemDiagramSession.v2', document: clone(draft), accepted: clone(accepted), time, checkpoint: clone(checkpoint) }; }
    });
  }
  function read(value) {
    if (!value || value.schema !== 'simulatte.systemDiagramSession.v2') { graph.validate(value); return { document: clone(value), accepted: null, time: 0, checkpoint: null }; }
    if (Object.keys(value).sort().join(',') !== 'accepted,checkpoint,document,schema,time') throw Error('Missing or undeclared session fields');
    graph.validate(value.document); if (value.accepted) graph.validate(value.accepted, { execution: true });
    if (!Number.isFinite(value.time) || value.time < 0 || value.time > 60) throw Error('Replay time must be in [0, 60]');
    return clone(value);
  }
  return Object.freeze({ create, read });
});
