(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(root, node ? require('./diagram.js') : root.SimulatteSystemDiagramDocument);
  if (node) module.exports = api; else root.SimulatteSystemDiagramInspector = api;
})(globalThis, function (root, D) {
  'use strict';
  const REBUILD_KINDS_SKIPPED = new Set(['view', 'layout']);
  const FIELD_SELECTOR = 'input,select,textarea';
  const BASIC_SETTING_LIMIT = 6;

  // ---- Pure helpers (exported for tests) ----

  function parseParam(spec, raw) {
    if (spec.type === 'boolean') return typeof raw === 'boolean' ? { ok: true, value: raw } : { ok: false, error: 'Expected on or off' };
    if (spec.type === 'enum') return spec.options.includes(raw) ? { ok: true, value: raw } : { ok: false, error: `Expected one of ${spec.options.join(', ')}` };
    const text = String(raw ?? '').trim();
    const range = `${spec.min} to ${spec.max}${spec.unit ? ` ${spec.unit}` : ''}`;
    if (!text) return { ok: false, error: `Enter a value from ${range}` };
    if (spec.type === 'integer' && !/^[+-]?\d+$/.test(text)) return { ok: false, error: `Enter a whole number from ${range}` };
    const value = Number(text);
    if (!Number.isFinite(value)) return { ok: false, error: `Enter a number from ${range}` };
    if (value < spec.min || value > spec.max) return { ok: false, error: `Out of range: ${range}` };
    return { ok: true, value };
  }

  function classLabel(id, doc, library) {
    const user = (doc?.classes || []).find(k => k.id === id);
    return user ? user.label : library.classes[id]?.label || id;
  }

  // Source labels say where a resolved value came from: this item, a named class, or the default.
  function sourceLabel(source, doc, library) {
    if (source === 'instance') return 'This node';
    if (source === 'edge') return 'This edge';
    if (source === 'kernel' || source === 'default') return 'Default';
    if (source === 'class') return 'This class';
    return classLabel(source, doc, library);
  }

  function paramRows(specs, values = {}, sources = {}, { maxBasic = Infinity } = {}) {
    const groups = { basic: [], advanced: [] };
    for (const [key, spec] of Object.entries(specs)) (groups[spec.group] || groups.advanced).push({ key, spec, value: values[key], source: sources[key], overridden: sources[key] === 'instance' || sources[key] === 'edge' || sources[key] === 'class' });
    if (groups.basic.length > maxBasic) groups.advanced.unshift(...groups.basic.splice(maxBasic));
    return groups;
  }

  function nodeFaultTypes(library, kernelId) {
    const kernel = library.kernels[kernelId];
    if (!kernel) return [];
    return kernel.faults.map(id => library.faultTypes.find(f => f.id === id)).filter(f => f && f.targets.includes('node') && (!f.kernels || f.kernels.includes(kernelId)));
  }

  function targetFaultTypes(library, kind) { return library.faultTypes.filter(f => f.targets.includes(kind)); }

  function classUsage(doc, classId) {
    return { nodes: doc.nodes.filter(n => n.classId === classId).length, children: doc.classes.filter(k => k.extends === classId).length };
  }

  function faultSummary(fault, doc, library) {
    const type = library.faultTypes.find(f => f.id === fault.type)?.label || fault.type;
    const nodeLabel = id => doc.nodes.find(n => n.id === id)?.label || id, edge = fault.target.kind === 'edge' && (doc.edges || []).find(e => e.id === fault.target.id);
    const target = fault.target.kind === 'node' ? doc.nodes.find(n => n.id === fault.target.id)?.label
      : fault.target.kind === 'group' ? doc.groups.find(g => g.id === fault.target.id)?.label
      : edge ? `${nodeLabel(edge.from.nodeId)} → ${nodeLabel(edge.to.nodeId)}${edge.label ? ` · ${edge.label}` : ''}` : null;
    const window = fault.untilSec == null ? `from ${fault.atSec} s` : `${fault.atSec}–${fault.untilSec} s`;
    return `${type} on ${target || fault.target.id}, ${window}`;
  }

  function selectionMode(selection) {
    const count = ['nodes', 'edges', 'groups', 'notes'].reduce((n, k) => n + (selection?.[k]?.length || 0), 0);
    if (count === 0) return { mode: 'diagram', count };
    if (count > 1) return { mode: 'multiple', count };
    for (const [key, mode] of [['nodes', 'node'], ['edges', 'edge'], ['groups', 'group'], ['notes', 'note']]) if (selection[key].length) return { mode, id: selection[key][0], count };
    return { mode: 'diagram', count };
  }

  function formatLive(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? String(Number(value.toPrecision(4))) : 'n/a';
    if (Array.isArray(value)) return value.length ? value.join(', ') : 'none';
    return value == null ? 'n/a' : String(value);
  }

  // ---- Component ----

  function create(options) {
    const { host, model, library, config, onInject, getView } = options;
    const ui = root.SimulatteWorldUI;
    if (!ui) throw Error('Inspector requires shared World UI');
    if (!host || !model || !library || !config) throw Error('Inspector requires host, model, library and config');
    const doc = host.ownerDocument;
    const el = (tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const panel = el('section', 'sd-inspector'); panel.setAttribute('aria-label', 'Inspector');
    host.append(panel);

    let live = [], flash = null, selectionKey = '', pending = false, disposed = false;
    const openDisclosures = new Set();

    function button(label, variant, action, attrs = {}) {
      const b = ui.SimButton({ document: doc, label, variant, onAction: action });
      for (const [k, v] of Object.entries(attrs)) b.element.dataset[k] = v;
      return b;
    }
    function field(input) { ui.SimField({ element: input }); return input; }
    function section(title, cls) { const s = el('section', `sd-insp-section${cls ? ` ${cls}` : ''}`); if (title) s.append(el('h3', 'sd-insp-heading', title)); return s; }
    function disclosure(key, title, children) {
      const d = ui.SimDisclosure({ document: doc, title, children });
      d.dataset.disclosure = key; d.classList.add('sd-insp-disclosure');
      if (openDisclosures.has(key)) d.open = true;
      d.addEventListener('toggle', () => { if (d.open) openDisclosures.add(key); else openDisclosures.delete(key); });
      return d;
    }
    function feedback() { const p = el('p', 'wui-feedback sd-insp-feedback'); p.setAttribute('role', 'status'); return p; }
    function report(target, message, state) { target.textContent = message || ''; target.dataset.state = state || 'applied'; }

    function apply(command, out) {
      const result = model.apply(command);
      if (!result.ok) { if (out) report(out, result.error, 'error'); else flash = { text: result.error, state: 'error' }; }
      return result;
    }

    async function inject(control, out) {
      if (typeof onInject !== 'function') { report(out, 'Fault injection is unavailable here', 'error'); return; }
      try {
        const recorded = await onInject(control);
        const at = Number.isFinite(recorded?.atSec) ? ` at ${recorded.atSec.toFixed(1)} s` : '';
        report(out, `${control.kind === 'fault' ? 'Injected' : control.kind === 'repair' ? 'Repaired' : 'Redrive requested'}${at}`);
      } catch (error) { report(out, error.message, 'error'); }
    }

    // A labelled control row with optional unit, source and reset; inputs commit on change only.
    function row({ key, label, input, unit, source, onReset, help }) {
      const wrap = el('div', 'sd-field'); wrap.dataset.fieldRow = key;
      const id = `sd-insp-${key.replace(/[^A-Za-z0-9_-]/g, '-')}`;
      input.id = id; input.dataset.field = key;
      const lab = el('label', 'sd-field-label', label); lab.htmlFor = id;
      const control = el('div', 'sd-field-control');
      control.append(input);
      if (unit) control.append(el('span', 'sd-field-unit', unit));
      if (onReset) control.append(button('Reset', 'quiet', onReset, { reset: key }).element);
      wrap.append(lab, control);
      const meta = el('p', 'sd-field-meta');
      if (source) { meta.textContent = source; meta.dataset.source = 'true'; }
      if (help) meta.title = help;
      const error = el('p', 'wui-error sd-field-error'); error.id = `${id}-error`; input.setAttribute('aria-describedby', error.id);
      wrap.append(meta, error);
      return { wrap, error };
    }

    function textInput(value, onCommit, { multiline = false, max } = {}) {
      const input = field(el(multiline ? 'textarea' : 'input'));
      if (!multiline) input.type = 'text';
      input.value = value ?? ''; input.dataset.initial = input.value;
      if (max) input.maxLength = max;
      input.addEventListener('change', () => onCommit(input.value));
      if (!multiline) input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
      return input;
    }

    function specInput(spec, value, commit) {
      let input;
      if (spec.type === 'boolean') {
        input = el('input'); input.type = 'checkbox'; input.checked = Boolean(value); field(input);
        input.addEventListener('change', () => commit(input.checked));
        return input;
      }
      if (spec.type === 'enum') {
        input = field(el('select'));
        for (const option of spec.options) { const o = el('option', '', option); o.value = option; input.append(o); }
        input.value = value; input.dataset.initial = value;
        input.addEventListener('change', () => commit(input.value));
        return input;
      }
      input = el('input'); input.type = 'number'; input.inputMode = spec.type === 'integer' ? 'numeric' : 'decimal';
      input.step = spec.type === 'integer' ? '1' : 'any'; input.min = String(spec.min); input.max = String(spec.max);
      input.value = value == null ? '' : String(value); input.dataset.initial = input.value; field(input);
      input.addEventListener('change', () => commit(input.value));
      input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
      return input;
    }

    // Parameter editor shared by instances, edges and user-class defaults.
    function paramEditor(prefix, specs, resolved, onSet, onReset, labelFor) {
      const groups = paramRows(specs, resolved.values, resolved.sources, { maxBasic: BASIC_SETTING_LIMIT });
      const build = rows => rows.map(r => {
        let line;
        const input = specInput(r.spec, r.value, raw => {
          const parsed = parseParam(r.spec, raw);
          if (!parsed.ok) { input.setAttribute('aria-invalid', 'true'); line.error.textContent = parsed.error; return; }
          input.removeAttribute('aria-invalid'); line.error.textContent = '';
          const result = onSet(r.key, parsed.value);
          if (result && !result.ok) { input.setAttribute('aria-invalid', 'true'); line.error.textContent = result.error; }
        });
        line = row({ key: `${prefix}.${r.key}`, label: r.spec.label, input, unit: r.spec.type === 'number' || r.spec.type === 'integer' ? r.spec.unit : null, source: labelFor(r.source), onReset: r.overridden ? () => onReset(r.key) : null, help: r.spec.help });
        line.wrap.dataset.overridden = String(r.overridden);
        return line.wrap;
      });
      const out = [...build(groups.basic)];
      if (groups.advanced.length) out.push(disclosure(`${prefix}.advanced`, `Advanced (${groups.advanced.length})`, build(groups.advanced)));
      return out;
    }

    function liveList(target, entries) {
      const dl = el('dl', 'sd-insp-live');
      const cells = new Map();
      const ensure = (key, label) => {
        if (cells.has(key)) return cells.get(key);
        const r = el('div', 'sd-insp-live-row'), dt = el('dt', '', label), dd = el('dd');
        r.append(dt, dd); dl.append(r); const cell = { dd, text: '' }; cells.set(key, cell); return cell;
      };
      const set = (key, label, value, attrs) => {
        const cell = ensure(key, label), text = formatLive(value);
        if (cell.text !== text) { cell.text = text; cell.dd.textContent = text; }
        if (attrs) for (const [k, v] of Object.entries(attrs)) if (cell.dd.dataset[k] !== v) cell.dd.dataset[k] = v;
      };
      live.push(view => entries(view, set));
      target.append(dl);
      return dl;
    }

    function faultControls(target, out, types, targetRef) {
      if (!types.length) return;
      const box = el('div', 'sd-insp-faults');
      const picker = field(el('select')); picker.dataset.field = `fault.${targetRef.kind}.type`; picker.setAttribute('aria-label', 'Fault type');
      for (const t of types) { const o = el('option', '', t.label); o.value = t.id; picker.append(o); }
      const paramsHost = el('div', 'sd-insp-fault-params');
      let readers = [];
      function drawParams() {
        const type = types.find(t => t.id === picker.value);
        readers = [];
        if (injectButton) injectButton.element.textContent = type.label;
        paramsHost.replaceChildren(...Object.entries(type.params).map(([key, spec]) => {
          const input = specInput(spec, spec.default, () => {});
          const line = row({ key: `fault.${targetRef.kind}.${type.id}.${key}`, label: spec.label, input, unit: spec.unit });
          readers.push(() => { const parsed = parseParam(spec, spec.type === 'boolean' ? input.checked : input.value); line.error.textContent = parsed.ok ? '' : parsed.error; input.toggleAttribute('aria-invalid', !parsed.ok); return parsed.ok ? [key, parsed.value] : null; });
          return line.wrap;
        }));
      }
      const readParams = () => { const pairs = readers.map(r => r()); return pairs.includes(null) ? null : Object.fromEntries(pairs); };
      const actions = el('div', 'sd-insp-actions');
      const injectButton = button('Inject', 'danger', async () => { const params = readParams(); if (params) await inject({ kind: 'fault', target: { ...targetRef }, type: picker.value, params }, out); }, { inspectorAction: 'inject' });
      picker.addEventListener('change', drawParams); drawParams();
      actions.append(
        injectButton.element,
        button('Repair', 'secondary', () => inject({ kind: 'repair', target: { ...targetRef } }, out), { inspectorAction: 'repair' }).element,
      );
      const pickRow = row({ key: `fault.${targetRef.kind}.type`, label: 'Fault', input: picker });
      box.append(pickRow.wrap, paramsHost, actions);
      target.append(box);
      scheduleControls(target, types, targetRef, picker, readParams);
    }

    function scheduleControls(target, types, targetRef, picker, readParams) {
      const horizon = model.diagram.run.horizonSec;
      const at = specInput({ type: 'number', min: 0, max: horizon, unit: 's' }, 0, () => {});
      const until = specInput({ type: 'number', min: 0, max: horizon, unit: 's' }, '', () => {});
      until.placeholder = 'permanent';
      const atRow = row({ key: `schedule.${targetRef.kind}.at`, label: 'Start', input: at, unit: 's' });
      const untilRow = row({ key: `schedule.${targetRef.kind}.until`, label: 'End', input: until, unit: 's' });
      const out = feedback();
      const add = button('Schedule fault', 'secondary', () => {
        const a = parseParam({ type: 'number', min: 0, max: horizon, unit: 's' }, at.value);
        if (!a.ok) { atRow.error.textContent = a.error; return; }
        atRow.error.textContent = '';
        let untilSec = null;
        if (until.value.trim()) {
          const u = parseParam({ type: 'number', min: a.value, max: Number.MAX_SAFE_INTEGER, unit: 's' }, until.value);
          if (!u.ok || u.value <= a.value) { untilRow.error.textContent = 'End must be after start, or blank for permanent'; return; }
          untilSec = u.value;
        }
        untilRow.error.textContent = '';
        const params = readParams();
        if (!params) return;
        const result = apply({ type: 'addFault', fault: { atSec: a.value, untilSec, target: { ...targetRef }, type: picker.value, params } }, out);
        if (result.ok) flash = { text: `Scheduled ${types.find(t => t.id === picker.value)?.label || picker.value}`, state: 'applied' };
      }, { inspectorAction: 'schedule' });
      target.append(disclosure(`schedule.${targetRef.kind}`, 'Schedule', [atRow.wrap, untilRow.wrap, add.element, out]));
    }

    // ---- Node ----
    function renderNode(id) {
      const diagram = model.diagram, n = diagram.nodes.find(x => x.id === id);
      if (!n) return renderDiagram();
      const resolved = D.resolveNodeParams(n, diagram, library, config);
      const klass = resolved.klass, kernel = library.kernels[klass.kernel];
      const label = s => sourceLabel(s, diagram, library);
      const head = el('header', 'sd-insp-head');
      head.append(el('h2', 'sd-insp-title', n.label || klass.label), el('p', 'sd-insp-subtitle', klass.label === kernel.label ? klass.label : `${klass.label} · ${kernel.label}`));
      panel.append(head);
      if (flash) { const f = feedback(); report(f, flash.text, flash.state); panel.append(f); }

      const status = section('Live', 'sd-insp-status');
      liveList(status, (view, set) => {
        const v = view?.nodes?.[id];
        if (!v) { set('state', 'State', 'not running'); return; }
        set('health', 'Health', v.health, { health: v.health || 'ok' });
        set('faults', 'Faults', v.faults || [], { faulted: String((v.faults || []).length > 0) });
        set('queue', 'Queue', `${formatLive(v.queue)} / ${formatLive(v.queueCapacity)}`);
        set('busy', 'Busy', `${formatLive(v.busy)} / ${formatLive(v.capacity)}`);
        set('util', 'Utilization', `${Math.round((v.utilization || 0) * 100)}%`);
        set('thr', 'Throughput', `${formatLive(v.throughput)} req/s`);
        set('lat', 'p50 / p95', v.served > 0 ? `${formatLive(v.latency?.p50)} / ${formatLive(v.latency?.p95)} ms` : 'no samples');
        set('served', 'Arrivals / served', `${formatLive(v.arrivals)} / ${formatLive(v.served)}`);
        set('errors', 'Errors / rejected', `${formatLive(v.errors)} / ${formatLive(v.rejected)}`);
        for (const [k, value] of Object.entries(v.detail || {})) set(`detail.${k}`, k, value);
      });
      panel.append(status);

      const inst = section('Instance');
      const labelRow = row({ key: 'node.label', label: 'Label', input: textInput(n.label, value => apply({ type: 'setNodeLabel', id, label: value })) });
      const picker = classPicker(n.classId);
      picker.addEventListener('change', () => {
        const result = model.apply({ type: 'setNodeClass', id, classId: picker.value });
        if (!result.ok) { flash = { text: result.error, state: 'error' }; schedule(); return; }
        const notes = [];
        if (result.dropped?.length) notes.push(`Dropped overrides: ${result.dropped.join(', ')}`);
        if (result.removedEdges?.length) notes.push(`Removed edges: ${result.removedEdges.join(', ')}`);
        flash = { text: notes.join('. ') || `Class set to ${classLabel(picker.value, model.diagram, library)}`, state: 'applied' };
        schedule();
      });
      const classRow = row({ key: 'node.class', label: 'Class', input: picker });
      const chain = el('p', 'sd-insp-chain');
      chain.textContent = ['This node', ...klass.chain.map(c => classLabel(c, diagram, library)), `${kernel.label} kernel`].join(' › ');
      chain.setAttribute('aria-label', `Class chain: ${chain.textContent}`);
      inst.append(labelRow.wrap, classRow.wrap, chain);
      panel.append(inst);

      const params = section('Parameters');
      const overrides = Object.keys(n.params).length;
      params.append(el('p', 'sd-insp-note', overrides ? `${overrides} override${overrides === 1 ? '' : 's'} on this node` : 'All values inherited'));
      params.append(...paramEditor('param', kernel.params, resolved,
        (key, value) => apply({ type: 'setNodeParams', id, params: { [key]: value } }),
        key => apply({ type: 'setNodeParams', id, params: { [key]: null } }), label));
      panel.append(params);

      const classes = section('Class');
      const out = feedback();
      const name = textInput('', () => {}, { max: config.bounds.maxLabelLength });
      name.placeholder = `${klass.label} custom`;
      const nameRow = row({ key: 'derive.name', label: 'New class name', input: name });
      const save = button('Save as new class', 'secondary', () => {
        const result = apply({ type: 'deriveClass', nodeId: id, label: name.value.trim() || undefined }, out);
        if (result.ok) { flash = { text: `Saved class ${classLabel(result.id, model.diagram, library)}`, state: 'applied' }; schedule(); }
      }, { inspectorAction: 'derive' });
      classes.append(nameRow.wrap, save.element, out);
      if (!klass.builtin) classes.append(userClassEditor(klass.id, 'node'));
      panel.append(classes);

      const faults = section('Faults');
      const faultOut = feedback();
      faultControls(faults, faultOut, nodeFaultTypes(library, klass.kernel), { kind: 'node', id });
      if (klass.kernel === 'deadLetter') faults.append(button('Redrive', 'secondary', () => inject({ kind: 'redrive', target: { kind: 'node', id } }, faultOut), { inspectorAction: 'redrive' }).element);
      faults.append(faultOut);
      panel.append(faults);
    }

    function classPicker(current) {
      const diagram = model.diagram, picker = field(el('select'));
      if (diagram.classes.length) {
        const g = el('optgroup'); g.label = 'Your classes';
        for (const k of diagram.classes) { const o = el('option', '', k.label); o.value = k.id; g.append(o); }
        picker.append(g);
      }
      for (const cat of library.categories) {
        const ids = library.classOrder.filter(cid => library.classes[cid].category === cat.id);
        if (!ids.length) continue;
        const g = el('optgroup'); g.label = cat.label;
        for (const cid of ids) { const o = el('option', '', library.classes[cid].label); o.value = cid; g.append(o); }
        picker.append(g);
      }
      if (current) { picker.value = current; picker.dataset.initial = current; }
      return picker;
    }

    // Edit a user class's label, description and defaults; deleting is offered only where it is unused.
    function userClassEditor(classId, context) {
      const diagram = model.diagram, k = diagram.classes.find(c => c.id === classId);
      const resolved = D.resolveClass(classId, diagram, library, config);
      const kernel = library.kernels[resolved.kernel];
      const out = feedback();
      const usage = classUsage(diagram, classId);
      const children = [];
      const prefix = `class.${classId}`;
      children.push(el('p', 'sd-insp-note', `Extends ${classLabel(k.extends, diagram, library)} · used by ${usage.nodes} node${usage.nodes === 1 ? '' : 's'}${usage.children ? ` and ${usage.children} class${usage.children === 1 ? '' : 'es'}` : ''}`));
      children.push(row({ key: `${prefix}.label`, label: 'Class name', input: textInput(k.label, value => { if (value.trim()) apply({ type: 'updateUserClass', id: classId, patch: { label: value } }, out); else report(out, 'Class name cannot be empty', 'error'); }, { max: config.bounds.maxLabelLength }) }).wrap);
      children.push(row({ key: `${prefix}.description`, label: 'Description', input: textInput(k.description || '', value => apply({ type: 'updateUserClass', id: classId, patch: { description: value.trim() ? value : null } }, out), { multiline: true, max: config.bounds.maxNoteLength }) }).wrap);
      const sources = Object.fromEntries(Object.entries(resolved.sources).map(([key, s]) => [key, s === classId ? 'class' : s]));
      children.push(el('h4', 'sd-insp-subheading', 'Class defaults'));
      children.push(...paramEditor(`${prefix}.defaults`, kernel.params, { values: resolved.defaults, sources },
        (key, value) => apply({ type: 'updateUserClass', id: classId, patch: { defaults: { [key]: value } } }, out),
        key => apply({ type: 'updateUserClass', id: classId, patch: { defaults: { [key]: null } } }, out),
        s => sourceLabel(s, diagram, library)));
      if (context === 'diagram') {
        const del = button('Delete class', 'danger', () => { const r = apply({ type: 'deleteUserClass', id: classId }, out); if (r.ok) openDisclosures.delete(`${prefix}.edit`); }, { inspectorAction: 'delete-class' });
        if (usage.nodes || usage.children) { del.setState({ disabled: true }); del.element.title = 'In use'; }
        children.push(del.element);
      }
      children.push(out);
      return disclosure(`${prefix}.edit`, context === 'node' ? `Edit class ${k.label}` : k.label, children);
    }

    // ---- Edge ----
    function renderEdge(id) {
      const diagram = model.diagram, e = diagram.edges.find(x => x.id === id);
      if (!e) return renderDiagram();
      const from = diagram.nodes.find(n => n.id === e.from.nodeId), to = diagram.nodes.find(n => n.id === e.to.nodeId);
      const head = el('header', 'sd-insp-head');
      head.append(el('h2', 'sd-insp-title', `${from?.label || e.from.nodeId} → ${to?.label || e.to.nodeId}`), el('p', 'sd-insp-subtitle', `Edge ${e.from.portId} → ${e.to.portId}`));
      panel.append(head);
      if (flash) { const f = feedback(); report(f, flash.text, flash.state); panel.append(f); }
      const status = section('Live', 'sd-insp-status');
      liveList(status, (view, set) => {
        const v = view?.edges?.[id];
        if (!v) { set('state', 'State', 'not running'); return; }
        set('rate', 'Rate', `${formatLive(v.rate)} msg/s`);
        set('errorRate', 'Error rate', `${formatLive((v.errorRate || 0) * 100)}%`);
        set('inTransit', 'In transit', v.inTransit);
        set('faults', 'Faults', v.faults || [], { faulted: String((v.faults || []).length > 0) });
      });
      panel.append(status);
      const meaning = section('Connection');
      meaning.append(row({ key: 'edge.label', label: 'What flows here', input: textInput(e.label || '', value => apply({ type: 'setEdgeLabel', id, label: value }), { max: config.bounds.maxLabelLength }) }).wrap, el('p', 'sd-insp-note', 'Annotation only; typed ports and parameters determine execution.'));
      panel.append(meaning);
      const params = section('Parameters');
      params.append(...paramEditor('edge', library.edgeParams, D.resolveEdgeParams(e, library),
        (key, value) => apply({ type: 'setEdgeParams', id, params: { [key]: value } }),
        key => apply({ type: 'setEdgeParams', id, params: { [key]: null } }),
        s => sourceLabel(s, diagram, library)));
      panel.append(params);
      const faults = section('Faults');
      const out = feedback();
      faultControls(faults, out, targetFaultTypes(library, 'edge'), { kind: 'edge', id });
      faults.append(out);
      panel.append(faults);
    }

    // ---- Group ----
    function renderGroup(id) {
      const diagram = model.diagram, g = diagram.groups.find(x => x.id === id);
      if (!g) return renderDiagram();
      const members = diagram.nodes.filter(n => n.groupId === id);
      const head = el('header', 'sd-insp-head');
      head.append(el('h2', 'sd-insp-title', g.label || id), el('p', 'sd-insp-subtitle', `${g.kind} · ${members.length} node${members.length === 1 ? '' : 's'}`));
      panel.append(head);
      if (flash) { const f = feedback(); report(f, flash.text, flash.state); panel.append(f); }
      const props = section('Group');
      const out = feedback();
      props.append(row({ key: 'group.label', label: 'Label', input: textInput(g.label, value => apply({ type: 'updateGroup', id, patch: { label: value } }, out), { max: config.bounds.maxLabelLength }) }).wrap);
      const kind = specInput({ type: 'enum', options: D.GROUP_KINDS }, g.kind, value => apply({ type: 'updateGroup', id, patch: { kind: value } }, out));
      props.append(row({ key: 'group.kind', label: 'Kind', input: kind, source: D.FAILURE_DOMAIN_KINDS.includes(g.kind) ? 'Failure domain' : 'Visual only' }).wrap, out);
      panel.append(props);
      if (members.length) {
        const status = section('Live', 'sd-insp-status');
        liveList(status, (view, set) => {
          if (!view?.nodes) { set('state', 'State', 'not running'); return; }
          const states = members.map(m => view.nodes[m.id]?.health || 'ok');
          set('down', 'Down', states.filter(s => s === 'down').length, { health: states.includes('down') ? 'down' : 'ok' });
          set('degraded', 'Degraded', states.filter(s => s === 'degraded' || s === 'open').length);
          set('thr', 'Throughput', `${formatLive(members.reduce((sum, m) => sum + (view.nodes[m.id]?.throughput || 0), 0))} req/s`);
        });
        panel.append(status);
      }
      if (D.FAILURE_DOMAIN_KINDS.includes(g.kind)) {
        const faults = section('Faults');
        const fout = feedback();
        const actions = el('div', 'sd-insp-actions');
        actions.append(
          button('Zone outage', 'danger', () => inject({ kind: 'fault', target: { kind: 'group', id }, type: 'outage', params: {} }, fout), { inspectorAction: 'outage' }).element,
          button('Restore', 'secondary', () => inject({ kind: 'repair', target: { kind: 'group', id } }, fout), { inspectorAction: 'restore' }).element,
        );
        faults.append(actions, fout);
        const outage = targetFaultTypes(library, 'group');
        const hidden = field(el('select')); for (const t of outage) { const o = el('option', '', t.label); o.value = t.id; hidden.append(o); }
        scheduleControls(faults, outage, { kind: 'group', id }, hidden, () => ({}));
        panel.append(faults);
      }
    }

    function renderNote(id) {
      const note = model.diagram.notes.find(x => x.id === id);
      if (!note) return renderDiagram();
      const head = el('header', 'sd-insp-head');
      head.append(el('h2', 'sd-insp-title', 'Note'));
      panel.append(head);
      const s = section(null), out = feedback();
      s.append(row({ key: 'note.text', label: 'Text', input: textInput(note.text, value => apply({ type: 'updateNote', id, patch: { text: value } }, out), { multiline: true, max: config.bounds.maxNoteLength }) }).wrap, out);
      panel.append(s);
    }

    function renderMultiple(selection, count) {
      const head = el('header', 'sd-insp-head');
      const parts = [['nodes', 'node'], ['edges', 'edge'], ['groups', 'group'], ['notes', 'note']].filter(([k]) => selection[k].length).map(([k, word]) => `${selection[k].length} ${word}${selection[k].length === 1 ? '' : 's'}`);
      head.append(el('h2', 'sd-insp-title', `${count} selected`), el('p', 'sd-insp-subtitle', parts.join(', ')));
      panel.append(head);
      const s = section(null), out = feedback();
      const ids = ['nodes', 'edges', 'groups', 'notes'].flatMap(k => selection[k]);
      s.append(button(`Delete ${count} items`, 'danger', () => apply({ type: 'deleteItems', ids }, out), { inspectorAction: 'delete' }).element, out);
      panel.append(s);
    }

    // ---- Diagram ----
    function renderDiagram() {
      const diagram = model.diagram, b = config.bounds;
      const head = el('header', 'sd-insp-head');
      head.append(el('h2', 'sd-insp-title', diagram.name || 'Untitled system'), el('p', 'sd-insp-subtitle', `${diagram.nodes.length} nodes · ${diagram.edges.length} edges`));
      panel.append(head);
      if (flash) { const f = feedback(); report(f, flash.text, flash.state); panel.append(f); }
      const meta = section('Diagram'), out = feedback();
      meta.append(
        row({ key: 'meta.name', label: 'Name', input: textInput(diagram.name, value => apply({ type: 'setMeta', patch: { name: value } }, out), { max: b.maxLabelLength }) }).wrap,
        row({ key: 'meta.description', label: 'Description', input: textInput(diagram.description || '', value => apply({ type: 'setMeta', patch: { description: value.trim() ? value : null } }, out), { multiline: true, max: b.maxNoteLength }) }).wrap,
      );
      for (const [key, label, spec, value, unit] of [
        ['seed', 'Seed', { type: 'integer', min: 0, max: 4294967295 }, diagram.seed, null],
        ['horizonSec', 'Horizon', { type: 'number', min: 1, max: b.maxHorizonSec, unit: 's' }, diagram.run.horizonSec, 's'],
      ]) {
        let line;
        const input = specInput(spec, value, raw => {
          const parsed = parseParam(spec, raw);
          if (!parsed.ok) { input.setAttribute('aria-invalid', 'true'); line.error.textContent = parsed.error; return; }
          input.removeAttribute('aria-invalid'); line.error.textContent = '';
          const result = apply({ type: 'setMeta', patch: { [key]: parsed.value } }, out);
          if (!result.ok) { input.setAttribute('aria-invalid', 'true'); line.error.textContent = result.error; }
        });
        line = row({ key: `meta.${key}`, label, input, unit });
        meta.append(line.wrap);
      }
      meta.append(out);
      panel.append(meta);

      const faults = section(`Scheduled faults (${diagram.faults.length})`);
      if (!diagram.faults.length) faults.append(el('p', 'sd-insp-note', 'None scheduled'));
      for (const f of diagram.faults) {
        const item = el('div', 'sd-insp-item'); item.dataset.faultId = f.id;
        const fout = feedback();
        const at = specInput({ type: 'number', min: 0, max: diagram.run.horizonSec }, f.atSec, raw => {
          const parsed = parseParam({ type: 'number', min: 0, max: diagram.run.horizonSec, unit: 's' }, raw);
          if (parsed.ok) apply({ type: 'updateFault', id: f.id, patch: { atSec: parsed.value } }, fout); else report(fout, parsed.error, 'error');
        });
        const until = specInput({ type: 'number', min: 0, max: Number.MAX_SAFE_INTEGER }, f.untilSec ?? '', raw => {
          if (!String(raw).trim()) { apply({ type: 'updateFault', id: f.id, patch: { untilSec: null } }, fout); return; }
          const parsed = parseParam({ type: 'number', min: 0, max: Number.MAX_SAFE_INTEGER, unit: 's' }, raw);
          if (parsed.ok) apply({ type: 'updateFault', id: f.id, patch: { untilSec: parsed.value } }, fout); else report(fout, parsed.error, 'error');
        });
        until.placeholder = 'permanent';
        item.append(
          el('p', 'sd-insp-item-title', faultSummary(f, diagram, library)),
          row({ key: `fault.${f.id}.at`, label: 'Start', input: at, unit: 's' }).wrap,
          row({ key: `fault.${f.id}.until`, label: 'End', input: until, unit: 's' }).wrap,
          button('Remove', 'quiet', () => apply({ type: 'removeFault', id: f.id }, fout), { inspectorAction: 'remove-fault' }).element,
          fout,
        );
        faults.append(item);
      }
      panel.append(faults);

      const classes = section(`Your classes (${diagram.classes.length})`);
      for (const k of diagram.classes) classes.append(userClassEditor(k.id, 'diagram'));
      const cout = feedback();
      const parent = classPicker(null);
      const name = textInput('', () => {}, { max: b.maxLabelLength });
      const create = button('Create class', 'secondary', () => {
        const label = name.value.trim() || `${classLabel(parent.value, diagram, library)} custom`;
        const result = apply({ type: 'addUserClass', label, extends: parent.value, defaults: {} }, cout);
        if (result.ok) { openDisclosures.add(`class.${result.id}.edit`); flash = { text: `Created class ${label}`, state: 'applied' }; schedule(); }
      }, { inspectorAction: 'create-class' });
      classes.append(disclosure('class.new', 'New class', [
        row({ key: 'newclass.parent', label: 'Based on', input: parent }).wrap,
        row({ key: 'newclass.name', label: 'Name', input: name }).wrap,
        create.element, cout,
      ]));
      panel.append(classes);

      const warnings = model.issues();
      const warn = section(`Warnings (${warnings.length})`, 'sd-insp-warnings');
      if (!warnings.length) warn.append(el('p', 'sd-insp-note', 'No warnings'));
      else { const list = el('ul', 'sd-insp-warning-list'); for (const w of warnings) { const li = el('li', '', w.message); li.dataset.kind = w.kind; list.append(li); } warn.append(list); }
      panel.append(warn);
    }

    // ---- Rebuild with focus and draft preservation ----
    function snapshotFocus() {
      const active = doc.activeElement;
      const drafts = [];
      for (const input of panel.querySelectorAll(FIELD_SELECTOR)) {
        if (!input.dataset.field || input.type === 'checkbox') continue;
        if (input.dataset.initial !== undefined && input.value !== input.dataset.initial) drafts.push([input.dataset.field, input.value]);
      }
      let focus = null;
      if (active && panel.contains(active)) {
        focus = { field: active.dataset?.field, reset: active.dataset?.reset, action: active.dataset?.inspectorAction, disclosure: active.parentElement?.dataset?.disclosure && active.tagName === 'SUMMARY' ? active.parentElement.dataset.disclosure : null };
        try { focus.start = active.selectionStart; focus.end = active.selectionEnd; } catch { /* number inputs expose no selection */ }
      }
      return { focus, drafts, scroll: host.scrollTop, panelScroll: panel.scrollTop };
    }

    function restoreFocus(snap) {
      for (const [key, value] of snap.drafts) {
        const input = panel.querySelector(`[data-field="${CSS.escape(key)}"]`);
        if (input && input !== null) input.value = value;
      }
      host.scrollTop = snap.scroll; panel.scrollTop = snap.panelScroll;
      const f = snap.focus;
      if (!f) return;
      let target = null;
      if (f.field) target = panel.querySelector(`[data-field="${CSS.escape(f.field)}"]`);
      else if (f.reset) target = panel.querySelector(`[data-reset="${CSS.escape(f.reset)}"]`) || panel.querySelector(`[data-field="${CSS.escape(f.reset)}"]`);
      else if (f.disclosure) target = panel.querySelector(`[data-disclosure="${CSS.escape(f.disclosure)}"] > summary`);
      else if (f.action) target = panel.querySelector(`[data-inspector-action="${CSS.escape(f.action)}"]`);
      if (!target) return;
      target.focus({ preventScroll: true });
      if (f.start != null) { try { target.setSelectionRange(f.start, f.end); } catch { /* not a text input */ } }
    }

    function rebuild() {
      pending = false;
      if (disposed) return;
      const selection = model.selection;
      const mode = selectionMode(selection);
      const key = `${mode.mode}:${mode.id || mode.count}`;
      const snap = key === selectionKey ? snapshotFocus() : { focus: null, drafts: [], scroll: 0, panelScroll: 0 };
      if (key !== selectionKey) { flash = null; selectionKey = key; }
      live = [];
      panel.replaceChildren();
      panel.dataset.mode = mode.mode;
      if (mode.mode === 'node') renderNode(mode.id);
      else if (mode.mode === 'edge') renderEdge(mode.id);
      else if (mode.mode === 'group') renderGroup(mode.id);
      else if (mode.mode === 'note') renderNote(mode.id);
      else if (mode.mode === 'multiple') renderMultiple(selection, mode.count);
      else renderDiagram();
      restoreFocus(snap);
      const view = typeof getView === 'function' ? getView() : null;
      for (const update of live) update(view);
    }

    function schedule() {
      if (pending) return;
      pending = true;
      // A macrotask lets focus settle on the next control after a change-on-blur commit.
      setTimeout(rebuild, 0);
    }

    const unsubscribe = model.subscribe(event => { if (!REBUILD_KINDS_SKIPPED.has(event.kind)) schedule(); });
    rebuild();

    // Called every animation frame: only live text changes; the form under the cursor is untouched.
    function render(view) {
      if (pending) return;
      for (const update of live) update(view || null);
    }

    return { element: panel, render, refresh: schedule, dispose() { disposed = true; unsubscribe(); panel.remove(); } };
  }

  return Object.freeze({ BASIC_SETTING_LIMIT, create, parseParam, sourceLabel, paramRows, nodeFaultTypes, targetFaultTypes, classUsage, faultSummary, selectionMode, formatLive });
});
