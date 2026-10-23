(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./diagram.js') : root.SimulatteSystemDiagramDocument);
  if (node) module.exports = api; else root.SimulatteSystemDiagramCanvas = api;
})(globalThis, function (documents) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg', PORT_TOP = 52, PORT_GAP = 22, READABLE_ZOOM = .85;
  let instance = 0;
  function el(tag, attrs = {}, text) {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    if (text !== undefined) node.textContent = String(text);
    return node;
  }
  function create({ host, model, library, config, onMessage = () => {}, onView = () => {} }) {
    if (!host || !model || !library || !config) throw Error('System Diagram canvas requires host, editor model, library and configuration');
    const id = `sd-canvas-${++instance}`, width = config.editor.nodeWidth;
    const svg = el('svg', { class: 'sd-canvas', tabindex: 0, role: 'group', 'aria-label': 'System architecture canvas. Drag nodes, connect ports, or use keyboard selection and arrow keys.' });
    const defs = el('defs'), pattern = el('pattern', { id: `${id}-grid`, width: config.editor.grid * 3, height: config.editor.grid * 3, patternUnits: 'userSpaceOnUse' });
    pattern.append(el('circle', { cx: 1, cy: 1, r: .7, class: 'sd-grid-dot' }));
    const marker = el('marker', { id: `${id}-arrow`, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 6, markerHeight: 6, orient: 'auto' });
    marker.append(el('path', { d: 'M1 1 L7 4 L1 7', class: 'sd-arrow' })); defs.append(pattern, marker);
    const background = el('rect', { width: '100%', height: '100%', fill: `url(#${id}-grid)`, 'data-background': 'true' }), scene = el('g', { class: 'sd-scene' });
    const layers = Object.freeze(Object.fromEntries(['groups', 'edges', 'nodes', 'overlay', 'interaction'].map(name => [name, el('g', { class: `sd-layer-${name}` })])));
    scene.append(...Object.values(layers)); svg.append(defs, background, scene); host.classList.add('sd-canvas-host'); host.replaceChildren(svg);
    let view = { ...model.diagram.view }, diagram = model.diagram, selection = model.selection;
    let gesture = null, connection = null, wirePoint = null, disposed = false, space = false, multiSelect = false, runState = null, pending = false;
    const pointers = new Map(), nodeElements = new Map(), edgeElements = new Map(), portElements = new Map();
    const touch = Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches || globalThis.navigator?.maxTouchPoints > 0);
    const emptySelection = () => ({ nodes: [], edges: [], groups: [], notes: [] });
    const short = (s, n = 21) => String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s);
    function send(command) {
      const result = model.apply(command);
      if (!result.ok) onMessage(result.error || 'Diagram change rejected', true);
      return result;
    }
    function select(kind, itemId, additive = false) {
      if (additive && selection[kind].includes(itemId)) {
        const value = model.selection; value[kind] = value[kind].filter(id => id !== itemId); model.select(value); return;
      }
      const value = emptySelection(); value[kind] = [itemId]; model.select(value, { additive });
    }
    function ports(node) { return library.kernels[documents.resolveClass(node.classId, diagram, library, config).kernel].ports; }
    function nodeBox(nodeOrId) {
      const node = typeof nodeOrId === 'string' ? diagram.nodes.find(n => n.id === nodeOrId) : nodeOrId;
      if (!node) return null;
      const specs = ports(node), count = Math.max(specs.filter(p => p.direction === 'in').length, specs.filter(p => p.direction === 'out').length, 1);
      const h = Math.max(config.editor.nodeHeight, PORT_TOP + (count - 1) * PORT_GAP + 20), p = gesture?.positions?.get(node.id) || node;
      return { x: p.x, y: p.y, w: width, h, width, height: h };
    }
    function portPosition(nodeId, portId) {
      const node = diagram.nodes.find(n => n.id === nodeId); if (!node) return null;
      const specs = ports(node), port = specs.find(p => p.id === portId); if (!port) return null;
      const row = specs.filter(p => p.direction === port.direction).findIndex(p => p.id === portId), box = nodeBox(node);
      return { x: box.x + (port.direction === 'out' ? box.w : 0), y: box.y + PORT_TOP + row * PORT_GAP, direction: port.direction };
    }
    function screenToWorld(point, y) {
      const p = typeof point === 'number' ? { x: point, y } : point, rect = svg.getBoundingClientRect();
      return { x: (p.x - rect.left - view.x) / view.zoom, y: (p.y - rect.top - view.y) / view.zoom };
    }
    function curve(a, b) {
      const bend = Math.max(50, Math.abs(b.x - a.x) * .45);
      return `M${a.x} ${a.y} C${a.x + bend} ${a.y},${b.x - bend} ${b.y},${b.x} ${b.y}`;
    }
    function currentItem(item) { return gesture?.positions?.has(item.id) ? { ...item, ...gesture.positions.get(item.id) } : item; }
    function renderGroups() {
      for (const source of diagram.groups) {
        const group = currentItem(source), selected = selection.groups.includes(group.id);
        const g = el('g', { 'data-group-id': group.id, class: 'sd-group', 'data-kind': group.kind, 'data-selected': selected, tabindex: 0, role: 'button', 'aria-label': `${group.label}, ${group.kind}`, 'aria-pressed': selected });
        const meaning = group.kind === 'resource' ? `${group.capacity} shared slots` : ['zone', 'region'].includes(group.kind) ? 'failure domain' : 'visual boundary';
        g.append(el('rect', { x: group.x, y: group.y, width: group.w, height: group.h, rx: 10, class: 'sd-group-body' }), el('text', { x: group.x + 12, y: group.y + 21, class: 'sd-group-label' }, `${group.label} · ${meaning}`));
        layers.groups.append(g);
      }
      for (const source of diagram.notes) {
        const note = currentItem(source), g = el('g', { 'data-note-id': note.id, class: 'sd-note', tabindex: 0, role: 'button', 'aria-label': `Note: ${note.text}` });
        g.append(el('rect', { x: note.x, y: note.y, width: note.w || 200, height: 48, rx: 4, class: 'sd-note-body', 'data-selected': selection.notes.includes(note.id) }), el('text', { x: note.x + 10, y: note.y + 27, class: 'sd-note-label' }, short(note.text, 30)));
        layers.groups.append(g);
      }
    }
    function renderEdges() {
      for (const edge of diagram.edges) {
        const a = portPosition(edge.from.nodeId, edge.from.portId), b = portPosition(edge.to.nodeId, edge.to.portId); if (!a || !b) continue;
        const params = documents.resolveEdgeParams(edge, library).values, isSelected = selection.edges.includes(edge.id), d = curve(a, b);
        const g = el('g', { 'data-edge-id': edge.id, class: 'sd-edge', tabindex: 0, role: 'button', 'aria-label': `${edge.id}: ${edge.from.nodeId}.${edge.from.portId} to ${edge.to.nodeId}.${edge.to.portId}`, 'aria-pressed': isSelected });
        const path = el('path', { d, class: 'sd-edge-line', 'data-selected': isSelected, 'marker-end': `url(#${id}-arrow)` });
        g.append(el('title', {}, `${params.bandwidthMbps} Mbit/s · ${params.latencyMs} ms · ${params.mode}`), el('path', { d, class: 'sd-edge-hit' }), path);
        edgeElements.set(edge.id, path); layers.edges.append(g);
        if (isSelected) {
          const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2 - 12;
          layers.interaction.append(el('rect', { x: x - 66, y: y - 14, width: 132, height: 23, rx: 4, class: 'sd-edge-label-bg' }), el('text', { x, y: y + 1, 'text-anchor': 'middle', class: 'sd-edge-label' }, `${params.bandwidthMbps} Mbit/s · ${params.latencyMs} ms`));
          for (const [side, p] of [['from', a], ['to', b]]) {
            const x = p.x + (side === 'from' ? 1 : -1) * (touch ? 36 / view.zoom : 18);
            const handle = el('g', { 'data-reconnect': edge.id, 'data-side': side, class: 'sd-reconnect-target', tabindex: 0, role: 'button', 'aria-label': `Reconnect ${side} endpoint of ${edge.id}` });
            handle.append(el('circle', { cx: x, cy: p.y, r: touch ? 22 / view.zoom : 11, class: 'sd-port-hit' }), el('circle', { cx: x, cy: p.y, r: 8, class: 'sd-reconnect' })); layers.interaction.append(handle);
          }
        }
      }
    }
    function renderNodes() {
      for (const node of diagram.nodes) {
        const box = nodeBox(node), klass = documents.resolveClass(node.classId, diagram, library, config), selected = selection.nodes.includes(node.id);
        const g = el('g', { transform: `translate(${box.x},${box.y})`, class: 'sd-node', 'data-node-id': node.id, 'data-category': klass.category, 'data-selected': selected, tabindex: 0, role: 'button', 'aria-label': `${node.label}, class ${klass.label}`, 'aria-pressed': selected });
        g.append(el('title', {}, `${node.label} · ${klass.label}`), el('rect', { width: box.w, height: box.h, rx: 8, class: 'sd-node-body' }), el('rect', { x: 11, y: 10, width: 25, height: 25, rx: 6, class: 'sd-node-icon-bg' }));
        g.append(el('text', { x: 23, y: 27, 'text-anchor': 'middle', class: 'sd-node-icon' }, short(klass.kernel.toUpperCase(), 3)));
        g.append(el('text', { x: 44, y: 21, class: 'sd-node-label' }, short(node.label, 16)), el('text', { x: 44, y: 35, class: 'sd-node-class' }, short(klass.label, 23)));
        for (const port of ports(node)) {
          const p = portPosition(node.id, port.id), x = p.x - box.x, y = p.y - box.y, armed = connection?.nodeId === node.id && connection?.portId === port.id;
          const payloads = port.accepts || port.emits;
          const target = el('g', { class: 'sd-port-target', 'data-port-id': port.id, 'data-port': port.direction, 'data-node-id': node.id, 'data-armed': armed, tabindex: 0, role: 'button', 'aria-label': `${node.label} ${port.label}, ${port.direction}, ${payloads.join(', ')}` });
          target.append(el('title', {}, `${port.label}: ${payloads.join(', ')}`), el('circle', { cx: x, cy: y, r: touch ? 22 / view.zoom : Math.max(10, 7 / view.zoom), class: 'sd-port-hit' }), el('circle', { cx: x, cy: y, r: 6, class: 'sd-port' }));
          g.append(el('text', { x: port.direction === 'in' ? 11 : box.w - 11, y: y + 3, 'text-anchor': port.direction === 'in' ? 'start' : 'end', class: 'sd-port-label' }, short(port.label, 13)), target);
          portElements.set(`${node.id}\0${port.id}`, target);
        }
        g.append(el('g', { class: 'sd-node-status', transform: `translate(11,${box.h - 7})` }));
        nodeElements.set(node.id, g); layers.nodes.append(g);
      }
    }
    function renderState() {
      if (!runState) return;
      for (const [nodeId, g] of nodeElements) {
        const state = runState.nodes?.[nodeId], status = g.querySelector('.sd-node-status');
        if (!status) continue;
        if (pending) status.append(el('text', { class: 'sd-state-label' }, 'Pending revision'));
        else if (state) {
          const text = state.health === 'down' ? 'Down' : `${state.busy} busy · ${state.queue} queued`;
          status.append(el('circle', { cx: 3, cy: -3, r: 2.5, class: 'sd-health', 'data-health': state.health }), el('text', { x: 10, class: 'sd-state-label' }, text));
        }
      }
    }
    function focusIdentity() {
      const focused = document.activeElement;
      if (!focused || !svg.contains(focused)) return null;
      for (const attr of ['data-reconnect', 'data-port-id', 'data-node-id', 'data-edge-id', 'data-group-id', 'data-note-id']) if (focused.hasAttribute(attr)) return { attr, id: focused.getAttribute(attr), nodeId: focused.getAttribute('data-node-id'), side: focused.getAttribute('data-side') };
      return null;
    }
    function render() {
      if (disposed) return;
      diagram = model.diagram; selection = model.selection;
      const focused = focusIdentity(); nodeElements.clear(); edgeElements.clear(); portElements.clear();
      for (const name of ['groups', 'edges', 'nodes', 'interaction']) layers[name].replaceChildren();
      scene.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.zoom})`); svg.dataset.zoom = view.zoom.toFixed(3); svg.dataset.multiSelect = String(multiSelect);
      renderGroups(); renderEdges(); renderNodes(); renderState();
      if (connection && wirePoint) {
        const fixed = portPosition(connection.nodeId, connection.portId);
        if (fixed) layers.interaction.append(el('path', { d: fixed.direction === 'out' ? curve(fixed, wirePoint) : curve(wirePoint, fixed), class: 'sd-wire-preview' }));
      }
      if (gesture?.kind === 'marquee') {
        const a = gesture.start, b = gesture.end;
        layers.interaction.append(el('rect', { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y), class: 'sd-marquee' }));
      }
      if (focused && !gesture) {
        let selector = `[${focused.attr}="${CSS.escape(focused.id)}"]`;
        if (focused.attr === 'data-port-id') selector += `[data-node-id="${CSS.escape(focused.nodeId)}"]`;
        if (focused.side) selector += `[data-side="${focused.side}"]`;
        svg.querySelector(selector)?.focus({ preventScroll: true });
      }
    }
    function updateView(next, persist = true) {
      view = { x: next.x, y: next.y, zoom: Math.max(config.editor.minZoom, Math.min(config.editor.maxZoom, next.zoom)) };
      if (persist) send({ type: 'setView', view });
      render(); onView({ ...view });
    }
    function zoomAt(factor, x, y) {
      const p = screenToWorld({ x, y }), rect = svg.getBoundingClientRect(), zoom = Math.max(config.editor.minZoom, Math.min(config.editor.maxZoom, view.zoom * factor));
      updateView({ x: x - rect.left - p.x * zoom, y: y - rect.top - p.y * zoom, zoom });
    }
    function zoomBy(factor) { const r = svg.getBoundingClientRect(); zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2); }
    function fit(options = {}) {
      const boxes = diagram.nodes.map(nodeBox); if (!boxes.length) return updateView({ x: 40, y: 40, zoom: 1 });
      const rect = svg.getBoundingClientRect(), minX = Math.min(...boxes.map(b => b.x)) - 32, minY = Math.min(...boxes.map(b => b.y)) - 44;
      const maxX = Math.max(...boxes.map(b => b.x + b.w)) + 32, maxY = Math.max(...boxes.map(b => b.y + b.h)) + 32;
      const zoom = Math.max(config.editor.minZoom, Math.min(1.15, (rect.width - 40) / (maxX - minX), (rect.height - 40) / (maxY - minY)));
      if (options.readable && rect.width < 600 && zoom < READABLE_ZOOM) {
        const first = diagram.nodes.find(node => { const specs = ports(node); return specs.some(p => p.direction === 'out') && !specs.some(p => p.direction === 'in'); }) || diagram.nodes[0];
        const box = nodeBox(first), readableZoom = Math.min(config.editor.maxZoom, READABLE_ZOOM);
        updateView({ x: 24 - box.x * readableZoom, y: (rect.height - box.h * readableZoom) / 2 - box.y * readableZoom, zoom: readableZoom }); return;
      }
      updateView({ x: (rect.width - (maxX - minX) * zoom) / 2 - minX * zoom, y: (rect.height - (maxY - minY) * zoom) / 2 - minY * zoom, zoom });
    }
    function dropClassAt(classId, x, y) { const p = screenToWorld(typeof x === 'object' ? x : { x, y }); return send({ type: 'addNode', classId, x: Math.round(p.x - width / 2), y: Math.round(p.y - config.editor.nodeHeight / 2) }); }
    function portAt(x, y) {
      const p = screenToWorld({ x, y });
      let nearest = null, distance = touch ? 22 : 12;
      for (const target of portElements.values()) {
        const position = portPosition(target.dataset.nodeId, target.dataset.portId), d = Math.hypot(p.x - position.x, p.y - position.y) * view.zoom;
        if (d < distance) { nearest = target; distance = d; }
      }
      return nearest;
    }
    function nodeAt(x, y) {
      const p = screenToWorld({ x, y });
      return [...diagram.nodes].reverse().find(node => { const b = nodeBox(node); return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h; }) || null;
    }
    function choosePort(nodeId, portId, reconnectId = null, side = null) {
      const p = portPosition(nodeId, portId); if (!p) return;
      if (connection && !reconnectId) {
        const origin = portPosition(connection.nodeId, connection.portId);
        if (origin.direction === p.direction) { connection = { nodeId, portId }; wirePoint = p; render(); return; }
        const first = { nodeId: connection.nodeId, portId: connection.portId }, second = { nodeId, portId }, from = p.direction === 'out' ? second : first, to = p.direction === 'in' ? second : first;
        const command = connection.reconnectId ? { type: 'reconnect', id: connection.reconnectId, from, to } : { type: 'connect', from, to };
        connection = null; wirePoint = null;
        const result = send(command);
        if (result.ok) {
          const warning = model.issues().find(issue => issue.kind === 'payload-mismatch' && issue.edgeId === (result.id || command.id));
          if (warning) onMessage(warning.message, true);
        }
        render(); return;
      }
      connection = { nodeId, portId, reconnectId, side }; wirePoint = p;
      onMessage(`Choose an ${p.direction === 'out' ? 'input' : 'output'} port${reconnectId ? ' to reconnect' : ' to connect'}.`); render();
    }
    function beginReconnect(target) {
      const edge = diagram.edges.find(e => e.id === target.dataset.reconnect), side = target.dataset.side;
      connection = null; const fixed = side === 'from' ? edge.to : edge.from; choosePort(fixed.nodeId, fixed.portId, edge.id, side);
    }
    function selectedItems() {
      const ids = new Set([...selection.nodes, ...selection.groups, ...selection.notes]);
      for (const node of diagram.nodes) if (selection.groups.includes(node.groupId)) ids.add(node.id);
      return [...diagram.nodes, ...diagram.groups, ...diagram.notes].filter(item => ids.has(item.id));
    }
    function pointerDown(e) {
      if (e.button !== 0 && e.pointerType !== 'touch') return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      svg.setPointerCapture(e.pointerId);
      if (pointers.size === 2) {
        const points = [...pointers.values()]; connection = null; wirePoint = null;
        gesture = { kind: 'pinch', distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y), zoom: view.zoom }; render(); svg.setPointerCapture(e.pointerId); e.preventDefault(); return;
      }
      const body = nodeAt(e.clientX, e.clientY);
      let reconnect = e.target.closest('[data-reconnect]'), port = portAt(e.clientX, e.clientY) || e.target.closest('[data-port-id]');
      if (body && port) {
        const p = screenToWorld({ x: e.clientX, y: e.clientY }), position = portPosition(port.dataset.nodeId, port.dataset.portId);
        // Expanded port targets remain useful outside a node without stealing its draggable interior.
        if (Math.hypot(p.x - position.x, p.y - position.y) * view.zoom > Math.max(6, 6 * view.zoom + 2)) port = null;
      }
      if (body && reconnect) {
        const edge = diagram.edges.find(row => row.id === reconnect.dataset.reconnect), side = reconnect.dataset.side, end = edge[side], p = portPosition(end.nodeId, end.portId);
        const point = screenToWorld({ x: e.clientX, y: e.clientY }), x = p.x + (side === 'from' ? 1 : -1) * (touch ? 36 / view.zoom : 18);
        if (Math.hypot(point.x - x, point.y - p.y) * view.zoom > Math.max(8, 8 * view.zoom + 2)) reconnect = null;
      }
      if (reconnect) { beginReconnect(reconnect); gesture = { kind: 'wire', x: e.clientX, y: e.clientY }; svg.setPointerCapture(e.pointerId); e.preventDefault(); return; }
      if (port) {
        const previous = connection; choosePort(port.dataset.nodeId, port.dataset.portId);
        if (!previous || connection) gesture = { kind: 'wire', x: e.clientX, y: e.clientY };
        svg.setPointerCapture(e.pointerId); e.preventDefault(); return;
      }
      const node = body ? nodeElements.get(body.id) : e.target.closest('.sd-node'), edge = e.target.closest('[data-edge-id]'), group = e.target.closest('[data-group-id]'), note = e.target.closest('[data-note-id]');
      if (!space && (node || group || note)) {
        const kind = node ? 'nodes' : group ? 'groups' : 'notes', itemId = node?.dataset.nodeId || group?.dataset.groupId || note.dataset.noteId;
        if (!selection[kind].includes(itemId) || e.shiftKey || multiSelect) select(kind, itemId, e.shiftKey || multiSelect);
        if (!selection[kind].includes(itemId)) { e.preventDefault(); return; }
        const origins = new Map(selectedItems().map(item => [item.id, { x: item.x, y: item.y }]));
        gesture = { kind: 'items', start: screenToWorld({ x: e.clientX, y: e.clientY }), origins, positions: new Map(origins), moved: false };
      } else if (!space && edge) { select('edges', edge.dataset.edgeId, e.shiftKey || multiSelect); e.preventDefault(); return; }
      else if (e.shiftKey || multiSelect) { const p = screenToWorld({ x: e.clientX, y: e.clientY }); gesture = { kind: 'marquee', start: p, end: p, additive: e.shiftKey || multiSelect }; }
      else {
        connection = null; wirePoint = null; if (!space) model.select(emptySelection());
        gesture = { kind: 'pan', x: e.clientX, y: e.clientY, original: { ...view } }; svg.classList.add('is-panning');
      }
      svg.setPointerCapture(e.pointerId); e.preventDefault();
    }
    function pointerMove(e) {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (gesture?.kind === 'pinch' && pointers.size === 2) {
        const ps = [...pointers.values()], distance = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
        zoomAt(gesture.zoom * distance / Math.max(gesture.distance, 1) / view.zoom, (ps[0].x + ps[1].x) / 2, (ps[0].y + ps[1].y) / 2); e.preventDefault(); return;
      }
      if (gesture?.kind === 'items') {
        const p = screenToWorld({ x: e.clientX, y: e.clientY }), dx = p.x - gesture.start.x, dy = p.y - gesture.start.y;
        gesture.moved ||= Math.hypot(dx, dy) > 2;
        for (const [itemId, origin] of gesture.origins) gesture.positions.set(itemId, { x: Math.round(origin.x + dx), y: Math.round(origin.y + dy) });
        render(); e.preventDefault();
      } else if (gesture?.kind === 'pan') {
        updateView({ ...view, x: gesture.original.x + e.clientX - gesture.x, y: gesture.original.y + e.clientY - gesture.y }, false); e.preventDefault();
      } else if (gesture?.kind === 'marquee') { gesture.end = screenToWorld({ x: e.clientX, y: e.clientY }); render(); e.preventDefault(); }
      else if (connection) { wirePoint = screenToWorld({ x: e.clientX, y: e.clientY }); render(); }
    }
    function pointerUp(e) {
      pointers.delete(e.pointerId); const ended = gesture; gesture = null; svg.classList.remove('is-panning');
      if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
      if (ended?.kind === 'items' && ended.moved) send({ type: 'setPositions', positions: [...ended.positions].map(([itemId, p]) => ({ id: itemId, ...p })) });
      else if (ended?.kind === 'pan' || ended?.kind === 'pinch') updateView(view);
      else if (ended?.kind === 'marquee') {
        const a = ended.start, b = ended.end, left = Math.min(a.x, b.x), top = Math.min(a.y, b.y), right = Math.max(a.x, b.x), bottom = Math.max(a.y, b.y);
        const hits = diagram.nodes.filter(n => { const box = nodeBox(n); return box.x >= left && box.y >= top && box.x + box.w <= right && box.y + box.h <= bottom; }).map(n => n.id);
        model.select({ ...emptySelection(), nodes: hits }, { additive: ended.additive });
      } else if (ended?.kind === 'wire' && Math.hypot(e.clientX - ended.x, e.clientY - ended.y) > 5) {
        const target = portAt(e.clientX, e.clientY);
        if (target && connection && portPosition(target.dataset.nodeId, target.dataset.portId).direction !== portPosition(connection.nodeId, connection.portId).direction) choosePort(target.dataset.nodeId, target.dataset.portId);
        else { connection = null; wirePoint = null; onMessage('Connect an output to a compatible input port. No edge changed.', true); }
      }
      render();
    }
    function pointerCancel(e) {
      pointers.delete(e.pointerId); gesture = null; connection = null; wirePoint = null; svg.classList.remove('is-panning');
      if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId); render();
    }
    function keyDown(e) {
      if (e.key === ' ') { space = true; e.preventDefault(); }
      const port = e.target.closest('[data-port-id]'), reconnect = e.target.closest('[data-reconnect]');
      if (['Enter', ' '].includes(e.key) && port) { e.preventDefault(); choosePort(port.dataset.nodeId, port.dataset.portId); return; }
      if (['Enter', ' '].includes(e.key) && reconnect) { e.preventDefault(); beginReconnect(reconnect); return; }
      const node = e.target.closest('.sd-node'), edge = e.target.closest('[data-edge-id]'), group = e.target.closest('[data-group-id]'), note = e.target.closest('[data-note-id]');
      if (['Enter', ' '].includes(e.key) && (node || edge || group || note)) { e.preventDefault(); select(node ? 'nodes' : edge ? 'edges' : group ? 'groups' : 'notes', node?.dataset.nodeId || edge?.dataset.edgeId || group?.dataset.groupId || note.dataset.noteId, e.shiftKey || multiSelect); return; }
      if (['Delete', 'Backspace'].includes(e.key)) { e.preventDefault(); send({ type: 'deleteItems' }); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); send({ type: 'duplicate' }); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); model.select({ ...emptySelection(), nodes: diagram.nodes.map(n => n.id) }); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) model.redo(); else model.undo(); return; }
      const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (delta) { e.preventDefault(); const step = config.editor.grid * (e.shiftKey ? 5 : 1); send({ type: 'moveItems', dx: delta[0] * step, dy: delta[1] * step }); return; }
      if (e.key === 'Escape') { gesture = null; connection = null; wirePoint = null; model.select(emptySelection()); render(); }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(1.2); }
      if (e.key === '-') { e.preventDefault(); zoomBy(1 / 1.2); }
      if (e.key.toLowerCase() === 'f' && !(e.ctrlKey || e.metaKey)) { e.preventDefault(); fit(); }
    }
    const handlers = {
      pointerdown: pointerDown, pointermove: pointerMove, pointerup: pointerUp, pointercancel: pointerCancel, keydown: keyDown, keyup: e => { if (e.key === ' ') space = false; },
      wheel: e => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); zoomAt(Math.exp(-e.deltaY * .002), e.clientX, e.clientY); },
      dragover: e => { if ([...e.dataTransfer.types].includes('application/x-simulatte-class')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } },
      drop: e => { const classId = e.dataTransfer.getData('application/x-simulatte-class'); if (classId) { e.preventDefault(); dropClassAt(classId, e.clientX, e.clientY); } }
    };
    for (const [name, handler] of Object.entries(handlers)) svg.addEventListener(name, handler, name === 'wheel' ? { passive: false } : undefined);
    const unsubscribe = model.subscribe(event => { if (event.kind === 'view' || event.kind === 'load') view = { ...event.diagram.view }; render(); });
    render();
    return Object.freeze({
      nodeBox, portPosition, edgeElement: edgeId => edgeElements.get(edgeId) || null, nodeElement: nodeId => nodeElements.get(nodeId) || null,
      fit, zoomBy, getView: () => ({ ...view }), setView: value => updateView(value), screenToWorld, layers, render, dropClassAt,
      setMultiSelect: enabled => { multiSelect = Boolean(enabled); svg.dataset.multiSelect = String(multiSelect); },
      setState: (value, options = {}) => { runState = value; pending = Boolean(options.pending); render(); },
      dispose: () => { disposed = true; unsubscribe?.(); for (const [name, handler] of Object.entries(handlers)) svg.removeEventListener(name, handler); svg.remove(); }
    });
  }
  return Object.freeze({ create });
});
