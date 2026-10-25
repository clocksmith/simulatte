(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./diagram.js') : root.SimulatteSystemDiagramDocument, node ? require('./glyphs.js') : root.SimulatteSystemDiagramGlyphs);
  if (node) module.exports = api; else root.SimulatteSystemDiagramCanvasRender = api;
})(globalThis, function (D, Glyphs) {
  'use strict';
  // Keyed, incremental SVG rendering and world geometry for SimulatteSystemDiagramCanvas.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const STATUS_HEIGHT = 16;
  const GLYPH_SIZE = 20;
  const TEXT_X = 44;
  const PORT_DOT = 4.5;
  const PORT_HIT_MAX = 12;
  const GROUP_TAB_HEIGHT = 22;
  const GROUP_HANDLE = 14;
  const NOTE_WIDTH = 200;
  const NOTE_LINE = 16;
  const NOTE_CHAR = 6.6;
  const FOLDED_WIDTH = 240;
  const FOLDED_HEADER = 96;
  const PROXY_SPACING = 22;
  const FOLD_BUTTON = 28;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // A bounded projection of authored nodes/edges, never a substitute executable graph.
  function groupPresentation(diagram) {
    const groups = new Map(diagram.groups.map(group => [group.id, { group, members: [], ports: [], box: { x: group.x, y: group.y, w: group.w, h: group.h } }]));
    const hidden = new Map(), proxies = new Map();
    for (const node of diagram.nodes) {
      const entry = groups.get(node.groupId);
      if (entry) { entry.members.push(node.id); if (entry.group.collapsed) hidden.set(node.id, entry); }
    }
    const edges = diagram.edges.filter(edge => !hidden.has(edge.from.nodeId) || hidden.get(edge.from.nodeId) !== hidden.get(edge.to.nodeId));
    for (const edge of edges) for (const side of ['from', 'to']) {
      const end = edge[side], entry = hidden.get(end.nodeId), key = `${end.nodeId}.${end.portId}`;
      if (!entry || proxies.has(key)) continue;
      const port = { ...end, groupId: entry.group.id, direction: side === 'from' ? 'out' : 'in' };
      entry.ports.push(port); proxies.set(key, port);
    }
    for (const entry of groups.values()) if (entry.group.collapsed) {
      const ins = entry.ports.filter(p => p.direction === 'in'), outs = entry.ports.filter(p => p.direction === 'out');
      const order = (a, b) => `${a.nodeId}.${a.portId}`.localeCompare(`${b.nodeId}.${b.portId}`);
      const rows = Math.max(ins.length, outs.length, 1);
      entry.box = { x: entry.group.x, y: entry.group.y, w: FOLDED_WIDTH, h: FOLDED_HEADER + rows * PROXY_SPACING + 12 };
      for (const [list, x] of [[ins, 0], [outs, FOLDED_WIDTH]]) list.sort(order).forEach((port, i) => { port.x = entry.box.x + x; port.y = entry.box.y + FOLDED_HEADER + (i + .5) * PROXY_SPACING; });
    }
    return { groups, hidden, proxies, nodes: diagram.nodes.filter(n => !hidden.has(n.id)), edges, edgeIds: new Set(edges.map(e => e.id)) };
  }

  function el(doc, tag, attrs = {}, text) {
    const node = doc.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) if (value != null) node.setAttribute(key, String(value));
    if (text != null) node.textContent = text;
    return node;
  }
  function fitText(textEl, text, max) {
    textEl.textContent = text;
    let length = 0;
    try { length = textEl.getComputedTextLength(); } catch { return; }
    if (!length || length <= max) return;
    let lo = 0, hi = text.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      textEl.textContent = `${text.slice(0, mid)}…`;
      if (textEl.getComputedTextLength() <= max) lo = mid; else hi = mid - 1;
    }
    textEl.textContent = `${text.slice(0, lo)}…`;
  }
  function wrapLines(text, width) {
    const perLine = Math.max(8, Math.floor((width - 20) / NOTE_CHAR)), lines = [];
    for (const paragraph of String(text).split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/)) {
        if (!word) continue;
        if (line && (line.length + 1 + word.length) > perLine) { lines.push(line); line = ''; }
        line = line ? `${line} ${word}` : word;
        while (line.length > perLine) { lines.push(line.slice(0, perLine)); line = line.slice(perLine); }
      }
      lines.push(line);
    }
    return lines;
  }

  function create({ doc, model, library, config, layers, arrowId, arrowSelectedId }) {
    const E = config.editor, W = E.nodeWidth, H = E.nodeHeight;
    const items = { nodes: new Map(), edges: new Map(), groups: new Map(), notes: new Map() };
    const classCache = new Map();
    let classKey = '', presentationDoc = null, projection = null;
    function presentation() {
      if (presentationDoc !== model.diagram) { presentationDoc = model.diagram; projection = groupPresentation(presentationDoc); }
      return projection;
    }
    function classInfo(classId) {
      const key = JSON.stringify(model.diagram.classes);
      if (key !== classKey) { classCache.clear(); classKey = key; }
      if (!classCache.has(classId)) {
        const klass = D.resolveClass(classId, model.diagram, library, config);
        classCache.set(classId, { ...klass, ports: library.kernels[klass.kernel].ports });
      }
      return classCache.get(classId);
    }
    const findNode = id => model.diagram.nodes.find(n => n.id === id);
    function portLayout(ports) {
      const ins = ports.filter(p => p.direction === 'in'), outs = ports.filter(p => p.direction === 'out');
      const place = (list, x) => list.map((p, i) => ({ port: p, x, y: (H * (i + 1)) / (list.length + 1), hit: Math.min(PORT_HIT_MAX, H / (list.length + 1) / 2 + 2) }));
      return [...place(ins, 0), ...place(outs, W)];
    }
    function portPosition(nodeId, portId) {
      const n = findNode(nodeId);
      if (!n) return null;
      const visible = presentation();
      if (visible.hidden.has(nodeId)) { const p = visible.proxies.get(`${nodeId}.${portId}`); return p ? { x: p.x, y: p.y } : null; }
      const slot = portLayout(classInfo(n.classId).ports).find(s => s.port.id === portId);
      return slot ? { x: n.x + slot.x, y: n.y + slot.y } : null;
    }
    function nodeBox(id) { const n = findNode(id); return n && !presentation().hidden.has(id) ? { x: n.x, y: n.y, w: W, h: H } : null; }
    function groupBox(id) { return presentation().groups.get(id)?.box || null; }
    function visiblePorts() {
      return [...presentation().nodes.flatMap(n => portLayout(classInfo(n.classId).ports).map(s => ({ nodeId: n.id, portId: s.port.id, direction: s.port.direction, x: n.x + s.x, y: n.y + s.y }))), ...presentation().proxies.values()];
    }
    function portElement(nodeId, portId) { return items.nodes.get(nodeId)?.portEls.get(portId) || items.groups.get(presentation().hidden.get(nodeId)?.group.id)?.portEls.get(`${nodeId}.${portId}`) || null; }
    function portElements() { return [...items.nodes.values(), ...items.groups.values()].flatMap(item => [...item.portEls.values()]); }
    function noteBox(note) { const w = note.w || NOTE_WIDTH; return { x: note.x, y: note.y, w, h: wrapLines(note.text, w).length * NOTE_LINE + 16 }; }
    // Backward edges get a bounded handle so long reverse links do not sweep across the drawing.
    function curve(a, b) {
      const dx = b.x >= a.x ? Math.max(32, (b.x - a.x) * 0.5) : clamp(48 + Math.abs(b.y - a.y) / 4, 48, 120);
      return `M${a.x} ${a.y}C${a.x + dx} ${a.y} ${b.x - dx} ${b.y} ${b.x} ${b.y}`;
    }
    function edgePath(edge) {
      const a = portPosition(edge.from.nodeId, edge.from.portId), b = portPosition(edge.to.nodeId, edge.to.portId);
      return a && b ? curve(a, b) : '';
    }

    function createNode(id) {
      const g = el(doc, 'g', { class: 'sd-node', 'data-id': id, 'data-node-id': id, tabindex: 0, role: 'button' });
      const parts = {
        body: el(doc, 'rect', { class: 'sd-node-body', width: W, height: H, rx: 4 }),
        rule: el(doc, 'line', { class: 'sd-node-rule', x1: 0, x2: W, y1: H - STATUS_HEIGHT, y2: H - STATUS_HEIGHT }),
        glyph: el(doc, 'g', { class: 'sd-node-glyph', transform: `translate(14 ${(H - STATUS_HEIGHT - GLYPH_SIZE) / 2})` }),
        label: el(doc, 'text', { class: 'sd-node-label', x: TEXT_X, y: (H - STATUS_HEIGHT) / 2 - 2 }),
        klass: el(doc, 'text', { class: 'sd-node-class', x: TEXT_X, y: (H - STATUS_HEIGHT) / 2 + 13 }),
        status: el(doc, 'g', { class: 'sd-node-status', transform: `translate(0 ${H - STATUS_HEIGHT})`, 'data-width': W, 'data-height': STATUS_HEIGHT }),
        ports: el(doc, 'g', { class: 'sd-node-ports' }),
        title: el(doc, 'title'),
      };
      g.append(parts.title, parts.body, parts.rule, parts.glyph, parts.label, parts.klass, parts.status, parts.ports);
      layers.nodes.append(g);
      return { id, el: g, ...parts, sig: '', pos: '', kernel: '', portEls: new Map() };
    }
    function buildPorts(item, ports) {
      item.ports.replaceChildren(); item.portEls.clear();
      for (const slot of portLayout(ports)) {
        const out = slot.port.direction === 'out';
        const portLabel = `${slot.port.label}, ${slot.port.direction}, ${(slot.port.accepts || slot.port.emits).join(', ')}`;
        const g = el(doc, 'g', { class: 'sd-port', 'data-port': slot.port.id, 'data-direction': slot.port.direction, role: 'group', 'aria-label': portLabel, transform: `translate(${slot.x} ${slot.y})` });
        g.append(
          el(doc, 'circle', { class: 'sd-port-hit', r: slot.hit, 'data-port-id': slot.port.id, 'data-node-id': item.id, tabindex: 0, role: 'button', 'aria-label': portLabel }),
          el(doc, 'circle', { class: 'sd-port-dot', r: PORT_DOT }),
          el(doc, 'text', { class: 'sd-port-label', x: out ? 10 : -10, y: 4, 'text-anchor': out ? 'start' : 'end' }, slot.port.label),
        );
        item.ports.append(g); item.portEls.set(slot.port.id, g);
      }
    }
    function syncNodes(d, usedPorts) {
      const seen = new Set();
      for (const n of presentation().nodes) {
        seen.add(n.id);
        const item = items.nodes.get(n.id) || createNode(n.id);
        items.nodes.set(n.id, item);
        const info = classInfo(n.classId);
        const sig = `${n.label}\u0000${info.label}\u0000${info.glyph}\u0000${info.description}`;
        if (item.sig !== sig) {
          item.sig = sig;
          Glyphs.fill(item.glyph, info.glyph, GLYPH_SIZE);
          fitText(item.label, n.label || info.label, W - TEXT_X - 10);
          fitText(item.klass, info.label, W - TEXT_X - 10);
          item.el.setAttribute('aria-label', `${n.label || info.label}, ${info.label}`);
          item.el.setAttribute('aria-description', info.description);
          item.title.textContent = `${n.label || info.label} · ${info.label}\n${info.description}`;
        }
        if (item.kernel !== info.kernel) { item.kernel = info.kernel; buildPorts(item, info.ports); }
        const pos = `${n.x},${n.y}`;
        if (item.pos !== pos) { item.pos = pos; item.el.setAttribute('transform', `translate(${n.x} ${n.y})`); }
        for (const port of info.ports) item.portEls.get(port.id)?.classList.toggle('is-open', port.required && !usedPorts.has(`${n.id}.${port.id}`));
      }
      for (const [id, item] of items.nodes) if (!seen.has(id)) { item.el.remove(); items.nodes.delete(id); }
    }
    function syncEdges(d) {
      const seen = new Set();
      for (const edge of presentation().edges) {
        seen.add(edge.id);
        let item = items.edges.get(edge.id);
        if (!item) {
          const g = el(doc, 'g', { class: 'sd-edge', 'data-id': edge.id, 'data-edge-id': edge.id, tabindex: 0, role: 'button', 'aria-label': `Link ${edge.id}: ${edge.from.nodeId}.${edge.from.portId} to ${edge.to.nodeId}.${edge.to.portId}` });
          item = { el: g, hit: el(doc, 'path', { class: 'sd-edge-hit' }), path: el(doc, 'path', { class: 'sd-edge-line', 'marker-end': `url(#${arrowId})` }), label: el(doc, 'text', { class: 'sd-edge-label', 'text-anchor': 'middle' }), title: el(doc, 'title'), d: '', labelSig: '' };
          g.append(item.title, item.hit, item.path, item.label); layers.edges.append(g); items.edges.set(edge.id, item);
        }
        const description = `${edge.label ? edge.label + ': ' : ''}${edge.from.nodeId}.${edge.from.portId} to ${edge.to.nodeId}.${edge.to.portId}`;
        item.el.setAttribute('aria-label', `Link ${edge.id}: ${description}`);
        item.title.textContent = description;
        const path = edgePath(edge);
        if (item.d !== path) { item.d = path; item.hit.setAttribute('d', path); item.path.setAttribute('d', path); }
        const a = portPosition(edge.from.nodeId, edge.from.portId), b = portPosition(edge.to.nodeId, edge.to.portId);
        const labelSig = `${path}\u0000${edge.label || ''}`;
        if (item.labelSig !== labelSig) {
          item.labelSig = labelSig;
          item.label.setAttribute('x', (a.x + b.x) / 2); item.label.setAttribute('y', (a.y + b.y) / 2 - 8);
          fitText(item.label, edge.label || '', 180);
        }
        item.el.classList.toggle('is-async', edge.params.mode === 'async');
      }
      for (const [id, item] of items.edges) if (!seen.has(id)) { item.el.remove(); items.edges.delete(id); }
    }
    function syncGroups(d) {
      const seen = new Set();
      for (const group of d.groups) {
        seen.add(group.id);
        let item = items.groups.get(group.id);
        if (!item) {
          const g = el(doc, 'g', { class: 'sd-group', 'data-id': group.id, 'data-group-id': group.id });
          item = {
            el: g, body: el(doc, 'rect', { class: 'sd-group-body', rx: 4 }), hit: el(doc, 'rect', { class: 'sd-group-hit', rx: 4 }),
            tab: el(doc, 'g', { class: 'sd-group-tab', tabindex: 0, role: 'button' }), tabBg: el(doc, 'rect', { class: 'sd-group-tab-bg', height: GROUP_TAB_HEIGHT, rx: 4 }),
            label: el(doc, 'text', { class: 'sd-group-label', x: 8, y: 15 }), kind: el(doc, 'text', { class: 'sd-group-kind', y: 15 }),
            handle: el(doc, 'rect', { class: 'sd-group-handle', width: GROUP_HANDLE, height: GROUP_HANDLE, rx: 2 }),
            toggle: el(doc, 'g', { class: 'sd-group-toggle', tabindex: 0, role: 'button' }),
            toggleText: el(doc, 'text', { class: 'sd-group-toggle-label', x: FOLD_BUTTON / 2, y: 18, 'text-anchor': 'middle' }),
            summary: el(doc, 'text', { class: 'sd-group-summary', x: 12, y: 45 }),
            status: el(doc, 'g', { class: 'sd-group-status', transform: 'translate(0 72)', 'data-width': FOLDED_WIDTH, 'data-height': 20, 'pointer-events': 'none' }),
            ports: el(doc, 'g', { class: 'sd-group-ports' }), portEls: new Map(), sig: '',
          };
          item.tab.append(item.tabBg, item.label, item.kind);
          item.toggle.append(el(doc, 'rect', { class: 'sd-group-toggle-bg', width: FOLD_BUTTON, height: FOLD_BUTTON, rx: 3 }), item.toggleText);
          g.append(item.body, item.hit, item.tab, item.summary, item.status, item.handle, item.toggle, item.ports); layers.groups.append(g); items.groups.set(group.id, item);
        }
        const entry = presentation().groups.get(group.id), box = entry.box, collapsed = Boolean(group.collapsed);
        const sig = JSON.stringify([group, entry.members, entry.ports, entry.members.map(id => [findNode(id).label, findNode(id).classId])]);
        if (item.sig === sig) continue;
        item.sig = sig;
        item.el.dataset.kind = group.kind;
        item.el.classList.toggle('is-collapsed', collapsed);
        item.el.dataset.collapsed = String(collapsed);
        item.el.setAttribute('transform', `translate(${group.x} ${group.y})`);
        for (const r of [item.body, item.hit]) { r.setAttribute('width', box.w); r.setAttribute('height', box.h); }
        fitText(item.label, group.label || group.kind, Math.max(16, box.w - (collapsed ? 44 : 116)));
        const kindLabel = group.kind === 'resource' ? `${group.capacity} shared slots` : group.kind === 'boundary' ? 'visual boundary' : `${group.kind} failure domain`;
        item.kind.textContent = kindLabel;
        let labelWidth = 0;
        try { labelWidth = item.label.getComputedTextLength(); } catch { labelWidth = 0; }
        if (!labelWidth) labelWidth = (group.label || group.kind).length * 7;
        item.kind.setAttribute('x', collapsed ? 12 : 8 + labelWidth + 8); item.kind.setAttribute('y', collapsed ? 62 : 15);
        fitText(item.kind, kindLabel, Math.max(16, box.w - (collapsed ? 24 : labelWidth + 56)));
        item.tabBg.setAttribute('width', Math.max(1, box.w - FOLD_BUTTON));
        item.tab.setAttribute('aria-label', `${group.label || group.kind}, ${kindLabel}`);
        item.handle.setAttribute('x', box.w - GROUP_HANDLE); item.handle.setAttribute('y', box.h - GROUP_HANDLE);
        item.handle.setAttribute('display', collapsed ? 'none' : '');
        item.status.setAttribute('display', collapsed ? '' : 'none');
        item.summary.textContent = collapsed ? `${entry.members.length} component${entry.members.length === 1 ? '' : 's'} inside` : '';
        item.toggle.setAttribute('transform', `translate(${box.w - FOLD_BUTTON} 0)`);
        item.toggle.setAttribute('aria-expanded', String(!collapsed));
        item.toggle.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} ${group.label || group.id}: ${entry.members.length} components`);
        item.toggleText.textContent = collapsed ? '+' : '−';
        item.ports.replaceChildren(); item.portEls.clear();
        for (const proxy of entry.ports) {
          const n = findNode(proxy.nodeId), port = classInfo(n.classId).ports.find(p => p.id === proxy.portId), out = proxy.direction === 'out';
          const label = `${n.label || n.id} · ${port.label}`, description = `${label}, ${proxy.nodeId}.${proxy.portId}, ${proxy.direction}`;
          const g = el(doc, 'g', { class: 'sd-port sd-proxy-port', 'data-node-id': proxy.nodeId, 'data-port': proxy.portId, 'data-direction': proxy.direction, transform: `translate(${proxy.x - box.x} ${proxy.y - box.y})` });
          g.append(el(doc, 'title', {}, description), el(doc, 'circle', { class: 'sd-port-hit', r: 10, tabindex: 0, role: 'button', 'aria-label': description, 'data-node-id': proxy.nodeId, 'data-port-id': proxy.portId }),
            el(doc, 'circle', { class: 'sd-port-dot', r: PORT_DOT }), el(doc, 'text', { class: 'sd-port-label', x: out ? 10 : -10, y: 4, 'text-anchor': out ? 'start' : 'end' }, label));
          item.ports.append(g); item.portEls.set(`${proxy.nodeId}.${proxy.portId}`, g);
        }
      }
      for (const [id, item] of items.groups) if (!seen.has(id)) { item.el.remove(); items.groups.delete(id); }
    }
    function syncNotes(d) {
      const seen = new Set();
      for (const note of d.notes) {
        seen.add(note.id);
        let item = items.notes.get(note.id);
        if (!item) {
          const g = el(doc, 'g', { class: 'sd-note', 'data-id': note.id, 'data-note-id': note.id, tabindex: 0, role: 'button' });
          item = { el: g, body: el(doc, 'rect', { class: 'sd-note-body', rx: 4 }), text: el(doc, 'text', { class: 'sd-note-text' }), sig: '' };
          g.append(item.body, item.text); layers.groups.append(g); items.notes.set(note.id, item);
        }
        const sig = JSON.stringify(note);
        if (item.sig === sig) continue;
        item.sig = sig;
        const box = noteBox(note), lines = wrapLines(note.text, box.w);
        item.el.setAttribute('transform', `translate(${note.x} ${note.y})`);
        item.body.setAttribute('width', box.w); item.body.setAttribute('height', box.h);
        item.text.replaceChildren(...lines.map((line, i) => el(doc, 'tspan', { x: 10, y: 20 + i * NOTE_LINE }, line || ' ')));
        item.el.setAttribute('aria-label', `Note: ${note.text || 'empty'}`);
      }
      for (const [id, item] of items.notes) if (!seen.has(id)) { item.el.remove(); items.notes.delete(id); }
    }
    function syncSelection() {
      const s = model.selection;
      for (const key of ['nodes', 'groups', 'notes', 'edges']) {
        const selected = new Set(s[key]);
        for (const [id, item] of items[key]) {
          const on = selected.has(id);
          item.el.classList.toggle('is-selected', on);
          if (key === 'edges') item.path.setAttribute('marker-end', `url(#${on ? arrowSelectedId : arrowId})`);
          else (key === 'groups' ? item.tab : item.el).setAttribute('aria-pressed', String(on));
        }
      }
    }
    function render() {
      const d = model.diagram, used = new Set();
      for (const e of d.edges) { used.add(`${e.from.nodeId}.${e.from.portId}`); used.add(`${e.to.nodeId}.${e.to.portId}`); }
      syncGroups(d); syncNotes(d); syncNodes(d, used); syncEdges(d); syncSelection();
    }

    function invalidateText() { for (const item of [...items.nodes.values(), ...items.groups.values()]) item.sig = ''; for (const item of items.edges.values()) item.labelSig = ''; }

    return { items, classInfo, findNode, portLayout, portPosition, nodeBox, groupBox, noteBox, visiblePorts, portElement, portElements, presentation, curve, render, invalidateText };
  }

  return Object.freeze({ create, groupPresentation, el, STATUS_HEIGHT, PORT_DOT });
});
