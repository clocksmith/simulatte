(function attachSimulatteWorldSpecEditor(root) {
  const editorUi = typeof module === 'object' && module.exports
    ? require('../../../shared/design/program-editor.js') : root.SimulatteProgramEditor;
  if (!editorUi) throw new Error('program_editor_dependency_missing');
  const inputSource = typeof module === 'object' && module.exports
    ? require('../../../shared/contracts/input-source.js') : root.SimulatteInputSource;
  if (!inputSource) throw new Error('world_spec_input_source_missing');
  const { safeFilePart } = editorUi;
  function connect(documentRoot, options = {}) {
    const editor = documentRoot.getElementById('world-spec-editor');
    const rationale = documentRoot.getElementById('world-spec-edit-rationale');
    const status = documentRoot.getElementById('world-spec-editor-status');
    const applyButton = documentRoot.getElementById('apply-world-spec');
    const resetButton = documentRoot.getElementById('reset-world-spec-edit');
    const exportButton = documentRoot.getElementById('export-lab');
    const exportImprovementButton = documentRoot.getElementById('export-improvement-record');
    const importButton = documentRoot.getElementById('import-lab');
    const fileInput = documentRoot.getElementById('world-spec-import-file');
    const improvementStatus = documentRoot.getElementById('world-improvement-record-status');
    const disclosure = editor && editor.closest ? editor.closest('details') : null;
    if (!editor || !status || !applyButton || !resetButton || !exportButton ||
        !exportImprovementButton || !importButton || !fileInput || !improvementStatus) {
      throw new Error('WorldSpec editor controls are incomplete');
    }
    if (typeof options.getSpec !== 'function' || typeof options.serialize !== 'function' ||
      typeof options.apply !== 'function' || typeof options.import !== 'function' ||
      typeof options.getImprovementRecord !== 'function' ||
      typeof options.serializeImprovementRecord !== 'function') {
      throw new Error('WorldSpec editor requires spec, import, and improvement-record functions');
    }
    const draft = editorUi.createDraft({ editor, apply: applyButton, status });
    let pendingSpec = null;

    function setStatus(message, state = 'ready') {
      editorUi.setStatus(status, message, state);
    }

    function sync(spec = options.getSpec(), syncOptions = {}) {
      if (!spec || (draft.isDirty() && syncOptions.force !== true)) return false;
      pendingSpec = spec;
      if (disclosure && !disclosure.open && syncOptions.force !== true) {
        const revision = Number(spec.authorship && spec.authorship.revision || 0);
        setStatus(`${spec.contentHash || 'unhashed'} · revision ${revision}`);
        return false;
      }
      draft.setValue(options.serialize(spec));
      const revision = Number(spec.authorship && spec.authorship.revision || 0);
      setStatus(`${spec.contentHash || 'unhashed'} · revision ${revision}`);
      return true;
    }

    function markDirty() {
      draft.markDirty('Unapplied edit');
    }

    function reportError(error) {
      const message = error && error.message ? error.message : String(error || 'WorldSpec edit failed');
      setStatus(message, 'error');
      if (typeof options.onError === 'function') options.onError(error);
    }

    function applyEditorValue(reason = '') {
      try {
        setStatus('Validating and recompiling', 'active');
        const next = options.apply(editor.value, reason || rationale && rationale.value || 'User edited WorldSpec in Create');
        sync(next, { force: true });
        if (rationale) rationale.value = '';
        return next;
      } catch (error) {
        reportError(error);
        return null;
      }
    }

    async function exportCurrentSpec() {
      try {
        const spec = options.getSpec();
        const payload = options.serialize(spec);
        await exportPayload(payload, `${safeFilePart(spec.id || spec.name || 'world')}.world.json`);
        setStatus(`Exported ${spec.contentHash || spec.id}`, 'ready');
      } catch (error) {
        reportError(error);
      }
    }

    async function exportImprovementRecord() {
      try {
        const record = options.getImprovementRecord();
        if (!record) throw new Error('No successful correction record is available');
        const payload = options.serializeImprovementRecord(record);
        await exportPayload(payload, `${safeFilePart(record.failureBoundary.worldSpec.id)}.improvement.json`);
        improvementStatus.textContent = `Exported ${record.contentHash}`;
        improvementStatus.dataset.state = 'ready';
      } catch (error) {
        improvementStatus.textContent = error && error.message ? error.message : String(error || 'Improvement export failed');
        improvementStatus.dataset.state = 'error';
      }
    }

    async function exportPayload(payload, fileName) {
      return editorUi.downloadJson(documentRoot, fileName, payload);
    }

    function syncImprovement(record = options.getImprovementRecord()) {
      exportImprovementButton.disabled = !record;
      improvementStatus.textContent = record
        ? `${record.contentHash} · ${record.corpusDisposition}`
        : 'Complete a failed-obligation edit and exact replay to create a record';
      improvementStatus.dataset.state = record ? 'ready' : 'idle';
      return Boolean(record);
    }

    async function importSelectedFile() {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try {
        const input = await inputSource.readFile(file);
        if (!['worldSpec', 'legacySpec'].includes(input.kind)) throw new Error('Import expects a WorldSpec. Open the workbench to prepare CSV or JSON data.');
        editor.value = input.kind === 'legacySpec' ? JSON.stringify(input.spec) : options.serialize(input.spec);
        markDirty();
        const next = options.import(editor.value, file.name || 'WorldSpec file');
        sync(next, { force: true });
      } catch (error) {
        reportError(error);
      } finally {
        fileInput.value = '';
      }
    }

    editor.addEventListener('input', markDirty);
    applyButton.addEventListener('click', () => applyEditorValue());
    resetButton.addEventListener('click', () => sync(options.getSpec(), { force: true }));
    exportButton.addEventListener('click', exportCurrentSpec);
    exportImprovementButton.addEventListener('click', exportImprovementRecord);
    importButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', importSelectedFile);
    disclosure?.addEventListener('toggle', () => {
      if (disclosure.open && !draft.isDirty()) sync(pendingSpec || options.getSpec(), { force: true });
    });
    sync(options.getSpec());
    syncImprovement();

    return Object.freeze({
      sync,
      syncImprovement,
      apply: applyEditorValue,
      isDirty: draft.isDirty,
    });
  }

  const api = Object.freeze({ connect, safeFilePart });
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteWorldSpecEditor = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
