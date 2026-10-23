(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteSystemDiagramFiles = api;
})(globalThis, function () {
  'use strict';
  const DRAFT_SCHEMA = 'simulatte.systemDiagramDraft.v1';
  const MAX_IMPORT_BYTES = 8 * 1024 * 1024;
  const REVOKE_DELAY_MS = 1000;

  function fileName(doc) {
    const base = String(doc?.name || doc?.id || 'system-diagram').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
    return `${base || 'system-diagram'}.json`;
  }

  function downloadJson(name, value) {
    const doc = globalThis.document;
    if (!doc) throw new Error('downloadJson requires a browser document');
    const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = doc.createElement('a');
    link.href = url; link.download = name.endsWith('.json') ? name : `${name}.json`; link.hidden = true;
    doc.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
    return link.download;
  }

  function exportDiagram(doc) { return downloadJson(fileName(doc), doc); }

  // Parsing only; the caller validates the result with SimulatteSystemDiagramDocument.validate.
  async function importFile(file) {
    if (!file || typeof file.text !== 'function') throw new Error('importFile expects a File');
    if (file.size > MAX_IMPORT_BYTES) throw new Error(`diagram file is ${file.size} bytes; the limit is ${MAX_IMPORT_BYTES}`);
    const text = await file.text();
    try { return JSON.parse(text); } catch (error) { throw new Error(`${file.name || 'file'} is not JSON: ${error.message}`); }
  }

  function defaultStorage() {
    try { return globalThis.localStorage || null; } catch { return null; }
  }

  // Storage may be missing, full or blocked (private windows, embedded previews); every access is guarded.
  function autosave(config, storage = defaultStorage()) {
    const key = config.editor.autosaveKey;
    return {
      key,
      save(doc) {
        if (!storage) return false;
        try { storage.setItem(key, JSON.stringify({ schema: DRAFT_SCHEMA, diagram: doc })); return true; } catch { return false; }
      },
      load() {
        if (!storage) return null;
        try {
          const raw = storage.getItem(key);
          if (!raw) return null;
          const record = JSON.parse(raw);
          return record?.schema === DRAFT_SCHEMA && record.diagram && typeof record.diagram === 'object' ? record.diagram : null;
        } catch { return null; }
      },
      clear() {
        if (!storage) return false;
        try { storage.removeItem(key); return true; } catch { return false; }
      },
    };
  }

  return Object.freeze({ DRAFT_SCHEMA, fileName, downloadJson, exportDiagram, importFile, autosave });
});
