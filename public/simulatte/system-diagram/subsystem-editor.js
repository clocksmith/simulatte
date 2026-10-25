(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./diagram.js') : root.SimulatteSystemDiagramDocument);
  if (node) module.exports = api; else root.SimulatteSystemDiagramSubsystemEditor = api;
})(globalThis, function (D) {
  'use strict';
  const GRAPH_KEYS = ['nodes', 'edges', 'groups', 'notes', 'faults'];
  // A definition draft is a detached document. Publishing never rewrites a pinned instance.
  function projectState(view, composition) {
    if (!view || !composition) return view;
    const nodes = { ...view.nodes };
    for (const instance of composition.instances.filter(i => i.path.length === 1)) {
      const leaves = composition.mapping.filter(row => row.kind === 'nodes' && row.path[0] === instance.path[0]);
      const states = leaves.map(row => view.nodes[row.id]).filter(Boolean);
      nodes[instance.path[0]] = {
        health: states.some(s => s.health === 'down') ? 'down' : states.some(s => ['degraded', 'open', 'electing'].includes(s.health)) ? 'degraded' : states.some(s => s.health === 'busy') ? 'busy' : 'ok',
        busy: states.reduce((sum, s) => sum + (s.busy || 0), 0), queue: states.reduce((sum, s) => sum + (s.queue || 0), 0),
        detail: Object.fromEntries(leaves.map(row => { const s = view.nodes[row.id]; return [row.path.slice(1).join('/'), s ? `${s.health}; ${s.busy || 0} busy; ${s.queue || 0} queued` : 'not observed']; })),
      };
    }
    return { ...view, nodes };
  }
  function createSession(model, library, config) {
    const stack = [];
    return {
      get active() { return stack.at(-1) || null; },
      get depth() { return stack.length; },
      open(classId) {
        const parent = D.clone(model.diagram), definition = D.subsystems.definition(parent, classId);
        if (!definition) throw Error('Select a saved subsystem version');
        const draft = D.emptyDiagram(config, definition.label);
        draft.schema = D.SCHEMA; draft.classes = parent.classes; draft.subsystems = parent.subsystems;
        draft.seed = parent.seed; draft.run = parent.run;
        for (const key of GRAPH_KEYS) draft[key] = D.clone(definition[key]);
        const frame = { parent, definition: D.clone(definition), ports: D.clone(definition.ports), resume: model.suspend() };
        stack.push(frame);
        const result = model.replace(draft);
        if (!result.ok) { stack.pop(); throw Error(result.error); }
      },
      cancel() {
        const frame = stack.pop();
        if (!frame) return;
        frame.resume();
      },
      publish(ports) {
        const frame = stack.at(-1);
        if (!frame) throw Error('Open a subsystem definition first');
        const draft = model.diagram, parent = D.clone(frame.parent);
        parent.classes = D.clone(draft.classes); parent.subsystems = D.clone(draft.subsystems);
        const version = Math.max(...parent.subsystems.filter(d => d.id === frame.definition.id).map(d => d.version)) + 1;
        const definition = { id: frame.definition.id, version, label: draft.name, ports: D.clone(ports) };
        for (const key of GRAPH_KEYS) definition[key] = D.clone(draft[key]);
        const result = D.subsystems.publish(parent, definition, library, config);
        result.diagram.classes = D.clone(frame.parent.classes);
        stack.pop();
        frame.resume(result.diagram);
        return definition;
      },
    };
  }

  function create({ model, library, config, host, el, field, button, apply, canvas, message, onOpen }) {
    const session = createSession(model, library, config);
    let portRows = [];
    function open(classId) { onOpen(); session.open(classId); render(); canvas.fit(); message('Editing a detached subsystem definition. Publish creates a new version; Cancel returns without changes.'); }
    function readPorts() {
      return portRows.map(row => { const [nodeId, portId, direction] = row.target.value.split('|'); return { id: row.id.value, label: row.label.value, direction, target: { nodeId, portId } }; });
    }
    function renderPorts(container) {
      const choices = model.diagram.nodes.flatMap(n => D.portsForNode(n, model.diagram, library, config).map(p => ({ id: `${n.id}|${p.id}|${p.direction}`, label: `${n.label || n.id} · ${p.id} (${p.direction})` })));
      portRows = [];
      const ports = session.active.ports;
      for (const [index, port] of ports.entries()) {
        const row = el('div', 'subsystem-port-row'); container.append(row);
        const id = field(row, 'Port identifier', port.id, { id: `subsystem-port-${index}` });
        const label = field(row, 'Port label', port.label, { id: `subsystem-port-label-${index}` });
        const target = field(row, 'Internal typed port', `${port.target.nodeId}|${port.target.portId}|${port.direction}`, { id: `subsystem-port-target-${index}`, choices });
        portRows.push({ id, label, target });
        for (const input of [id, label, target]) input.addEventListener('change', () => { session.active.ports = readPorts(); });
        button(row, 'Remove port', () => { session.active.ports = readPorts().filter((_, i) => i !== index); render(); });
      }
      button(container, 'Expose port', () => {
        if (!choices.length) throw Error('Add a component before exposing a port');
        const [nodeId, portId, direction] = choices[0].id.split('|');
        session.active.ports = [...readPorts(), { id: `port-${ports.length + 1}`, label: `Port ${ports.length + 1}`, direction, target: { nodeId, portId } }]; render();
      });
    }
    function render() {
      host.replaceChildren();
      const title = el('h3', 'scope-title', session.active ? `Editing ${session.active.definition.label} v${session.active.definition.version} · depth ${session.depth}` : 'Reusable subsystems');
      host.append(title);
      if (session.active) {
        host.append(el('p', 'properties-note', 'Edit the internal graph on the canvas. Ports map directly to internal behavior. Existing instances stay pinned until upgraded.'));
        const ports = el('details', 'subsystem-ports'); ports.append(el('summary', '', 'External ports')); host.append(ports); renderPorts(ports);
        const actions = el('div', 'properties-actions'); host.append(actions);
        button(actions, 'Publish new version', () => { const definition = session.publish(readPorts()); render(); canvas.fit(); message(`Published ${definition.label} v${definition.version}. Upgrade instances explicitly.`); }, 'primary');
        button(actions, 'Cancel definition edits', () => { session.cancel(); render(); canvas.fit(); message('Returned without publishing definition edits.'); });
      }
      const name = field(host, 'Subsystem name', 'New subsystem', { id: 'subsystem-name' });
      button(host, 'Save selection as subsystem', () => {
        const selected = model.selection.nodes.length ? model.selection.nodes : model.diagram.nodes.filter(n => model.selection.groups.includes(n.groupId)).map(n => n.id);
        if (!selected.length) throw Error('Select nodes or a group to save as a subsystem');
        const slug = name.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'subsystem';
        const used = new Set((model.diagram.subsystems || []).map(d => d.id)); let id = slug, suffix = 2;
        while (used.has(id)) id = `${slug}-${suffix++}`;
        apply({ type: 'saveSubsystem', nodeIds: selected, definitionId: id, label: name.value }); canvas.fit();
      });
      const definitions = model.diagram.subsystems || [];
      const choose = field(host, 'Saved version', definitions.length ? `subsystem.${definitions[0].id}@${definitions[0].version}` : '', { id: 'subsystem-library', choices: definitions.map(d => ({ id: `subsystem.${d.id}@${d.version}`, label: `${d.label} v${d.version}` })) });
      const actions = el('div', 'properties-actions'); host.append(actions);
      button(actions, 'Insert subsystem', () => { if (!definitions.length) throw Error('Save or import a subsystem first'); const d = D.subsystems.definition(model.diagram, choose.value), center = canvas.viewportCenter(); apply({ type: 'insertSubsystem', definitionId: d.id, version: d.version, x: center.x, y: center.y }); });
      button(actions, 'Edit saved definition', () => open(choose.value));
      host.append(el('p', 'properties-note', 'Export the document to carry this versioned library into another diagram. Import a subsystem library below to reuse its definitions without replacing your graph.'));
      const data = el('textarea', 'wui-field'); data.id = 'subsystem-library-json'; data.rows = 4; data.dataset.format = 'code'; data.setAttribute('aria-label', 'Subsystem library JSON'); host.append(data);
      button(actions, 'Copy library JSON', () => { data.value = JSON.stringify({ classes: model.diagram.classes, subsystems: definitions }, null, 2); });
      button(actions, 'Import library JSON', () => apply({ type: 'importSubsystemLibrary', library: JSON.parse(data.value) }));
    }
    function inspect(host, node) {
      const definition = D.subsystems.definition(model.diagram, node.classId);
      host.append(el('p', 'properties-note', `${definition.label} v${definition.version} · ${definition.nodes.length} internal components. Named ports execute the saved internal graph.`));
      const state = el('p', 'properties-note'); state.id = 'node-state'; const detail = el('dl'); detail.id = 'node-detail'; host.append(state, detail);
      const name = field(host, 'Instance name', node.label, { id: 'instance-name' });
      name.addEventListener('change', () => apply({ type: 'setNodeLabel', id: node.id, label: name.value }));
      const actions = el('div', 'properties-actions'); host.append(actions);
      button(actions, 'Inspect / edit subsystem', () => open(node.classId));
      const versions = model.diagram.subsystems.filter(d => d.id === definition.id);
      const version = field(host, 'Pinned version', definition.version, { id: 'subsystem-version', choices: versions.map(d => ({ id: String(d.version), label: `v${d.version} · ${d.label}` })) });
      button(actions, 'Upgrade instance', () => apply({ type: 'upgradeSubsystem', id: node.id, version: Number(version.value) }));
      const overrides = el('textarea', 'wui-field'); overrides.id = 'subsystem-overrides'; overrides.rows = 5; overrides.dataset.format = 'code'; overrides.value = JSON.stringify(node.overrides || {}, null, 2); overrides.setAttribute('aria-label', 'Per-instance leaf parameter overrides');
      host.append(el('p', 'properties-note', 'Overrides are a JSON map from internal leaf paths to parameter values, for example {"worker": {"concurrency": 4}}. Nested paths use /. Unknown paths and values are rejected.'), overrides);
      button(actions, 'Apply subsystem overrides', () => apply({ type: 'setSubsystemOverrides', id: node.id, overrides: JSON.parse(overrides.value) }));
      host.append(el('p', 'properties-note', 'Ports: ' + D.portsForNode(node, model.diagram, library, config).map(p => `${p.id} (${p.direction}: ${(p.accepts || p.emits).join(', ')})`).join(' · ')));
    }
    return { session, render, inspect };
  }
  return Object.freeze({ createSession, create, projectState });
});
