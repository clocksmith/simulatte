(async function () {
  'use strict';
  const graph = globalThis.SimulatteGraphDocument, runtime = globalThis.SimulatteGraphRuntime;
  const sessions = globalThis.SimulatteDiagramEditorSession, ui = globalThis.SimulatteWorldUI;
  const $ = id => document.getElementById(id), clone = value => structuredClone(value);
  const route = globalThis.SimulattePublicRoutes.forPath(location.pathname);
  const state = globalThis.SimulatteRouter.parsePath(location.pathname, location.search);
  const response = await fetch(route.profilePath); if (!response.ok) throw Error('System Diagram profile unavailable');
  const profile = globalThis.SimulatteSystemDiagramProfile.validate(await response.json(), { route, model: runtime.MODEL });
  if (state.simulation?.scenarioId || state.simulation?.mission || Object.keys(state.simulation?.parameters || {}).length) throw Error('This editor accepts seed in its URL; load a document for authored inputs');
  const seed = state.simulation?.seed === null || state.simulation?.seed === undefined ? profile.defaultSeed : Number(state.simulation.seed);
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw Error('Seed must be an unsigned 32-bit integer');
  const initial = graph.create(profile.defaultPreset); initial.workload.seed = seed;
  const session = sessions.create(initial);
  let engine = null, running = false, selected = [], scope = 'instance', requestId = null, checkpoint = null;
  let multiSelect = false;
  let imported = null, lastInspector = '', operation = 0;
  const controls = {};
  function message(text, error = false) { $('editor-status').textContent = text; $('editor-status').dataset.error = String(error); }
  function perform(action) {
    try { action(); document.body.dataset.operationSequence = String(++operation); }
    catch (error) { running = false; message(error.message, true); document.body.dataset.operationSequence = String(++operation); }
    render();
  }
  function button(host, label, action, variant = 'secondary', ariaLabel = label) {
    const b = ui.SimButton({ label, ariaLabel, variant, onAction: () => perform(action), onError: error => message(error.message, true) });
    (typeof host === 'string' ? $(host) : host).append(b.element); return b;
  }
  const canvas = globalThis.SimulatteGraphCanvas.create({ host: $('diagram'), onEdit: action => perform(() => canvasEdit(action)), onSelect: ids => { selected = ids; scope = 'instance'; properties(); renderCanvas(); renderState(); }, onMessage: message, onView: view => { $('zoom-status').textContent = `${Math.round(view.zoom * 100)}%`; } });
  function changed(operation, note = 'Architecture updated. Run accepts and restarts it; the current run stays unchanged.') {
    session.change(operation); imported = null; lastInspector = ''; palette(); properties(); message(note);
  }
  function canvasEdit(action) {
    if (action.type === 'add') { let id; changed(doc => { id = graph.addNode(doc, action.classId, action.x, action.y); }); selected = [id]; }
    else if (action.type === 'move') changed(doc => action.positions.forEach(p => { const n = doc.nodes.find(n => n.id === p.id); if (n) { n.x = Math.round(p.x); n.y = Math.round(p.y); } }));
    else if (action.type === 'connect') changed(doc => { graph.connect(doc, { from: action.from, to: action.to, fromPort: action.fromPort || 'out', toPort: action.toPort || 'in', capacity: 100, latency: 0.02 }); });
    else if (action.type === 'reconnect') changed(doc => { const link = doc.links.find(l => l.id === action.id); const next = { ...link, from: action.from, to: action.to, fromPort: action.fromPort || 'out', toPort: action.toPort || 'in' }; graph.validateConnection(doc, next, action.id); Object.assign(link, next); });
    else if (action.type === 'delete') remove(action.ids);
    else if (action.type === 'duplicate') duplicate(action.ids);
    else if (action.type === 'group') group(action.ids);
    properties();
  }
  function remove(ids = selected) { changed(doc => ids.forEach(id => graph.remove(doc, id))); selected = []; properties(); }
  function duplicate(ids = selected) { const next = []; changed(doc => ids.filter(id => doc.nodes.some(n => n.id === id)).forEach(id => next.push(graph.duplicate(doc, id)))); selected = next; properties(); }
  function group(ids = selected) {
    changed(doc => { const members = doc.nodes.filter(n => ids.includes(n.id)); if (members.length < 2) throw Error('Shift-select two or more processing nodes to create a cluster');
      if (members.some(n => graph.SOURCES.includes(graph.resolveNode(doc, n).type))) throw Error('Clients and schedulers do not consume cluster worker slots');
      const id = session.allocate(doc, 'cluster'); doc.clusters.push({ id, label: 'Worker cluster', capacity: 2 }); members.forEach(n => { n.clusterId = id; }); selected = [id]; });
  }
  function acceptRun() {
    const doc = session.document(); graph.validate(doc, { execution: true });
    const next = runtime.create(doc); session.accept(); engine = next; checkpoint = null; requestId = null; lastInspector = ''; running = true;
    message(`Running accepted architecture r${doc.revision}, seed ${doc.workload.seed}.`);
  }
  controls.undo = button('edit-actions', 'Undo', () => { session.undo(); selected = []; palette(); properties(); message('Undid document edit.'); });
  controls.redo = button('edit-actions', 'Redo', () => { session.redo(); selected = []; palette(); properties(); message('Redid document edit.'); });
  const multiple = button('edit-actions', 'Select multiple', () => { multiSelect = !multiSelect; canvas.setMultiSelect(multiSelect); multiple.setState({ selected: multiSelect }); multiple.element.setAttribute('aria-pressed', String(multiSelect)); message(multiSelect ? 'Tap nodes to add or remove them from the selection.' : 'Single selection enabled.'); });
  multiple.element.setAttribute('aria-pressed', 'false');
  button('edit-actions', 'Duplicate', () => duplicate()); button('edit-actions', 'Delete', () => remove()); button('edit-actions', 'Cluster', () => group());
  button('view-actions', '−', () => canvas.zoomBy(0.8), 'quiet', 'Zoom out'); button('view-actions', '+', () => canvas.zoomBy(1.25), 'quiet', 'Zoom in'); button('view-actions', 'Fit', () => canvas.fit(), 'quiet');
  button('document-actions', 'Save', () => {
    localStorage.setItem('simulatte.systemDiagram.document.v2', JSON.stringify(exportSession())); message('Saved document and accepted replay locally in this browser.');
  });
  button('document-actions', 'Load', () => {
    const saved = localStorage.getItem('simulatte.systemDiagram.document.v2'); if (!saved) { $('load-file').click(); return; }
    loadPending(JSON.parse(saved));
  });
  button('document-actions', 'Export', () => {
    const value = exportSession(), content = JSON.stringify(value, null, 2); $('document').value = content;
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' })), a = document.createElement('a'); a.href = url; a.download = 'system-diagram.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
    message('Exported document, class definitions, overrides and accepted replay.');
  });
  controls.run = button('playback', 'Run', acceptRun, 'primary');
  controls.pause = button('playback', 'Pause', () => { running = !running; if (!engine) throw Error('Run an architecture first'); });
  button('playback', 'Step 1 s', () => { if (!engine) { acceptRun(); } running = false; engine.runUntil(Math.min(60, engine.snapshot().time + 1)); });
  button('playback', 'Reset', () => { running = false; if (engine) engine = runtime.create(session.accepted()); checkpoint = null; requestId = null; lastInspector = ''; message('Reset the accepted architecture. Pending edits remain separate.'); });
  button('playback', 'Replay', () => { if (!engine) throw Error('Run an architecture first'); const time = engine.snapshot().time; const replay = runtime.create(session.accepted()); replay.runUntil(time); const match = JSON.stringify(replay.snapshot()) === JSON.stringify(engine.snapshot()); if (!match) throw Error('Replay diverged'); engine = replay; running = false; message(`Exact seeded replay matched at ${time.toFixed(2)} s.`); });
  button('playback', 'Checkpoint', () => { if (!engine) throw Error('Run an architecture first'); running = false; checkpoint = engine.checkpoint(); message('Checkpoint saved with pending events, resources, retries and RNG state.'); });
  button('playback', 'Restore', () => { if (!engine || !checkpoint) throw Error('Save a checkpoint first'); running = false; engine.restore(checkpoint); message('Restored checkpoint on the same accepted architecture.'); });
  function exportSession() { return session.export({ time: engine?.snapshot().time || 0, checkpoint: engine?.checkpoint() || null }); }
  function loadPending(value) { const parsed = sessions.read(value); session.replace(parsed.document); imported = parsed; selected = []; running = false; palette(); properties(); renderCanvas(); canvas.fit(); message('Loaded as pending. Run starts the document; Restore loaded replay explicitly restores the saved accepted run.'); }
  button('import-export', 'Import JSON', () => loadPending(JSON.parse($('document').value)));
  button('import-export', 'Open file', () => $('load-file').click());
  button('import-export', 'Show JSON', () => { $('document').value = JSON.stringify(exportSession(), null, 2); message('Document JSON includes pending edits and separately accepted execution.'); });
  button('import-export', 'Restore loaded replay', () => {
    if (!imported?.accepted || !imported.checkpoint) throw Error('Load a document with a saved accepted replay first');
    const value = clone(imported), next = runtime.create(value.accepted); next.restore(value.checkpoint);
    if (Math.abs(next.snapshot().time - value.time) > 1e-9) throw Error('Saved replay time does not match checkpoint');
    const pending = session.document(); session.replace(value.accepted); session.accept(); session.replace(pending); engine = next; running = false; checkpoint = clone(value.checkpoint); imported = null; lastInspector = ''; message('Restored saved accepted run. Loaded pending edits stay separate.');
  });
  $('load-file').addEventListener('change', async e => { const file = e.target.files[0]; if (!file) return; if (file.size > 5e6) { message('Document file exceeds 5 MB', true); return; } try { const text = await file.text(); perform(() => loadPending(JSON.parse(text))); } catch (error) { message(error.message, true); } e.target.value = ''; });
  $('preset').addEventListener('change', () => perform(() => { session.replace(graph.create($('preset').value)); selected = []; running = false; palette(); properties(); renderCanvas(); canvas.fit(); message('Starter loaded as pending. Undo restores your previous document.'); }));
  document.addEventListener('keydown', e => {
    if (e.target.closest('input,select,textarea') || !(e.ctrlKey || e.metaKey)) return;
    if (e.key.toLowerCase() === 'z') { e.preventDefault(); perform(() => { if (e.shiftKey) session.redo(); else session.undo(); selected = []; palette(); properties(); }); }
    if (e.key.toLowerCase() === 's') { e.preventDefault(); localStorage.setItem('simulatte.systemDiagram.document.v2', JSON.stringify(exportSession())); message('Saved locally.'); }
  });
  const SYMBOLS = { client: 'CL', cpu: 'C', gpu: 'G', queue: 'Q', rpc: '↔', database: 'DB', replica: 'R', scheduler: 'CR', crawler: 'W', rag: 'RE', model: 'M' };
  let paletteKey = '';
  function palette() {
    const doc = session.document(), key = JSON.stringify(doc.classes.map(c => [c.id, c.label])); if (key === paletteKey) return; paletteKey = key; $('palette').replaceChildren();
    doc.classes.forEach(cls => {
      const b = ui.SimButton({ label: cls.label, variant: 'quiet', onAction: () => {}, ariaLabel: `Add ${cls.label}` }).element; b.classList.add('palette-item'); b.dataset.classId = cls.id; b.dataset.type = cls.type;
      b.replaceChildren(); const icon = document.createElement('span'); icon.className = 'component-icon'; icon.textContent = SYMBOLS[cls.type]; const label = document.createElement('span'); label.textContent = cls.label; b.append(icon, label);
      let start = null, ghost = null, moved = false;
      b.addEventListener('pointerdown', e => { if (e.button !== 0) return; start = { x: e.clientX, y: e.clientY, pointerId: e.pointerId }; moved = false; b.setPointerCapture(e.pointerId); });
      b.addEventListener('pointermove', e => { if (!start) return; if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 7) moved = true; if (!moved) return;
        if (!ghost) { ghost = document.createElement('div'); ghost.className = 'drop-preview'; ghost.textContent = cls.label; document.body.append(ghost); } ghost.style.left = `${e.clientX + 12}px`; ghost.style.top = `${e.clientY - 16}px`;
      });
      b.addEventListener('pointerup', e => { if (!start) return; const rect = $('diagram').getBoundingClientRect();
        if (moved) { if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) canvas.dropClassAt(cls.id, e.clientX, e.clientY); else message('Drop components inside the canvas.'); }
        else { const p = canvas.positionAt(rect.left + rect.width / 2, rect.top + rect.height / 2); perform(() => canvasEdit({ type: 'add', classId: cls.id, x: p.x, y: p.y })); }
        start = null; ghost?.remove(); ghost = null;
      });
      b.addEventListener('pointercancel', () => { start = null; ghost?.remove(); ghost = null; });
      b.addEventListener('keydown', e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); const rect = $('diagram').getBoundingClientRect(), p = canvas.positionAt(rect.left + rect.width / 2, rect.top + rect.height / 2); perform(() => canvasEdit({ type: 'add', classId: cls.id, x: p.x, y: p.y })); } });
      $('palette').append(b);
    });
  }
  function element(name, className, text) { const e = document.createElement(name); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; }
  function field(host, label, value, options = {}) {
    const wrap = element('label', '', label), input = element(options.choices ? 'select' : 'input', 'wui-field');
    input.id = options.id || `property-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (options.choices) for (const c of options.choices) { const o = element('option', '', typeof c === 'string' ? c : c.label); o.value = typeof c === 'string' ? c : c.id; input.append(o); }
    else { input.type = options.type || 'number'; if (input.type === 'number') input.step = options.integer ? '1' : 'any'; if (options.min !== undefined) input.min = options.min; }
    input.value = value === null ? '' : value; if (options.readOnly) input.readOnly = true; wrap.append(input); host.append(wrap); return input;
  }
  const PROPERTY_LABELS = { serviceTime: 'Service time · seconds', concurrency: 'Concurrent slots', queueCapacity: 'Waiting capacity', memoryMiB: 'Memory per attempt · MiB', memoryLimitMiB: 'Memory budget · MiB', retries: 'Retry budget', retryDelay: 'Retry delay · seconds', failureAt: 'Failure at · seconds', recoveryAt: 'Recovery at · seconds', outputType: 'Output payload', spawnCount: 'Synthetic items per input' };
  function properties() {
    const doc = session.document(), host = $('properties'); host.replaceChildren();
    const item = [...doc.nodes, ...doc.links, ...doc.clusters].find(n => n.id === selected[0]);
    if (selected.length > 1) {
      $('selection-kind').textContent = `${selected.length} selected`; host.append(element('p', 'properties-note', 'Create a shared concurrency cluster, duplicate or remove the selection.'));
      const actions = element('div', 'properties-actions'); host.append(actions); button(actions, 'Create cluster', () => group()); button(actions, 'Duplicate nodes', () => duplicate()); return;
    }
    if (!item) { $('selection-kind').textContent = 'Workload'; workloadProperties(host, doc); return; }
    if (Object.hasOwn(item, 'classId')) {
      const resolved = graph.resolveNode(doc, item), cls = doc.classes.find(c => c.id === item.classId);
      const actual = element('p', 'properties-note'); actual.id = 'node-state'; host.append(actual);
      $('selection-kind').textContent = resolved.type; host.append(element('div', 'wui-status', item.id));
      const name = field(host, 'Instance name', item.label, { type: 'text', id: 'instance-name' }); name.addEventListener('change', () => perform(() => changed(d => { d.nodes.find(n => n.id === item.id).label = name.value; })));
      const classSelect = field(host, 'Node class', item.classId, { choices: doc.classes.map(c => ({ id: c.id, label: c.label })), id: 'instance-class' });
      classSelect.addEventListener('change', () => perform(() => changed(d => { const n = d.nodes.find(n => n.id === item.id); n.classId = classSelect.value; n.overrides = {}; })));
      const switcher = element('div', 'scope-switch'); host.append(switcher);
      for (const [value, label] of [['instance', 'Instance overrides'], ['class', 'Class defaults']]) { const b = button(switcher, label, () => { scope = value; properties(); }, scope === value ? 'primary' : 'secondary'); b.element.setAttribute('aria-pressed', String(scope === value)); }
      host.append(element('p', 'properties-note', scope === 'class' ? `Changes affect all ${doc.nodes.filter(n => n.classId === cls.id).length} instances of ${cls.label}, except overridden fields.` : 'Blank fields inherit class defaults. Overrides apply only to this node.'));
      let labelInput;
      if (scope === 'class') labelInput = field(host, 'Class name', cls.label, { type: 'text', id: 'class-name' });
      const failureMode = scope === 'instance' ? field(host, 'Failure schedule', item.overrides.failureAt === null && item.overrides.recoveryAt === null ? 'disabled' : Object.hasOwn(item.overrides, 'failureAt') ? 'override' : 'inherit', { choices: [{id:'inherit',label:'Inherit class schedule'},{id:'override',label:'Override this instance'},{id:'disabled',label:'Disable this instance outage'}], id:'failure-mode' }) : null;
      const fields = {};
      graph.PROPERTY_KEYS.forEach(key => {
        const parent = element('div'); host.append(parent);
        const value = scope === 'class' ? cls.defaults[key] : Object.hasOwn(item.overrides, key) ? item.overrides[key] : null;
        const choices = key === 'outputType' ? [...(scope === 'instance' ? [{ id: 'inherit', label: `Inherit · ${cls.defaults[key]}` }] : []), 'preserve', ...graph.PAYLOAD_TYPES] : undefined;
        fields[key] = field(parent, PROPERTY_LABELS[key], key === 'outputType' && value === null ? 'inherit' : value, { choices, id: `property-${key}`, integer: ['concurrency', 'queueCapacity', 'retries', 'spawnCount'].includes(key) });
        if (failureMode && ['failureAt', 'recoveryAt'].includes(key)) fields[key].addEventListener('input', () => { failureMode.value = 'override'; });
        if (scope === 'instance' && key !== 'outputType') fields[key].placeholder = `Inherit · ${cls.defaults[key] === null ? 'none' : cls.defaults[key]}`;
        if (scope === 'instance' && Object.hasOwn(item.overrides, key)) parent.append(element('span', 'override-tag', 'Instance override'));
      });
      const ports = {};
      if (scope === 'class') {
        host.append(element('div', 'scope-title', 'Typed ports'));
        for (const direction of ['in', 'out']) {
          const wrap = element('label', '', `${direction === 'in' ? 'Accepted' : 'Produced'} payload types`), input = element('select', 'wui-field'); input.multiple = true; input.id = `ports-${direction}`;
          for (const type of graph.PAYLOAD_TYPES) { const o = element('option', '', type); o.value = type; o.selected = cls.ports[direction].includes(type); input.append(o); }
          if (direction === 'in' && graph.SOURCES.includes(cls.type)) input.disabled = true; wrap.append(input); host.append(wrap); ports[direction] = input;
        }
      } else host.append(element('p', 'properties-note', `Input: ${cls.ports.in.join(', ') || 'source only'} · Output: ${cls.ports.out.join(', ')}`));
      const actions = element('div', 'properties-actions'); host.append(actions);
      button(actions, scope === 'class' ? 'Apply class defaults' : 'Apply overrides', () => {
        const targetScope = scope;
        changed(d => {
          const node = d.nodes.find(n => n.id === item.id), def = d.classes.find(c => c.id === node.classId), values = {};
          for (const key of graph.PROPERTY_KEYS) { const raw = fields[key].value;
            if (targetScope === 'instance' && (raw === '' || raw === 'inherit')) continue;
            values[key] = key === 'outputType' ? raw : raw === '' && ['failureAt', 'recoveryAt'].includes(key) ? null : Number(raw);
          }
          if (targetScope === 'class') { def.label = labelInput.value; def.defaults = values; def.ports = { in: [...ports.in.selectedOptions].map(o => o.value), out: [...ports.out.selectedOptions].map(o => o.value) }; }
          else {
            if (failureMode.value === 'inherit') { delete values.failureAt; delete values.recoveryAt; }
            else if (failureMode.value === 'disabled') { values.failureAt = null; values.recoveryAt = null; }
            else if (!Number.isFinite(values.failureAt) || !Number.isFinite(values.recoveryAt)) throw Error('Enter both failure and recovery times for the instance override');
            node.overrides = values;
          }
        });
      }, 'primary');
      if (scope === 'instance') button(actions, 'Clear overrides', () => changed(d => { d.nodes.find(n => n.id === item.id).overrides = {}; }));
      button(actions, 'Create reusable class', () => {
        changed(d => { const node = d.nodes.find(n => n.id === item.id), original = d.classes.find(c => c.id === node.classId), id = session.allocate(d, 'class');
          d.classes.push({ ...clone(original), id, label: `${original.label} custom`.slice(0, 80), defaults: { ...original.defaults, ...node.overrides } }); node.classId = id; node.overrides = {}; }); scope = 'class'; properties();
      });
      const groupSelect = field(host, 'Cluster', item.clusterId || '', { choices: [{ id: '', label: 'No cluster' }, ...doc.clusters.map(c => ({ id: c.id, label: c.label }))], id: 'instance-cluster' });
      groupSelect.addEventListener('change', () => perform(() => changed(d => { d.nodes.find(n => n.id === item.id).clusterId = groupSelect.value || null; })));
    } else if (Object.hasOwn(item, 'from')) {
      $('selection-kind').textContent = 'Typed connection'; host.append(element('div', 'wui-status', item.id));
      const from = field(host, 'Output node', item.from, { choices: doc.nodes.map(n => ({ id: n.id, label: n.label })), id: 'link-from' });
      const to = field(host, 'Input node', item.to, { choices: doc.nodes.map(n => ({ id: n.id, label: n.label })), id: 'link-to' });
      const rate = field(host, 'Capacity · MiB/s', item.capacity, { id: 'link-capacity' }), latency = field(host, 'Latency · seconds', item.latency, { id: 'link-latency' });
      host.append(element('p', 'properties-note', 'Payloads serialize FIFO over this link. Reconnect the endpoint handles on the canvas, or change nodes here. Incompatible types are refused.'));
      const actions = element('div', 'properties-actions'); host.append(actions); button(actions, 'Apply connection', () => changed(d => {
        const next = { ...item, from: from.value, to: to.value, capacity: Number(rate.value), latency: Number(latency.value) }; graph.validateConnection(d, next, item.id); Object.assign(d.links.find(l => l.id === item.id), next);
      }), 'primary');
    } else {
      $('selection-kind').textContent = 'Shared cluster'; host.append(element('div', 'wui-status', item.id));
      const label = field(host, 'Cluster name', item.label, { type: 'text', id: 'cluster-name' }), slots = field(host, 'Shared concurrent slots', item.capacity, { integer: true, id: 'cluster-capacity' });
      host.append(element('p', 'properties-note', 'Members contend for these slots in addition to their own limits. This grouping does not imply a network zone, durability or a correlated failure domain.'));
      const actions = element('div', 'properties-actions'); host.append(actions); button(actions, 'Apply cluster', () => changed(d => Object.assign(d.clusters.find(c => c.id === item.id), { label: label.value, capacity: Number(slots.value) })), 'primary');
    }
    const bottom = element('div', 'properties-actions'); host.append(bottom); button(bottom, 'Delete selected', () => remove(), 'danger');
    ui.adoptTree(host);
  }
  function workloadProperties(host, doc) {
    host.append(element('p', 'properties-note', 'Select a node, connection or cluster to configure it. Class definitions are reusable; instances inherit defaults until overridden.'));
    const fields = {};
    for (const [key, label] of [['seed', 'Replay seed'], ['count', 'Requests per source'], ['interval', 'Arrival interval · seconds'], ['deadline', 'Deadline · seconds'], ['payloadMiB', 'Payload size · MiB']]) fields[key] = field(host, label, doc.workload[key], { id: `workload-${key}`, integer: ['seed', 'count'].includes(key) });
    fields.payloadType = field(host, 'Input payload', doc.workload.payloadType, { choices: graph.PAYLOAD_TYPES, id: 'workload-payloadType' });
    const actions = element('div', 'properties-actions'); host.append(actions); button(actions, 'Apply workload', () => changed(d => { for (const [k, input] of Object.entries(fields)) d.workload[k] = k === 'payloadType' ? input.value : Number(input.value); }), 'primary');
    host.append(element('p', 'properties-note', 'Each client or cron source emits this finite workload. Payload types model compatibility, not natural-language meaning or real data quality. Run horizon: 60 simulated seconds.'));
    ui.adoptTree(host);
  }
  const requestButtons = new Map();
  const requestInspector = ui.SimInspector({ host: $('inspector'), placement: 'inline', onSelect: id => { requestId = id; renderState(); }, onAction: () => {}, prominentFields: ['status', 'blocker', 'attempts', 'effects'] });
  function renderCanvas() {
    const snapshot = engine?.snapshot(); canvas.setDocument(session.document(), { selectedIds: selected, states: snapshot ? { nodes: snapshot.nodes, links: snapshot.links } : {}, pending: session.dirty() && !!engine });
    const v = canvas.viewport(); $('zoom-status').textContent = `${Math.round((v.scale || v.zoom || 1) * 100)}%`;
  }
  function renderState() {
    const snap = engine?.snapshot(), m = snap?.metrics || {};
    const actual = $('node-state'); if (actual) { const n = snap?.nodes.find(n => n.id === selected[0]); actual.textContent = n ? `Accepted run: ${n.online ? 'online' : 'offline'} · ${n.active} active · ${n.queued} queued · ${n.memoryMiB} MiB held · ${n.completed} services completed` : 'Not present in an accepted run.'; }
    const values = [['Completed / offered', `${m.completed || 0} / ${m.offered || 0}`], ['Rejected', m.rejected || 0], ['Unfinished', m.unfinished || 0], ['Deadline misses', m.deadlineMisses || 0], ['Retained MiB', m.memoryMiB ?? m.memory ?? 0], ['Committed effects', m.effects || 0]];
    $('metrics').replaceChildren(...values.map(([subject, value]) => ui.SimMetric({ data: { subject, value, unit: '', timeBasis: `${(snap?.time || 0).toFixed(2)} s`, freshness: 'fresh', validity: 'synthetic-model', level: 'supporting' } }).element));
    $('status').textContent = snap ? `${snap.time.toFixed(2)} / 60 s · ${running ? 'running' : 'paused'} · accepted r${session.accepted().revision} · seed ${session.accepted().workload.seed}${session.dirty() ? ' · pending edits excluded' : ''}` : 'Paused. Run accepts the current architecture explicitly.';
    if (!requestId && snap?.requests.length) requestId = snap.requests[0].id;
    const visible = new Set((snap?.requests || []).map(r => r.id));
    for (const [id, b] of requestButtons) if (!visible.has(id)) { b.element.remove(); requestButtons.delete(id); }
    for (const r of snap?.requests || []) {
      let b = requestButtons.get(r.id);
      if (!b) { b = ui.SimButton({ label: r.id, variant: 'quiet', onAction: () => { requestId = r.id; renderState(); } }); requestButtons.set(r.id, b); $('requests').append(b.element); }
      b.element.textContent = `${r.id} · ${r.status}`; b.setState({ selected: requestId === r.id });
    }
    const info = requestId && engine ? engine.inspect(requestId) : null;
    requestInspector.render({ selectedId: info ? requestId : null, prompt: 'Run the architecture, then inspect a request.', objects: (snap?.requests || []).map(r => ({ id: r.id, label: r.id, condition: r.status })), label: requestId || 'Request inspection', description: info ? 'Causal events come from the executable model.' : '', fields: info ? [
      { id: 'status', label: 'Status', value: info.request.status }, { id: 'blocker', label: 'Blocked by', value: typeof info.blocker === 'string' ? info.blocker : info.blocker ? JSON.stringify(info.blocker) : 'None' }, { id: 'attempts', label: 'Attempts', value: info.attempts.length }, { id: 'effects', label: 'Committed effects', value: info.effects.length }
    ] : [], actions: [] });
    $('history').replaceChildren(...(info?.history || []).map(e => element('li', '', `${Number(e.time).toFixed(3)} s · ${e.kind} · ${e.nodeId || ''}${e.detail ? ` · ${typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail)}` : ''}${e.causes?.length ? ` ← ${e.causes.join(', ')}` : ''}`)));
  }
  function render() {
    controls.undo.setState({ disabled: !session.canUndo() }); controls.redo.setState({ disabled: !session.canRedo() }); controls.pause.element.textContent = running ? 'Pause' : 'Resume';
    controls.pause.setState({ disabled: !engine });
    $('assumptions').replaceChildren(...session.document().assumptions.map(s => element('li', '', s)));
    const dirty = session.dirty(); $('revision').textContent = engine ? `Accepted r${session.accepted().revision}${dirty ? ' · edits pending' : ''}` : 'Not running'; $('revision').dataset.pending = String(dirty && !!engine);
    controls.run.element.textContent = engine && dirty ? 'Accept & run' : engine ? 'Restart' : 'Run';
    document.body.dataset.pending = String(dirty); document.body.dataset.running = String(running); document.body.dataset.graphNodes = String(session.document().nodes.length);
    renderCanvas(); renderState();
  }
  // This read-only evidence surface binds automation to authored and accepted records.
  globalThis.SimulatteSystemDiagramEditor = Object.freeze({ document: () => session.document(), accepted: () => session.accepted(), snapshot: () => engine?.snapshot() || null, selection: () => [...selected], viewport: () => canvas.viewport(), export: exportSession, program: () => engine?.program() || null });
  ui.adoptTree(document.body); palette(); properties();
  $('assumptions').replaceChildren(...graph.ASSUMPTIONS.map(s => element('li', '', s)));
  document.body.dataset.simulationProfile = profile.id; document.body.dataset.editorReady = 'true';
  render(); canvas.fit(); message('Drag components into the canvas, connect their ports, then Run.');
  setInterval(() => { if (!running || !engine) return; try { engine.runUntil(Math.min(60, engine.snapshot().time + 0.25)); if (engine.snapshot().time >= 60 || engine.snapshot().done) running = false; render(); } catch (error) { running = false; message(error.message, true); render(); } }, 180);
})().catch(error => { const status = document.getElementById('status'); status.textContent = `Unable to open editor: ${error.message}`; status.setAttribute('role', 'alert'); });
