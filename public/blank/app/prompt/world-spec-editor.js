(function attachSimulatteWorldSpecEditor(root) {
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
    let dirty = false;
    let pendingSpec = null;

    function setStatus(message, state = 'ready') {
      status.textContent = String(message || '');
      status.dataset.state = state;
    }

    function sync(spec = options.getSpec(), syncOptions = {}) {
      if (!spec || (dirty && syncOptions.force !== true)) return false;
      pendingSpec = spec;
      if (disclosure && !disclosure.open && syncOptions.force !== true) {
        const revision = Number(spec.authorship && spec.authorship.revision || 0);
        setStatus(`${spec.contentHash || 'unhashed'} · revision ${revision}`);
        return false;
      }
      editor.value = options.serialize(spec);
      dirty = false;
      editor.dataset.dirty = 'false';
      applyButton.disabled = true;
      const revision = Number(spec.authorship && spec.authorship.revision || 0);
      setStatus(`${spec.contentHash || 'unhashed'} · revision ${revision}`);
      return true;
    }

    function markDirty() {
      dirty = true;
      editor.dataset.dirty = 'true';
      applyButton.disabled = false;
      setStatus('Unapplied edit', 'dirty');
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
      const view = documentRoot.defaultView || root;
      if (view.Blob && view.URL && typeof view.URL.createObjectURL === 'function') {
        const blob = new view.Blob([payload], { type: 'application/json' });
        const url = view.URL.createObjectURL(blob);
        const link = documentRoot.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        view.URL.revokeObjectURL(url);
      } else if (view.navigator && view.navigator.clipboard) {
        await view.navigator.clipboard.writeText(payload);
      } else {
        throw new Error('JSON export is unavailable in this browser');
      }
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
        editor.value = await file.text();
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
      if (disclosure.open && !dirty) sync(pendingSpec || options.getSpec(), { force: true });
    });
    sync(options.getSpec());
    syncImprovement();

    return Object.freeze({
      sync,
      syncImprovement,
      apply: applyEditorValue,
      isDirty: () => dirty,
    });
  }

  function safeFilePart(value) {
    return String(value || 'world')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'world';
  }

  const api = Object.freeze({ connect, safeFilePart });
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteWorldSpecEditor = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
