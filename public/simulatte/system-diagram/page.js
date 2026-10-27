(async function () {
  'use strict';
  const ui = globalThis.SimulatteWorldUI;
  const documents = globalThis.SimulatteSystemDiagramDocument;
  const libraryApi = globalThis.SimulatteSystemDiagramLibrary;
  const paletteApi = globalThis.SimulatteSystemDiagramPalette;
  const inspectorApi = globalThis.SimulatteSystemDiagramInspector;

  if (!paletteApi || !inspectorApi) throw Error('System Diagram editor helpers are required');
  const $ = id => document.getElementById(id), clone = value => structuredClone(value);
  const route = globalThis.SimulattePublicRoutes.forPath(location.pathname), routeState = globalThis.SimulatteRouter.parsePath(location.pathname, location.search);

  async function json(path) {
    const r = await fetch(path);
    if (!r.ok) throw Error(`Required asset unavailable: ${path}`);
    return r.json();
  }

  const profile = globalThis.SimulatteSystemDiagramProfile.validate(await json(route.profilePath), route);
  const config = await json(profile.configPath);
  const library = await libraryApi.load(config.classLibraryPath, json);

  // Populate presets dropdown
  for (const e of config.examples) {
    const o = document.createElement('option');
    o.value = e.id;
    o.textContent = e.label;
    $('preset').append(o);
  }
  const blankOption = document.createElement('option');
  blankOption.value = 'blank';
  blankOption.textContent = 'Empty canvas';
  $('preset').append(blankOption);

  const customOption = document.createElement('option');
  customOption.value = 'custom';
  customOption.textContent = 'Imported document';
  customOption.disabled = true;
  $('preset').append(customOption);
  $('preset').value = 'blank';

  const initial = documents.emptyDiagram(config);
  const model = globalThis.SimulatteSystemDiagramEditorModel.create({ diagram: initial, library, config });

  const files = globalThis.SimulatteSystemDiagramFiles;
  const fileStore = files ? files.autosave(config) : null;
  let privateCollection = null;

  function documentSignature(doc) {
    if (!doc) return '';
    const { view, ...rest } = doc;
    return JSON.stringify(rest);
  }

  let busy = false, multiSelect = false, scope = 'instance', operation = 0;
  let initialDocSig = documentSignature(model.diagram);
  let savedStorageSig = null;
  let savedDraftSig = null;
  let pendingReplacement = null;
  const loadGuard = globalThis.SimulatteSystemDiagramEditorModel.createLoadGuard(model);
  let loading = false, activePreset = 'blank';
  const buttons = {};

  function message(text, error = false) {
    const el = $('editor-status');
    if (el) { el.textContent = text; el.dataset.error = String(error); }
  }

  async function perform(action) {
    if (busy || loading) {
      message(loading ? 'A document is loading. Choose another preset to replace.' : 'Wait for current operation.', true);
      return;
    }
    busy = true;
    try {
      await action();
    } catch (e) {
      message(e.message, true);
    } finally {
      busy = false;
      document.body.dataset.operationSequence = String(++operation);
      render();
    }
  }

  function button(host, label, action, variant = 'secondary', ariaLabel = label) {
    const b = ui.SimButton({ label, ariaLabel, variant, onAction: () => perform(action), onError: e => message(e.message, true) });
    (typeof host === 'string' ? $(host) : host).append(b.element);
    return b;
  }

  function apply(command) {
    command = clone(command);
    if (command.type === 'deriveClass') { command.nodeId = command.id; delete command.id; }
    if (command.type === 'updateUserClass' && command.patch?.defaults) {
      const old = model.diagram.classes.find(c => c.id === command.id)?.defaults || {};
      command.patch.defaults = { ...Object.fromEntries(Object.keys(old).filter(k => !Object.hasOwn(command.patch.defaults, k)).map(k => [k, null])), ...command.patch.defaults };
    }
    if (command.selection && !command.ids) { command.ids = Object.values(command.selection).flat(); delete command.selection; }
    if (command.replace && ['setNodeParams', 'setEdgeParams'].includes(command.type)) {
      const current = (command.type === 'setNodeParams' ? model.diagram.nodes : model.diagram.edges).find(n => n.id === command.id)?.params || {};
      command.params = { ...Object.fromEntries(Object.keys(current).filter(k => !Object.hasOwn(command.params, k)).map(k => [k, null])), ...command.params };
      delete command.replace;
    }
    const result = model.apply(command);
    if (!result.ok) throw Error(result.error);
    const warnings = model.issues();
    message(warnings.length ? warnings.map(w => w.message).join(' · ') : ['label', 'layout'].includes(result.kind) ? 'Diagram layout updated.' : 'Diagram updated.', warnings.some(w => w.kind === 'payload-mismatch'));
    return result;
  }

  const canvas = globalThis.SimulatteSystemDiagramCanvas.create({
    host: $('diagram'), model, library, config, onMessage: message,
    onView: v => { const zs = $('zoom-status'); if (zs) zs.textContent = `${Math.round(v.zoom * 100)}%`; }
  });

  const shell = globalThis.SimulatteSystemDiagramShell.create({canvas});
  const interviewStepper = globalThis.SimulatteSystemDiagramInterviewStepper?.create({
    host: document.querySelector('.canvas-panel') || document.body,
    model,
    canvas,
    library,
    config,
    onStepChange: () => render(),
    onMessage: message,
  });

  function select() { return model.selection; }
  function selectedId() { const s = select(); return s.nodes[0] || s.edges[0] || s.groups[0] || s.notes[0] || null; }
  function erase() { apply({ type: 'deleteItems', selection: select() }); }
  function duplicate() { apply({ type: 'duplicate', selection: select() }); }

  function cluster() {
    const ids = select().nodes, ns = model.diagram.nodes.filter(n => ids.includes(n.id));
    const center = canvas.viewportCenter();
    const x = ns.length ? Math.min(...ns.map(n => n.x)) - 24 : center.x - 160;
    const y = ns.length ? Math.min(...ns.map(n => n.y)) - 40 : center.y - 120;
    const w = ns.length ? Math.max(...ns.map(n => n.x)) - x + config.editor.nodeWidth + 24 : 340;
    const h = ns.length ? Math.max(...ns.map(n => n.y)) - y + 120 : 260;
    const result = apply({ type: 'addGroup', label: 'Architecture group', kind: 'boundary', x, y, w, h, nodeIds: ids });
    if (result.id) model.select({ groups: [result.id] });
  }

  function toggleSelectedGroup() {
    const s = select(), id = s.groups[0];
    if (!id) { message('Select a group to collapse or expand.'); return; }
    const g = model.diagram.groups.find(x => x.id === id);
    if (g) apply({ type: 'setGroupCollapsed', id, collapsed: !g.collapsed });
  }

  // Edit toolbar actions
  buttons.undo = button('edit-actions', 'Undo', () => { model.undo(); message('Undid edit.'); });
  buttons.redo = button('edit-actions', 'Redo', () => { model.redo(); message('Redid edit.'); });
  const multiple = button('edit-actions', 'Select multiple', () => {
    multiSelect = !multiSelect;
    canvas.setMultiSelect(multiSelect);
    multiple.setState({ selected: multiSelect });
    multiple.element.setAttribute('aria-pressed', String(multiSelect));
    message(multiSelect ? 'Multi-select active: tap nodes to add or remove.' : 'Single-select active.');
  });
  multiple.element.setAttribute('aria-pressed', 'false');
  button('edit-actions', 'Duplicate', duplicate);
  button('edit-actions', 'Delete', erase);
  button('edit-actions', 'Group', cluster);
  buttons.fold = button('edit-actions', 'Collapse / Expand', toggleSelectedGroup);

  // Canvas view controls
  button('view-actions', '−', () => canvas.zoomBy(.8), 'quiet', 'Zoom out');
  button('view-actions', '+', () => canvas.zoomBy(1.25), 'quiet', 'Zoom in');
  button('view-actions', 'Fit', () => canvas.fit(), 'quiet');

  // Document file actions
  async function saveLocal() {
    canvas.flush();
    const isSubsystem = Boolean(subsystemEditor?.session?.active);
    const rootDoc = isSubsystem ? subsystemEditor.session.rootDiagram : model.diagram;
    const draft = isSubsystem ? subsystemEditor.getDraft() : null;

    let ok = false;
    if (privateCollection?.active) {
      try { ok = await privateCollection.saveRecord({diagram: rootDoc, subsystemDraft: draft}); } catch { ok = false; }
    } else if (fileStore) {
      ok = fileStore.save(rootDoc, draft);
    } else {
      try {
        localStorage.setItem(config.editor.autosaveKey, JSON.stringify({
          schema: 'simulatte.systemDiagramDraft.v1',
          diagram: rootDoc,
          ...(draft ? { subsystemDraft: draft } : {})
        }));
        ok = true;
      } catch {
        ok = false;
      }
    }

    if (!ok) {
      message('Storage write failed: browser storage is full or disabled.', true);
      return false;
    }

    savedStorageSig = documentSignature(rootDoc);
    savedDraftSig = draft ? documentSignature(draft.diagram) : null;
    render();
    message(privateCollection?.active ? 'Private diagram saved encrypted in this browser.' : isSubsystem ? 'Subsystem draft and root diagram saved locally.' : 'Diagram saved locally in browser.');
    return true;
  }

  function loadLocal() {
    if (privateCollection?.active) return privateCollection.restoreSaved();
    if (subsystemEditor?.session?.active) {
      message('Publish or cancel subsystem definition edits before loading another document.', true);
      return false;
    }
    const record = fileStore ? fileStore.loadRecord() : null;
    if (record) {
      loadDocumentRecord(record.diagram, record.subsystemDraft);
      return true;
    }
    try {
      const raw = localStorage.getItem(config.editor.autosaveKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const doc = parsed?.schema === 'simulatte.systemDiagramDraft.v1' ? parsed.diagram : parsed;
        const draft = parsed?.subsystemDraft || null;
        loadDocumentRecord(doc, draft);
        return true;
      }
    } catch {}
    $('load-file').click();
    return false;
  }

  function loadDocumentRecord(diagramData, subsystemDraft, privateDocument = false) {
    const diagram = documents.validate(diagramData, library, config);
    const loaded = model.replace(diagram);
    if (!loaded.ok) throw Error(loaded.error);
    privateCollection?.setActive(privateDocument);

    activePreset = config.examples.some(e => e.id === diagram.id) ? diagram.id : diagram.nodes.length ? 'custom' : 'blank';
    $('preset').value = activePreset;

    initialDocSig = documentSignature(model.diagram);
    savedStorageSig = documentSignature(model.diagram);
    savedDraftSig = null;

    if (subsystemDraft) {
      subsystemEditor.restoreDraft(subsystemDraft);
      savedDraftSig = documentSignature(subsystemDraft.diagram);
      message(`Recovered parent diagram and subsystem draft: ${subsystemDraft.label || subsystemDraft.classId}`);
    } else {
      canvas.render();
      canvas.setView(diagram.view, {restore: true});
      canvas.flush();
      render();
      interviewStepper?.onDocumentLoaded(diagram);
      message(`Loaded saved diagram: ${diagram.name || diagram.id || 'Custom architecture'}`);
    }
  }

  async function exportJson() {
    if (privateCollection?.active) return privateCollection.exportRecord({diagram: model.diagram});
    canvas.flush();
    const text = JSON.stringify(model.diagram, null, 2);
    const elDoc = $('document');
    if (elDoc) elDoc.value = text;
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })), a = document.createElement('a');
    a.href = url;
    a.download = `${model.diagram.id || 'system-diagram'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    message('Exported system diagram JSON.');
  }

  function hasUnsavedChanges() {
    if (subsystemEditor?.session?.active) {
      const draft = subsystemEditor.getDraft();
      if (!draft) return false;
      return !savedDraftSig || documentSignature(draft.diagram) !== savedDraftSig;
    }
    const currentSig = documentSignature(model.diagram);
    if (savedStorageSig && currentSig === savedStorageSig) return false;
    return currentSig !== initialDocSig;
  }

  async function promptUnsavedChanges(onProceed, onCancel) {
    if (subsystemEditor?.session?.active) {
      message('Publish or cancel subsystem definition edits before replacing the diagram.', true);
      onCancel?.();
      return;
    }
    if (!hasUnsavedChanges()) {
      onProceed();
      return;
    }
    // Automatically preserve a recoverable snapshot before replacement
    try {
      if (privateCollection?.active) await privateCollection.saveRecord({diagram: model.diagram}, true);
      else if (fileStore) fileStore.saveBackup(model.diagram);
      else {
        localStorage.setItem(`${config.editor.autosaveKey}.backup`, JSON.stringify({
          schema: 'simulatte.systemDiagramBackup.v1',
          timestamp: Date.now(),
          diagram: model.diagram,
        }));
      }
    } catch {}

    const dialog = $('unsaved-dialog');
    if (!dialog) {
      const saveChoice = window.confirm('You have unsaved changes. Save before continuing?');
      if (saveChoice) {
        if (!await saveLocal()) { onCancel?.(); return; }
      }
      onProceed();
      return;
    }

    pendingReplacement = { onProceed, onCancel };
    dialog.hidden = false;
    if (typeof dialog.showModal === 'function') {
      try { dialog.showModal(); } catch { dialog.setAttribute('open', ''); }
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function closeUnsavedDialog() {
    const dialog = $('unsaved-dialog');
    if (dialog) {
      dialog.hidden = true;
      if (typeof dialog.close === 'function') {
        try { dialog.close(); } catch {}
      } else {
        dialog.removeAttribute('open');
      }
    }
  }

  async function respondToUnsavedChanges(action) {
    if (!pendingReplacement) return false;
    const { onProceed, onCancel } = pendingReplacement;
    pendingReplacement = null;
    closeUnsavedDialog();
    if (action === 'save') {
      const ok = await saveLocal();
      if (ok) onProceed();
      else onCancel?.();
      return ok;
    }
    if (action === 'discard') {
      message('Discarded unsaved edits (backup preserved).');
      onProceed();
      return true;
    }
    onCancel?.();
    message('Cancelled document change; your edits remain.');
    return true;
  }

  const unsavedSave = $('unsaved-save');
  const unsavedDiscard = $('unsaved-discard');
  const unsavedCancel = $('unsaved-cancel');
  if (unsavedSave) unsavedSave.addEventListener('click', () => respondToUnsavedChanges('save'));
  if (unsavedDiscard) unsavedDiscard.addEventListener('click', () => respondToUnsavedChanges('discard'));
  if (unsavedCancel) unsavedCancel.addEventListener('click', () => respondToUnsavedChanges('cancel'));

  button('document-actions', 'Save', saveLocal);
  button('document-actions', 'Load', loadLocal);
  button('document-actions', 'Export', exportJson);
  button('document-actions', 'Import', () => $('load-file').click());

  // Bottom JSON drawer buttons
  const impExp = $('import-export');
  if (impExp) {
    button('import-export', 'Show JSON', () => {
      if (privateCollection?.active) throw Error('Use Export to download the encrypted private diagram.');
      $('document').value = JSON.stringify(model.diagram, null, 2);
      message('Showing diagram JSON.');
    });
    button('import-export', 'Import JSON', () => {
      promptUnsavedChanges(
        () => loadPending(JSON.parse($('document').value)),
        () => message('JSON import cancelled.')
      );
    });
    button('import-export', 'Copy JSON', async () => {
      if (privateCollection?.active) throw Error('Use Export to download the encrypted private diagram.');
      await navigator.clipboard.writeText(JSON.stringify(model.diagram, null, 2));
      message('Diagram JSON copied to clipboard.');
    });
  }

  function loadPending(v, privateDocument = false) {
    if (subsystemEditor?.session?.active) throw Error('Publish or cancel definition edits before loading another document');
    const docData = v?.schema?.startsWith?.('simulatte.systemDiagram') ? (v.diagram || v) : v;
    const diagram = documents.validate(docData, library, config);
    const loaded = model.replace(diagram);
    if (!loaded.ok) throw Error(loaded.error);
    privateCollection?.setActive(privateDocument);
    activePreset = config.examples.some(e => e.id === diagram.id) ? diagram.id : diagram.nodes.length ? 'custom' : 'blank';
    $('preset').value = activePreset;
    initialDocSig = documentSignature(model.diagram);
    const stored = fileStore ? fileStore.load() : null;
    savedStorageSig = (stored && documentSignature(stored) === initialDocSig) ? initialDocSig : null;
    savedDraftSig = null;
    canvas.render();
    canvas.fit({ readable: true });
    render();
    interviewStepper?.onDocumentLoaded(diagram);
    message(`Loaded: ${diagram.name || diagram.id || 'Custom architecture'}`);
  }

  async function readDocument(read, accept) {
    if (subsystemEditor?.session?.active) {
      $('preset').value = activePreset;
      message('Publish or cancel definition edits before loading another document.', true);
      return;
    }
    if (busy) {
      $('preset').value = activePreset;
      message('Wait for the current operation before loading a document.', true);
      return;
    }
    const token = loadGuard.begin();
    loading = true;
    message('Loading document...');
    render();
    try {
      const value = await read();
      const result = loadGuard.commit(token, () => accept(value));
      if (result === 'edited') {
        $('preset').value = activePreset;
        message('Kept your newer diagram edits.', true);
      }
    } catch (error) {
      if (loadGuard.isCurrent(token)) {
        $('preset').value = activePreset;
        message(error.message, true);
      }
    } finally {
      if (loadGuard.isCurrent(token)) {
        loading = false;
        document.body.dataset.operationSequence = String(++operation);
        render();
      }
    }
  }

  $('load-file').addEventListener('change', e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    promptUnsavedChanges(
      () => {
        readDocument(async () => {
          if (f.size > 5e6) throw Error('File exceeds 5 MB');
          const value = JSON.parse(await f.text());
          return value.schema === globalThis.SimulattePrivateCrypto.SCHEMA ? {privateRecord: await privateCollection.decodeFile(value)} : value;
        }, value => value.privateRecord ? loadDocumentRecord(value.privateRecord.diagram, value.privateRecord.subsystemDraft, true) : loadPending(value));
      },
      () => {
        message('File import cancelled.');
      }
    );
  });

  $('preset').addEventListener('change', () => {
    const value = $('preset').value;
    if (value === activePreset) return;
    promptUnsavedChanges(
      () => {
        readDocument(() => value === 'blank' ? documents.emptyDiagram(config) : json(config.examples.find(e => e.id === value).path), doc => {
          const loaded = model.replace(doc);
          if (!loaded.ok) throw Error(loaded.error);
          privateCollection?.setActive(false);
          activePreset = value;
          $('preset').value = value;
          initialDocSig = documentSignature(model.diagram);
          const stored = fileStore ? fileStore.load() : null;
          savedStorageSig = (stored && documentSignature(stored) === initialDocSig) ? initialDocSig : null;
          savedDraftSig = null;
          canvas.render();
          canvas.fit({ readable: true });
          render();
          interviewStepper?.onDocumentLoaded(doc);
          message(`Preset loaded: ${doc.name || value}`);
        });
      },
      () => {
        $('preset').value = activePreset;
      }
    );
  });

  document.addEventListener('keydown', e => {
    if (e.target.closest('input,select,textarea') || !(e.ctrlKey || e.metaKey)) return;
    if (e.key.toLowerCase() === 'z') {
      e.preventDefault();
      perform(() => { if (e.shiftKey) model.redo(); else model.undo(); });
    }
    if (e.key.toLowerCase() === 's') {
      e.preventDefault();
      perform(async () => saveLocal());
    }
  });

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function field(host, label, value, { id, choices, type = 'text', spec } = {}) {
    const wrap = el('label', '', label), input = el(choices ? 'select' : 'input', 'wui-field');
    input.id = id || `field-${label.replace(/[^a-z0-9]/gi, '-')}`;
    if (choices) {
      for (const c of choices) {
        const o = el('option', '', typeof c === 'string' ? c : c.label);
        o.value = typeof c === 'string' ? c : c.id;
        input.append(o);
      }
    } else {
      input.type = type;
      if (type === 'number') {
        input.step = spec?.type === 'integer' ? '1' : 'any';
        if (spec?.min !== undefined) input.min = spec.min;
        if (spec?.max !== undefined) input.max = spec.max;
      }
    }
    input.value = value ?? '';
    wrap.append(input);
    host.append(wrap);
    return input;
  }

  const rail = paletteApi.createRail({ host: $('palette-drawer'), library, model, canvas, config, ui, el, field, message,
    onManage: () => { subsystemTools.open = true; subsystemTools.scrollIntoView({block: 'nearest'}); },
    onInspect: classId => perform(() => subsystemEditor.session.active ? message('Publish or cancel the current definition first.', true) : subsystemEditor.open(classId)),
  });
  function palette() { rail.render(); }

  // Subsystem modularity & nested editing
  const subsystemHost = el('section', 'subsystem-library wui-control-stack');
  const subsystemTools = el('details', 'lucyd-subsystem-tools');
  subsystemTools.id = 'subsystem-tools'; subsystemTools.append(el('summary', '', 'Subsystem tools'), subsystemHost);
  $('palette').after(subsystemTools);
  const subsystemEditor = globalThis.SimulatteSystemDiagramSubsystemEditor.create({
    model, library, config, host: subsystemHost, el, field, button, apply, canvas, message, onOpen: () => {},
    onSaveDraft: () => saveLocal(),
  });

  const openProperties = new Set();
  function disclosure(host, key, title) {
    const details = ui.SimDisclosure({ document, title });
    details.dataset.propertySection = key;
    details.open = openProperties.has(key);
    details.addEventListener('toggle', () => { if (details.open) openProperties.add(key); else openProperties.delete(key); });
    host.append(details);
    return details;
  }

  function paramsForm(host, specs, values, { inherited = null, sources = null, disabled = false } = {}) {
    const result = {}, groups = inspectorApi.paramRows(specs, values, sources || {}, { maxBasic: inspectorApi.BASIC_SETTING_LIMIT });
    const build = (target, rows) => {
      for (const { key, spec } of rows) {
        const choices = spec.type === 'enum' ? [...(inherited ? [{ id: '__inherit', label: `Inherit · ${inherited[key]}` }] : []), ...spec.options] : spec.type === 'boolean' ? [...(inherited ? [{ id: '__inherit', label: `Inherit · ${inherited[key]}` }] : []), { id: 'true', label: 'Yes' }, { id: 'false', label: 'No' }] : null;
        const raw = Object.hasOwn(values, key) ? values[key] : inherited ? '__inherit' : spec.default;
        const input = field(target, `${spec.label}${spec.unit ? ' · ' + spec.unit : ''}`, raw === '__inherit' && !choices ? '' : String(raw), { id: 'property-' + key, choices, type: ['number', 'integer'].includes(spec.type) ? 'number' : 'text', spec });
        if (inherited && !choices) input.placeholder = `Inherit · ${inherited[key]}`;
        input.disabled = disabled;
        result[key] = input;
        if (sources?.[key]) input.parentElement.append(el('span', 'override-tag', inspectorApi.sourceLabel(sources[key], model.diagram, library)));
        if (spec.help) input.parentElement.append(el('span', 'property-help', spec.help));
      }
    };
    if (groups.basic.length) {
      const basic = el('section', 'basic-properties');
      basic.append(el('h3', 'scope-title', 'Configuration'));
      host.append(basic);
      build(basic, groups.basic);
    }
    if (groups.advanced.length) {
      const overrides = groups.advanced.filter(r => r.overridden).length;
      const advanced = disclosure(host, `${selectedId() || 'diagram'}:${scope}:advanced`, `Advanced settings (${groups.advanced.length}${overrides ? ` · ${overrides} overridden` : ''})`);
      advanced.classList.add('advanced-properties');
      build(advanced, groups.advanced);
    }
    return result;
  }

  function readParams(fields, specs, inherit = false) {
    const values = {};
    for (const [key, input] of Object.entries(fields)) {
      if (inherit && (input.value === '' || input.value === '__inherit')) continue;
      const spec = specs[key], raw = spec.type === 'boolean' ? input.value === 'true' : input.value, parsed = inspectorApi.parseParam(spec, raw);
      if (!parsed.ok) {
        input.setAttribute('aria-invalid', 'true');
        const hidden = input.closest('details');
        if (hidden) hidden.open = true;
        input.focus();
        throw Error(`${spec.label}: ${parsed.error}`);
      }
      input.removeAttribute('aria-invalid');
      values[key] = parsed.value;
    }
    return values;
  }

  // Properties Inspector Panel
  function properties() {
    const doc = model.diagram, s = select(), id = selectedId(), host = $('properties');
    host.replaceChildren();

    // Multi-item selection
    if (Object.values(s).flat().length > 1) {
      const total = Object.values(s).flat().length;
      $('selection-kind').textContent = `${total} items selected`;
      host.append(el('p', 'properties-note', 'Bundle components into an expandable group, duplicate, or delete.'));
      const a = el('div', 'properties-actions');
      host.append(a);
      button(a, 'Group into component', cluster, 'primary');
      button(a, 'Duplicate', duplicate);
      button(a, 'Delete selected', erase, 'danger');
      ui.adoptTree(host);
      return;
    }

    const node = doc.nodes.find(n => n.id === id);
    const edge = doc.edges.find(e => e.id === id);
    const group = doc.groups.find(g => g.id === id);
    const note = doc.notes.find(n => n.id === id);

    if (node && documents.resolveClass(node.classId, doc, library, config).kernel === 'subsystem') {
      // Subsystem node (modular expandable component)
      $('selection-kind').textContent = 'Nested Subsystem';
      subsystemEditor.inspect(host, node);
    } else if (node) {
      // Single Node
      const resolved = documents.resolveNodeParams(node, doc, library, config);
      const cls = resolved.klass, kernel = library.kernels[cls.kernel], user = doc.classes.find(c => c.id === node.classId);
      $('selection-kind').textContent = cls.label;
      host.append(el('p', 'properties-note component-description', cls.description));

      const name = field(host, 'Component label', node.label, { id: 'instance-name' });
      name.addEventListener('change', () => perform(() => apply({ type: 'setNodeLabel', id, label: name.value })));

      const choose = field(host, 'Component type', node.classId, {
        id: 'instance-class',
        choices: [...library.classOrder, ...doc.classes.map(c => c.id)].map(cid => ({ id: cid, label: documents.resolveClass(cid, doc, library, config).label }))
      });
      choose.addEventListener('change', () => perform(() => apply({ type: 'setNodeClass', id, classId: choose.value })));

      const tabs = el('div', 'scope-switch');
      host.append(tabs);
      for (const [v, label] of [['instance', 'Instance overrides'], ['class', 'Class defaults']]) {
        const b = button(tabs, label, () => { scope = v; properties(); }, 'quiet');
        b.setState({ selected: scope === v });
        b.element.setAttribute('aria-pressed', String(scope === v));
      }

      let className;
      if (scope === 'class' && user) className = field(host, 'Class name', user.label, { id: 'class-name' });
      const classParent = user ? documents.resolveClass(user.extends, doc, library, config).defaults : null;
      const fields = paramsForm(host, kernel.params, scope === 'instance' ? node.params : user ? user.defaults : cls.defaults, {
        inherited: scope === 'instance' ? cls.defaults : classParent,
        sources: scope === 'instance' ? resolved.sources : Object.fromEntries(Object.entries(cls.sources).map(([key, source]) => [key, source === user?.id ? 'class' : source])),
        disabled: scope === 'class' && !user
      });

      const actions = el('div', 'properties-actions');
      host.append(actions);
      if (scope === 'instance') {
        button(actions, 'Apply overrides', () => apply({ type: 'setNodeParams', id, params: readParams(fields, kernel.params, true), replace: true }), 'primary');
        button(actions, 'Clear overrides', () => apply({ type: 'setNodeParams', id, params: {}, replace: true }));
      } else if (user) {
        button(actions, 'Apply class defaults', () => apply({ type: 'updateUserClass', id: user.id, patch: { label: className.value, defaults: readParams(fields, kernel.params, true) } }), 'primary');
      }
      button(actions, 'Create reusable class', () => {
        const r = apply({ type: 'deriveClass', id, label: cls.label + ' custom' });
        scope = 'class';
        if (r.id) model.select({ nodes: [id] });
        properties();
      });

      host.append(el('p', 'properties-note', 'Ports: ' + kernel.ports.map(p => `${p.id} (${p.direction}: ${(p.accepts || p.emits).join(', ')})`).join(' · ')));

      const groupSelect = field(host, 'Group membership', node.groupId || '', {
        id: 'instance-group',
        choices: [{ id: '', label: 'No group (independent)' }, ...doc.groups.map(g => ({ id: g.id, label: `${g.label} (${g.kind})` }))]
      });
      groupSelect.addEventListener('change', () => perform(() => apply({ type: 'setNodeGroup', id, groupId: groupSelect.value || null })));
    } else if (edge) {
      // Connecting Edge
      $('selection-kind').textContent = 'Connection';
      const label = field(host, 'What flows here', edge.label || '', { id: 'connection-label' });
      label.maxLength = config.bounds.maxLabelLength;
      label.placeholder = 'e.g. Stream chunks or Event messages';
      label.addEventListener('change', () => perform(() => apply({ type: 'setEdgeLabel', id, label: label.value })));

      const endpoints = {};
      for (const side of ['from', 'to']) {
        const direction = side === 'from' ? 'out' : 'in', choices = [];
        for (const n of doc.nodes) {
          const c = documents.resolveClass(n.classId, doc, library, config);
          for (const p of (c.ports || library.kernels[c.kernel].ports).filter(p => p.direction === direction)) {
            choices.push({ id: `${n.id}|${p.id}`, label: `${n.label || n.id} · ${p.id}` });
          }
        }
        endpoints[side] = field(host, side === 'from' ? 'Source port (out)' : 'Target port (in)', `${edge[side].nodeId}|${edge[side].portId}`, { id: 'link-' + side, choices });
      }

      const resolved = documents.resolveEdgeParams(edge, library), fields = paramsForm(host, library.edgeParams, resolved.values);
      const actions = el('div', 'properties-actions');
      host.append(actions);
      button(actions, 'Apply connection', () => {
        const from = endpoints.from.value.split('|'), to = endpoints.to.value.split('|');
        apply({ type: 'reconnect', id, from: { nodeId: from[0], portId: from[1] }, to: { nodeId: to[0], portId: to[1] }, params: readParams(fields, library.edgeParams) });
      }, 'primary');
    } else if (group) {
      // Expandable / Collapsible Group
      $('selection-kind').textContent = group.kind === 'resource' ? 'Resource cluster' : 'Component group';
      const name = field(host, 'Group label', group.label, { id: 'cluster-name' });
      name.addEventListener('change', () => perform(() => apply({ type: 'updateGroup', id, patch: { label: name.value } })));

      const kind = field(host, 'Group type', group.kind, { id: 'cluster-kind', choices: ['boundary', 'resource', 'zone', 'region'] });
      const slots = field(host, 'Shared capacity slots', group.capacity ?? 2, { id: 'cluster-capacity', type: 'number', spec: { type: 'integer', min: 1, max: 64 } });
      slots.disabled = group.kind !== 'resource';
      kind.addEventListener('change', () => {
        slots.disabled = kind.value !== 'resource';
        perform(() => apply({ type: 'updateGroup', id, patch: { kind: kind.value, ...(kind.value === 'resource' ? { capacity: Number(slots.value) } : { capacity: undefined }) } }));
      });
      slots.addEventListener('change', () => perform(() => apply({ type: 'updateGroup', id, patch: { capacity: Number(slots.value) } })));

      host.append(el('p', 'properties-note', 'Boundary groups bundle related components together. Click the fold button on the canvas or below to collapse or expand.'));

      const a = el('div', 'properties-actions');
      host.append(a);
      // Direct Expand/Collapse Button
      button(a, group.collapsed ? 'Expand group [＋]' : 'Collapse group [−]', () => apply({ type: 'setGroupCollapsed', id, collapsed: !group.collapsed }), 'primary');
      button(a, 'Ungroup', () => apply({ type: 'deleteItems', selection: { groups: [id] } }));
    } else if (note) {
      // Text Note
      $('selection-kind').textContent = 'Note';
      const text = field(host, 'Note text', note.text, { id: 'note-text' });
      text.maxLength = config.bounds.maxNoteLength;
      text.addEventListener('change', () => perform(() => apply({ type: 'updateNote', id, patch: { text: text.value } })));
    } else {
      // Root Diagram properties
      $('selection-kind').textContent = 'Diagram';
      host.append(el('p', 'properties-note', 'Drag components from the library and connect ports. Group components to create expandable boundaries.'));
      const name = field(host, 'Diagram title', doc.name || 'Architecture diagram', { id: 'diagram-name' });
      name.addEventListener('change', () => perform(() => apply({ type: 'setMeta', patch: { name: name.value } })));

      const stats = el('div', 'properties-note', `${doc.nodes.length} components · ${doc.edges.length} connections · ${doc.groups.length} groups`);
      host.append(stats);
    }

    if (id) {
      const a = el('div', 'properties-actions');
      host.append(a);
      button(a, 'Delete selected', erase, 'danger');
    }
    ui.adoptTree(host);
  }

  function render() {
    palette();
    buttons.undo.setState({ disabled: !model.canUndo() });
    buttons.redo.setState({ disabled: !model.canRedo() });

    const currentSig = documentSignature(model.diagram);
    const isSubsystem = Boolean(subsystemEditor?.session?.active);

    let statusText = 'Ready';
    let isPending = false;

    if (isSubsystem) {
      const isDraftClean = savedDraftSig && currentSig === savedDraftSig;
      statusText = isDraftClean ? 'Saved draft' : 'Unsaved subsystem draft';
      isPending = !isDraftClean;
    } else {
      const isSaved = savedStorageSig && currentSig === savedStorageSig;
      const isUnmodified = currentSig === initialDocSig;
      if (isSaved) {
        statusText = 'Saved';
        isPending = false;
      } else if (isUnmodified) {
        statusText = 'Ready';
        isPending = false;
      } else {
        statusText = 'Unsaved changes';
        isPending = true;
      }
    }

    const rev = $('revision');
    if (rev) {
      rev.textContent = statusText;
      rev.dataset.pending = String(isPending);
    }
    document.body.dataset.pending = String(isPending);
    document.body.dataset.loading = String(loading);
    document.body.dataset.graphNodes = String(model.diagram.nodes.length);
    properties();
  }

  model.subscribe(event => {
    if (event.kind !== 'view') {
      subsystemEditor.render();
      render();
    }
    if (!['selection', 'view'].includes(event.kind)) {
      const issues = model.issues();
      if (issues.length) message(issues.map(i => i.message).join(' · '), issues.some(i => i.kind === 'payload-mismatch'));
    }
  });

  ui.adoptTree(document.body);
  subsystemEditor.render();
  render();
  shell.updateInsets();
  const stored = fileStore?.readStatus();
  let recoveryError = stored && !['ready', 'missing'].includes(stored.state) ? `Saved diagram could not be read: ${stored.error} Stored data was retained.` : '';
  const storedRecord = stored?.record;
  if (storedRecord && location.search.includes('recover=true')) {
    try { loadDocumentRecord(storedRecord.diagram, storedRecord.subsystemDraft); }
    catch (error) { recoveryError = `Saved diagram could not be restored: ${error.message}. The stored copy was retained.`; }
  } else canvas.fit({ readable: true });
  canvas.flush();
  initialDocSig = documentSignature(model.diagram);
  render();
  interviewStepper?.onDocumentLoaded(model.diagram);

  privateCollection = globalThis.SimulattePrivateCollection.create({
    document, sourcePath: config.privateCollectionPath,
    onLoad: (record, isPrivate) => loadDocumentRecord(record.diagram, record.subsystemDraft, isPrivate),
    requestLoad: action => new Promise(resolve => promptUnsavedChanges(() => { action(); resolve(true); }, () => resolve(false))),
    getRecord: () => ({diagram: subsystemEditor?.session?.active ? subsystemEditor.session.rootDiagram : model.diagram, subsystemDraft: subsystemEditor?.getDraft?.() || null}),
    onClear: () => {
      while (subsystemEditor?.session?.active) subsystemEditor.session.cancel();
      loadPending(documents.emptyDiagram(config)); $('document').value = '';
    },
    onMessage: message,
  });
  button('document-actions', 'Private collection (Databricks IC6)', () => privateCollection.open());

  globalThis.SimulatteSystemDiagramEditor = Object.freeze({
    document: () => clone(model.diagram),
    selection: () => clone(select()),
    viewport: () => canvas.getView(),
    shell,
    saveLocal,
    loadLocal,
    hasUnsavedChanges,
    respondToUnsavedChanges,
    subsystemDraft: () => subsystemEditor?.getDraft?.() || null,
    backup: () => fileStore?.loadBackup?.() || null,
    canvas,
    model,
    subsystemEditor,
    interviewStepper,
  });

  document.body.dataset.simulationProfile = profile.id;
  document.body.dataset.editorReady = 'true';
  message(recoveryError || 'Lucyd ready.', Boolean(recoveryError));
})().catch(e => {
  const s = document.getElementById('editor-status');
  if (s) { s.textContent = `Unable to open editor: ${e.message}`; s.dataset.error = 'true'; }
});
