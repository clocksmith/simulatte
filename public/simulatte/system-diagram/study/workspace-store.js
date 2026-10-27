// Workspace envelope: the authored study document exactly as supplied, plus the learner's per-stage
// overlays and view settings. Import validates everything before anything replaces current work;
// unknown fields are kept so files round-trip through this page without loss.
(function (root, factory) {
  const api = factory(root.SimulatteComposableStudy || (typeof require === 'function' ? require('./composable-study.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteStudyWorkspace = api;
})(globalThis, function (study) {
  'use strict';
  if (!study) throw Error('SimulatteStudyWorkspace needs SimulatteComposableStudy loaded first');
  const SCHEMA = 'simulatte.studyWorkspace.v1';
  const STORAGE_PREFIX = 'simulatte.studyWorkspace.v1:';
  const ELEMENT_TYPES = ['rectangle', 'diamond', 'ellipse', 'arrow', 'line', 'freedraw', 'text', 'image', 'frame'];
  function fail(path, message) { const error = Error(`${path}: ${message}`); error.path = path; throw error; }
  const record = value => value && typeof value === 'object' && !Array.isArray(value);

  function create(document, extra = {}) {
    const first = document.solutions[0];
    return {...extra, schema: SCHEMA, version: 1, document, overlays: {}, view: {solutionId: first.id, stageIndex: 0, collapsed: [], showRemoved: false}};
  }
  function validateOverlay(overlay, path) {
    if (!record(overlay)) fail(path, 'expected an object');
    if (!record(overlay.patches)) fail(`${path}.patches`, 'expected an object keyed by element id');
    for (const [id, patch] of Object.entries(overlay.patches)) if (!record(patch)) fail(`${path}.patches.${id}`, 'expected an object');
    if (!Array.isArray(overlay.removed) || overlay.removed.some(id => typeof id !== 'string')) fail(`${path}.removed`, 'expected element ids');
    if (!Array.isArray(overlay.elements)) fail(`${path}.elements`, 'expected an array');
    overlay.elements.forEach((el, i) => {
      if (!record(el) || typeof el.id !== 'string' || !ELEMENT_TYPES.includes(el.type)) fail(`${path}.elements[${i}]`, 'expected an Excalidraw element with id and supported type');
    });
    if (overlay.files !== undefined && !record(overlay.files)) fail(`${path}.files`, 'expected an object keyed by file id');
  }
  // Accepts a workspace envelope or a bare authored document. Throws with a location on any problem.
  function parse(raw) {
    if (typeof raw !== 'string') fail('file', 'expected JSON text');
    if (new TextEncoder().encode(raw).length > study.MAX_BYTES) fail('file', 'import exceeds 8 MB');
    let value; try { value = JSON.parse(raw); } catch (error) { fail('file', `not JSON (${error.message})`); }
    if (study.SCHEMAS.includes(value?.schema)) return {kind: 'document', workspace: create(study.validate(value))};
    if (value?.schema !== SCHEMA || value.version !== 1) fail('schema', `expected ${SCHEMA} or ${study.SCHEMAS.join(' or ')}`);
    try { study.validate(value.document); } catch (error) { fail(`document.${error.path || ''}`, error.message.replace(/^[^:]*: /, '')); }
    if (!record(value.overlays)) fail('overlays', 'expected an object keyed by approach id');
    for (const [solutionId, stages] of Object.entries(value.overlays)) {
      const solution = value.document.solutions.find(s => s.id === solutionId);
      if (!solution) fail(`overlays.${solutionId}`, 'no such approach in the document');
      if (!record(stages)) fail(`overlays.${solutionId}`, 'expected an object keyed by stage id');
      for (const [stageId, overlay] of Object.entries(stages)) {
        if (stageId !== 'initial' && !solution.stages.some(s => s.id === stageId)) fail(`overlays.${solutionId}.${stageId}`, 'no such stage in this approach');
        validateOverlay(overlay, `overlays.${solutionId}.${stageId}`);
      }
    }
    const view = value.view;
    if (!record(view)) fail('view', 'expected view settings');
    const solution = value.document.solutions.find(s => s.id === view.solutionId);
    if (!solution) fail('view.solutionId', 'no such approach');
    if (!Number.isInteger(view.stageIndex) || view.stageIndex < -1 || view.stageIndex >= solution.stages.length) fail('view.stageIndex', 'out of range');
    if (!Array.isArray(view.collapsed) || view.collapsed.some(id => typeof id !== 'string')) fail('view.collapsed', 'expected node ids');
    if (typeof view.showRemoved !== 'boolean') fail('view.showRemoved', 'expected true or false');
    return {kind: 'workspace', workspace: value};
  }
  function serialize(workspace) { return JSON.stringify(workspace, null, 2) + '\n'; }
  const stageKey = (solution, stageIndex) => (stageIndex < 0 ? 'initial' : solution.stages[stageIndex].id);
  function overlayFor(workspace, solutionId, stageId) { return workspace.overlays[solutionId]?.[stageId] || null; }
  // Returns a new workspace; other stages' overlays are untouched. A null or empty overlay removes the entry.
  function withOverlay(workspace, solutionId, stageId, overlay, isEmpty) {
    const overlays = {...workspace.overlays, [solutionId]: {...(workspace.overlays[solutionId] || {})}};
    if (!overlay || isEmpty(overlay)) delete overlays[solutionId][stageId]; else overlays[solutionId][stageId] = overlay;
    if (!Object.keys(overlays[solutionId]).length) delete overlays[solutionId];
    return {...workspace, overlays};
  }
  const withView = (workspace, patch) => ({...workspace, view: {...workspace.view, ...patch}});
  function summary(workspace) {
    const d = workspace.document;
    return {referenceId: d.problem.referenceId, studyLabel: d.problem.studyLabel, approaches: d.solutions.map(s => `${s.title} (${s.stages.length} stages)`),
      stages: d.solutions.reduce((n, s) => n + s.stages.length, 0), editedStages: Object.values(workspace.overlays).reduce((n, stages) => n + Object.keys(stages).length, 0)};
  }
  const storageKey = referenceId => STORAGE_PREFIX + referenceId;
  return Object.freeze({SCHEMA, STORAGE_PREFIX, create, parse, serialize, stageKey, overlayFor, withOverlay, withView, summary, storageKey});
});
