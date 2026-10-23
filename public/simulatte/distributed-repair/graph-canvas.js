(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteGraphCanvas = api;
})(globalThis, function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const WIDTH = 176, HEIGHT = 90, PORT_Y = 58, MIN_ZOOM = 0.18, MAX_ZOOM = 2.5;
  let instance = 0;
  function svgElement(tag, attrs = {}, text) {
    const el = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function create({ host, onEdit, onSelect = () => {}, onMessage = () => {}, onView = () => {} }) {
    if (!host || typeof onEdit !== 'function') throw Error('Graph canvas requires a host and an edit handler');
    const prefix = `system-canvas-${++instance}`;
    const svg = svgElement('svg', { class: 'graph-canvas', tabindex: 0, role: 'group', 'aria-label': 'System architecture canvas. Select nodes, move with arrow keys, connect output and input ports.' });
    const defs = svgElement('defs');
    const pattern = svgElement('pattern', { id: `${prefix}-grid`, width: 24, height: 24, patternUnits: 'userSpaceOnUse' });
    pattern.append(svgElement('circle', { cx: 1, cy: 1, r: 0.75, class: 'graph-grid-dot' }));
    const marker = svgElement('marker', { id: `${prefix}-arrow`, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 6, markerHeight: 6, orient: 'auto' });
    marker.append(svgElement('path', { d: 'M1 1 L7 4 L1 7', class: 'graph-arrow' }));
    defs.append(pattern, marker);
    const background = svgElement('rect', { width: '100%', height: '100%', fill: `url(#${prefix}-grid)`, 'data-background': 'true' });
    const scene = svgElement('g', { class: 'graph-scene' });
    svg.append(defs, background, scene); host.classList.add('graph-canvas-host'); host.replaceChildren(svg);
    let doc = null, selected = [], states = {}, pending = false, fitted = false, multiSelect = false;
    let view = { x: 40, y: 60, zoom: 1 }, gesture = null, connectStart = null, preview = null;
    let hoveredPort = null, spaceHeld = false, disposed = false;
    let reconnectHandles = [];
    const touches = new Map();
    const hasTouch = globalThis.matchMedia?.('(pointer: coarse)').matches || globalThis.navigator?.maxTouchPoints > 0;
    function report(text, error = false) { onMessage(text, error); }
    function dispatch(action) {
      try { onEdit(action); return true; }
      catch (error) { report(error.message, true); render(); return false; }
    }
    function setSelection(ids) {
      selected = [...new Set(ids)]; onSelect([...selected]); render();
    }
    function setDocument(value, options = {}) {
      doc = value;
      if (options.selectedIds || options.selection) selected = [...(options.selectedIds || options.selection)];
      states = options.states || {}; pending = Boolean(options.pending);
      selected = selected.filter(id => [...doc.nodes, ...doc.links, ...doc.clusters].some(item => item.id === id));
      if (!fitted && doc.nodes.length) { fit(); fitted = true; }
      else render();
    }
    function dimensions() { const bounds = svg.getBoundingClientRect(); return { width: bounds.width || 900, height: bounds.height || 600 }; }
    function positionAt(clientX, clientY) {
      const bounds = svg.getBoundingClientRect();
      return { x: (clientX - bounds.left - view.x) / view.zoom, y: (clientY - bounds.top - view.y) / view.zoom };
    }
    function nodePosition(node) { return gesture?.positions?.get(node.id) || { x: node.x, y: node.y }; }
    function portPosition(nodeId, port) {
      const node = doc?.nodes.find(n => n.id === nodeId); if (!node) return null;
      const p = nodePosition(node); return { x: p.x + (port === 'out' ? WIDTH : 0), y: p.y + PORT_Y };
    }
    function curve(a, b) {
      const bend = Math.max(52, Math.abs(b.x - a.x) * 0.45);
      return `M${a.x} ${a.y} C${a.x + bend} ${a.y},${b.x - bend} ${b.y},${b.x} ${b.y}`;
    }
    function classFor(node) { return doc.classes.find(c => c.id === node.classId); }
    function stateFor(id) {
      const values = states.nodes || states;
      return Array.isArray(values) ? values.find(n => n.id === id || n.nodeId === id) || {} : values[id] || {};
    }
    function typeColor(type) {
      if (['gpu', 'model', 'rag'].includes(type)) return 'compute';
      if (['database', 'replica'].includes(type)) return 'storage';
      if (['queue', 'rpc'].includes(type)) return 'transport';
      return 'source';
    }
    function portTypes(c, port) {
      const ports = c?.ports?.[port];
      if (Array.isArray(ports)) return ports;
      return ports?.accepts || ports?.types || [];
    }
    function hasPort(c, port) { return portTypes(c, port).length > 0; }
    function truncate(value, count = 22) { const text = String(value); return text.length > count ? `${text.slice(0, count - 1)}…` : text; }
    function paintCluster(cluster) {
      const nodes = doc.nodes.filter(n => n.clusterId === cluster.id); if (!nodes.length) return;
      const points = nodes.map(nodePosition);
      const x = Math.min(...points.map(p => p.x)) - 18, y = Math.min(...points.map(p => p.y)) - 36;
      const w = Math.max(...points.map(p => p.x)) - x + WIDTH + 18, h = Math.max(...points.map(p => p.y)) - y + HEIGHT + 18;
      const g = svgElement('g', { 'data-cluster-id': cluster.id });
      g.append(svgElement('rect', { x, y, width: w, height: h, rx: 12, class: 'graph-cluster', 'data-selected': selected.includes(cluster.id) }),
        svgElement('text', { x: x + 12, y: y + 21, class: 'graph-cluster-label' }, `${cluster.label || cluster.id} · ${cluster.capacity} shared slots`));
      scene.append(g);
    }
    function paintLink(link) {
      const a = portPosition(link.from, 'out'), b = portPosition(link.to, 'in'); if (!a || !b) return;
      const isSelected = selected.includes(link.id), d = curve(a, b);
      const g = svgElement('g', { 'data-link-id': link.id, tabindex: 0, role: 'button', 'aria-label': `Link ${link.id}, ${link.from} to ${link.to}, ${link.capacity} MiB per second, ${link.latency} seconds latency`, 'aria-pressed': isSelected });
      const title = svgElement('title', {}, `${link.from} → ${link.to} · ${link.capacity} MiB/s · ${link.latency} s`);
      g.append(title, svgElement('path', { d, class: 'graph-link-hit' }), svgElement('path', { d, class: 'graph-link', 'data-selected': isSelected, 'marker-end': `url(#${prefix}-arrow)` }));
      if (isSelected) {
        const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2 - 12;
        g.append(svgElement('rect', { x: x - 63, y: y - 13, width: 126, height: 22, rx: 4, class: 'graph-link-label-bg' }),
          svgElement('text', { x, y: y + 2, 'text-anchor': 'middle', class: 'graph-link-label' }, `${link.capacity} MiB/s · ${link.latency} s`));
        for (const [side, p] of [['from', a], ['to', b]]) {
          const cx = p.x + (side === 'from' ? 1 : -1) * (hasTouch ? 36 / view.zoom : 18);
          const handle = svgElement('g', { class: 'graph-reconnect-target', 'data-reconnect': link.id, 'data-side': side, tabindex: 0, role: 'button', 'aria-label': `Reconnect ${side} endpoint of ${link.id}` });
          handle.append(svgElement('circle', { cx, cy: p.y, r: hasTouch ? 22 / view.zoom : 11, class: 'graph-port-hit' }),
            svgElement('circle', { cx, cy: p.y, r: 9, class: 'graph-reconnect' }));
          reconnectHandles.push(handle);
        }
      }
      scene.append(g);
    }
    function paintNode(node) {
      const c = classFor(node), p = nodePosition(node), state = stateFor(node.id), isSelected = selected.includes(node.id);
      const active = Array.isArray(state.active) ? state.active.length : state.active;
      const queued = Array.isArray(state.queue) ? state.queue.length : state.queued;
      const hasState = Number.isFinite(active) && Number.isFinite(queued);
      const status = pending ? 'Pending revision' : state.online === false ? `Offline · ${queued || 0} queued` : hasState ? `${active} active · ${queued} queued` : 'Not running';
      const detail = pending ? 'Not executing' : Number.isFinite(state.memoryMiB) ? `${Number(state.memoryMiB.toFixed(1))} MiB held · ${state.completed || 0} done` : '';
      const g = svgElement('g', { transform: `translate(${p.x},${p.y})`, class: 'graph-node', 'data-node-id': node.id, 'data-kind': typeColor(c?.type), 'data-selected': isSelected, tabindex: 0, role: 'button', 'aria-label': `${node.label || c?.label || node.id}, ${c?.type || 'node'}. ${status}. ${detail}`, 'aria-pressed': isSelected });
      g.append(svgElement('title', {}, `${node.label || node.id} · ${c?.label || node.classId}`),
        svgElement('rect', { width: WIDTH, height: HEIGHT, rx: 9, class: 'graph-node-body' }),
        svgElement('rect', { x: 12, y: 13, width: 24, height: 24, rx: 6, class: 'graph-node-icon-bg' }),
        svgElement('text', { x: 24, y: 29, 'text-anchor': 'middle', class: 'graph-node-icon' }, ({ client: 'C', cpu: 'CPU', gpu: 'GPU', queue: 'Q', rpc: 'RPC', database: 'DB', replica: 'R', scheduler: 'T', crawler: 'W', rag: 'RAG', model: 'AI' })[c?.type] || 'N'),
        svgElement('text', { x: 45, y: 23, class: 'graph-node-label' }, truncate(node.label || c?.label || node.id, 17)),
        svgElement('text', { x: 45, y: 38, class: 'graph-node-class' }, truncate(c?.label || node.classId, 20)),
        svgElement('line', { x1: 12, x2: WIDTH - 12, y1: 48, y2: 48, class: 'graph-node-rule' }),
        svgElement('circle', { cx: 17, cy: 65, r: 3, class: 'graph-state-dot', 'data-status': status.toLowerCase(), 'data-active': !pending && Number(active) > 0 }),
        svgElement('text', { x: 26, y: 67, class: 'graph-node-status' }, truncate(status, 23)),
        svgElement('text', { x: 12, y: 81, class: 'graph-node-memory' }, truncate(detail, 27)));
      for (const port of ['in', 'out']) if (hasPort(c, port)) {
        const types = portTypes(c, port), portGroup = svgElement('g', { class: 'graph-port-target', 'data-port': port, 'data-node-id': node.id, 'data-armed': connectStart?.nodeId === node.id && connectStart?.port === port, tabindex: 0, role: 'button', 'aria-label': `${port === 'in' ? 'Input' : 'Output'} ${node.label || node.id}, accepts ${types.join(', ')}` });
        const cx = port === 'in' ? 0 : WIDTH;
        portGroup.append(svgElement('title', {}, `${port}: ${types.join(', ')}`),
          svgElement('circle', { cx, cy: PORT_Y, r: hasTouch ? 22 / view.zoom : Math.max(11, 8 / view.zoom), class: 'graph-port-hit' }),
          svgElement('circle', { cx, cy: PORT_Y, r: 8, class: 'graph-port' }));
        g.append(portGroup);
      }
      scene.append(g);
    }
    function render() {
      if (disposed || !doc) return;
      const focused = document.activeElement;
      const focusIdentity = focused?.getAttribute('data-reconnect') ? { reconnectId: focused.getAttribute('data-reconnect'), side: focused.getAttribute('data-side') } : focused?.getAttribute('data-port') ? { nodeId: focused.getAttribute('data-node-id'), port: focused.getAttribute('data-port') } : focused?.getAttribute('data-node-id') ? { nodeId: focused.getAttribute('data-node-id') } : focused?.getAttribute('data-link-id') ? { linkId: focused.getAttribute('data-link-id') } : null;
      scene.replaceChildren(); reconnectHandles = []; scene.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.zoom})`);
      onView({ ...view });
      svg.dataset.zoom = view.zoom.toFixed(3); svg.dataset.pending = String(pending); svg.dataset.selectedIds = selected.join(',');
      for (const cluster of doc.clusters) paintCluster(cluster);
      for (const link of doc.links) paintLink(link);
      for (const node of doc.nodes) paintNode(node);
      scene.append(...reconnectHandles);
      if (connectStart && preview) {
        const fixed = portPosition(connectStart.nodeId, connectStart.port);
        if (fixed) scene.append(svgElement('path', { d: connectStart.port === 'out' ? curve(fixed, preview) : curve(preview, fixed), class: 'graph-link-preview' }));
      }
      if (focusIdentity && !gesture) {
        const selector = focusIdentity.reconnectId ? `[data-reconnect="${CSS.escape(focusIdentity.reconnectId)}"][data-side="${focusIdentity.side}"]` : focusIdentity.linkId ? `[data-link-id="${CSS.escape(focusIdentity.linkId)}"]` : focusIdentity.port ? `[data-node-id="${CSS.escape(focusIdentity.nodeId)}"][data-port="${focusIdentity.port}"]` : `.graph-node[data-node-id="${CSS.escape(focusIdentity.nodeId)}"]`;
        scene.querySelector(selector)?.focus({ preventScroll: true });
      }
    }
    function zoomAt(factor, clientX, clientY) {
      const point = positionAt(clientX, clientY), bounds = svg.getBoundingClientRect();
      view.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.zoom * factor));
      view.x = clientX - bounds.left - point.x * view.zoom; view.y = clientY - bounds.top - point.y * view.zoom; render();
    }
    function zoomBy(factor) { const b = svg.getBoundingClientRect(); zoomAt(factor, b.left + b.width / 2, b.top + b.height / 2); }
    function fit() {
      if (!doc?.nodes.length) { view = { x: 40, y: 60, zoom: 1 }; render(); return; }
      const box = dimensions(), minX = Math.min(...doc.nodes.map(n => n.x)) - 28, minY = Math.min(...doc.nodes.map(n => n.y)) - 50;
      const maxX = Math.max(...doc.nodes.map(n => n.x)) + WIDTH + 28, maxY = Math.max(...doc.nodes.map(n => n.y)) + HEIGHT + 28;
      view.zoom = Math.max(MIN_ZOOM, Math.min(1.15, (box.width - 50) / (maxX - minX), (box.height - 50) / (maxY - minY)));
      view.x = (box.width - (maxX - minX) * view.zoom) / 2 - minX * view.zoom;
      view.y = (box.height - (maxY - minY) * view.zoom) / 2 - minY * view.zoom; render();
    }
    function dropClassAt(classId, clientX, clientY) {
      const p = positionAt(clientX, clientY);
      return dispatch({ type: 'add', classId, x: Math.round(p.x - WIDTH / 2), y: Math.round(p.y - HEIGHT / 2) });
    }
    function portAt(clientX, clientY) { return document.elementFromPoint(clientX, clientY)?.closest('[data-port]'); }
    function armPort(nodeId, port, reconnectId = null, side = null) {
      if (connectStart && !reconnectId) {
        if (connectStart.port === port) { connectStart = { nodeId, port }; preview = portPosition(nodeId, port); render(); return; }
        const from = port === 'out' ? nodeId : connectStart.nodeId, to = port === 'in' ? nodeId : connectStart.nodeId;
        const action = connectStart.reconnectId ? { type: 'reconnect', id: connectStart.reconnectId, from, to, fromPort: 'out', toPort: 'in' } : { type: 'connect', from, to, fromPort: 'out', toPort: 'in' };
        connectStart = null; preview = null; dispatch(action); render(); return;
      }
      connectStart = { nodeId, port, reconnectId, side }; preview = portPosition(nodeId, port);
      report(`Choose an ${port === 'out' ? 'input' : 'output'} port${reconnectId ? ' to reconnect' : ' to connect'}.`); render();
    }
    function pointerDown(event) {
      if (!doc || (event.button !== 0 && event.pointerType !== 'touch')) return;
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size === 2) {
        connectStart = null; preview = null; hoveredPort = null;
        const ps = [...touches.values()]; gesture = { kind: 'pinch', distance: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), zoom: view.zoom }; render(); svg.setPointerCapture(event.pointerId); event.preventDefault(); return;
      }
      const port = event.target.closest('[data-port]'), reconnect = event.target.closest('[data-reconnect]');
      if (reconnect) {
        const link = doc.links.find(l => l.id === reconnect.dataset.reconnect), side = reconnect.dataset.side;
        connectStart = null; armPort(side === 'from' ? link.to : link.from, side === 'from' ? 'in' : 'out', link.id, side);
        gesture = { kind: 'wire', startX: event.clientX, startY: event.clientY, pointerId: event.pointerId }; svg.setPointerCapture(event.pointerId); event.preventDefault(); return;
      }
      if (port) {
        const prior = connectStart;
        armPort(port.dataset.nodeId, port.dataset.port);
        if (!prior || connectStart) gesture = { kind: 'wire', startX: event.clientX, startY: event.clientY, pointerId: event.pointerId };
        svg.setPointerCapture(event.pointerId); event.preventDefault(); return;
      }
      const node = event.target.closest('.graph-node'), link = event.target.closest('[data-link-id]'), cluster = event.target.closest('[data-cluster-id]');
      if (cluster && !spaceHeld) {
        setSelection([cluster.dataset.clusterId]);
        const origins = new Map(doc.nodes.filter(n => n.clusterId === cluster.dataset.clusterId).map(n => [n.id, { x: n.x, y: n.y }]));
        gesture = { kind: 'nodes', pointerId: event.pointerId, start: positionAt(event.clientX, event.clientY), origins, positions: new Map(origins), moved: false };
        svg.setPointerCapture(event.pointerId); event.preventDefault(); return;
      }
      if (node && !spaceHeld) {
        const id = node.dataset.nodeId;
        if (event.shiftKey || multiSelect) setSelection(selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id]);
        else if (!selected.includes(id)) setSelection([id]);
        const origins = new Map(doc.nodes.filter(n => selected.includes(n.id)).map(n => [n.id, { x: n.x, y: n.y }]));
        gesture = { kind: 'nodes', pointerId: event.pointerId, start: positionAt(event.clientX, event.clientY), origins, positions: new Map(origins), moved: false };
        svg.setPointerCapture(event.pointerId); event.preventDefault(); return;
      }
      if (link && !spaceHeld) { setSelection([link.dataset.linkId]); event.preventDefault(); return; }
      connectStart = null; preview = null;
      if (!event.shiftKey && !spaceHeld) setSelection([]);
      gesture = { kind: 'pan', pointerId: event.pointerId, x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y };
      svg.setPointerCapture(event.pointerId); svg.classList.add('is-panning'); event.preventDefault();
    }
    function pointerMove(event) {
      if (touches.has(event.pointerId)) touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (gesture?.kind === 'pinch' && touches.size === 2) {
        const ps = [...touches.values()], distance = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
        const target = gesture.zoom * distance / Math.max(gesture.distance, 1);
        zoomAt(target / view.zoom, (ps[0].x + ps[1].x) / 2, (ps[0].y + ps[1].y) / 2); event.preventDefault(); return;
      }
      if (gesture?.kind === 'nodes') {
        const p = positionAt(event.clientX, event.clientY), dx = p.x - gesture.start.x, dy = p.y - gesture.start.y;
        gesture.moved ||= Math.hypot(dx, dy) > 2;
        for (const [id, start] of gesture.origins) gesture.positions.set(id, { x: Math.round(start.x + dx), y: Math.round(start.y + dy) });
        render(); event.preventDefault();
      } else if (gesture?.kind === 'pan') {
        view.x = gesture.viewX + event.clientX - gesture.x; view.y = gesture.viewY + event.clientY - gesture.y; render(); event.preventDefault();
      } else if (connectStart) {
        preview = positionAt(event.clientX, event.clientY); hoveredPort = portAt(event.clientX, event.clientY); render();
      }
    }
    function pointerUp(event) {
      touches.delete(event.pointerId);
      const ended = gesture; gesture = null; svg.classList.remove('is-panning');
      if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
      if (ended?.kind === 'nodes' && ended.moved) dispatch({ type: 'move', positions: [...ended.positions].map(([id, p]) => ({ id, ...p })) });
      if (ended?.kind === 'wire' && Math.hypot(event.clientX - ended.startX, event.clientY - ended.startY) > 5) {
        const target = portAt(event.clientX, event.clientY) || hoveredPort;
        if (target && connectStart && target.dataset.port !== connectStart.port) armPort(target.dataset.nodeId, target.dataset.port);
        else { connectStart = null; preview = null; report('Connect to the opposite typed port. No connection changed.', true); }
      }
      hoveredPort = null; render();
    }
    function pointerCancel(event) {
      touches.delete(event.pointerId); gesture = null; connectStart = null; preview = null; hoveredPort = null;
      svg.classList.remove('is-panning');
      if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
      render();
    }
    function keyDown(event) {
      if (event.key === ' ') { spaceHeld = true; if (event.target === svg) event.preventDefault(); }
      const target = event.target.closest('[data-port]');
      if (target && ['Enter', ' '].includes(event.key)) { event.preventDefault(); armPort(target.dataset.nodeId, target.dataset.port); return; }
      const reconnect = event.target.closest('[data-reconnect]');
      if (reconnect && ['Enter', ' '].includes(event.key)) {
        event.preventDefault(); const link = doc.links.find(l => l.id === reconnect.dataset.reconnect), side = reconnect.dataset.side;
        connectStart = null; armPort(side === 'from' ? link.to : link.from, side === 'from' ? 'in' : 'out', link.id, side); return;
      }
      const node = event.target.closest('.graph-node'), link = event.target.closest('[data-link-id]');
      if (['Enter', ' '].includes(event.key) && (node || link)) { event.preventDefault(); const id = node?.dataset.nodeId || link.dataset.linkId; setSelection(event.shiftKey || multiSelect ? selected.includes(id) ? selected.filter(v => v !== id) : [...selected, id] : [id]); return; }
      if (['Delete', 'Backspace'].includes(event.key) && selected.length) { event.preventDefault(); dispatch({ type: 'delete', ids: [...selected] }); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); dispatch({ type: 'duplicate', ids: [...selected] }); return; }
      if (event.key === 'Escape') { gesture = null; connectStart = null; preview = null; setSelection([]); return; }
      const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (delta && selected.some(id => doc.nodes.some(n => n.id === id))) {
        event.preventDefault(); const step = event.shiftKey ? 40 : 10;
        dispatch({ type: 'move', positions: doc.nodes.filter(n => selected.includes(n.id)).map(n => ({ id: n.id, x: n.x + delta[0] * step, y: n.y + delta[1] * step })) });
      }
      if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(1.2); }
      if (event.key === '-') { event.preventDefault(); zoomBy(1 / 1.2); }
      if (event.key.toLowerCase() === 'f' && !(event.ctrlKey || event.metaKey)) { event.preventDefault(); fit(); }
    }
    function keyUp(event) { if (event.key === ' ') spaceHeld = false; }
    function wheel(event) { event.preventDefault(); zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY); }
    function dragOver(event) { if (event.dataTransfer.types.includes('application/x-simulatte-class')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }
    function drop(event) { const id = event.dataTransfer.getData('application/x-simulatte-class'); if (id) { event.preventDefault(); dropClassAt(id, event.clientX, event.clientY); } }
    const handlers = { pointerdown: pointerDown, pointermove: pointerMove, pointerup: pointerUp, pointercancel: pointerCancel, keydown: keyDown, keyup: keyUp, wheel, dragover: dragOver, drop };
    for (const [name, handler] of Object.entries(handlers)) svg.addEventListener(name, handler, name === 'wheel' ? { passive: false } : undefined);
    function destroy() { disposed = true; for (const [name, handler] of Object.entries(handlers)) svg.removeEventListener(name, handler); svg.remove(); }
    return Object.freeze({ setDocument, destroy, zoomBy, fit, setMultiSelect: value => { multiSelect = Boolean(value); }, selection: () => [...selected], positionAt, dropClassAt, viewport: () => ({ ...view }) });
  }
  return Object.freeze({ create, WIDTH, HEIGHT });
});
