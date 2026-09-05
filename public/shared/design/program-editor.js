(function attachProgramEditor(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteProgramEditor = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createProgramEditor() {
  function setStatus(element, message, state) {
    element.textContent = String(message || '');
    element.dataset.state = state;
  }

  function createDraft({ editor, apply, status }) {
    if (!editor || !apply || !status) throw new Error('program_editor_controls_missing');
    let dirty = false;
    return Object.freeze({
      isDirty: () => dirty,
      markDirty(message) {
        dirty = true;
        editor.dataset.dirty = 'true';
        apply.disabled = false;
        setStatus(status, message, 'dirty');
      },
      setValue(value) {
        editor.value = value;
        dirty = false;
        editor.dataset.dirty = 'false';
        apply.disabled = true;
      },
    });
  }

  function safeFilePart(value) {
    return String(value || 'world').trim().toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'world';
  }

  async function downloadJson(documentRoot, filename, text) {
    const view = documentRoot.defaultView;
    if (!view) throw new Error('program_editor_window_missing');
    if (!view.URL?.createObjectURL || !view.Blob) {
      if (view.navigator?.clipboard?.writeText) return view.navigator.clipboard.writeText(text);
      throw new Error('JSON export is unavailable in this browser');
    }
    const url = view.URL.createObjectURL(new view.Blob([text], { type: 'application/json' }));
    const link = documentRoot.createElement('a');
    try {
      link.href = url;
      link.download = filename;
      link.click();
    } finally {
      // Keep the URL alive until the browser has consumed the download navigation.
      view.setTimeout(() => view.URL.revokeObjectURL(url), 0);
    }
  }

  return Object.freeze({ createDraft, setStatus, safeFilePart, downloadJson });
});
