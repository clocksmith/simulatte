(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./diagram.js') : root.SimulatteSystemDiagramDocument, node ? require('./editor-canvas-render.js') : root.SimulatteSystemDiagramCanvasRender, node ? require('./editor-viewport.js') : root.SimulatteSystemDiagramViewport);
  if (node) module.exports = api; else root.SimulatteSystemDiagramCanvas = api;
})(globalThis, function (D, R, V) {
  'use strict';
  const DRAG_THRESHOLD = Object.freeze({ mouse: 4, pen: 6, touch: 9 });
  const LONG_PRESS_MS = 450;
  const DOUBLE_TAP_MS = 350;
  const GROUP_MIN_GRID_STEPS = 6;
  const GRID_STEPS = 4;
  const GRID_MIN_PX = 10;
  const ZOOM_STEP = 1.2;
  const WHEEL_ZOOM = Object.freeze({ pinch: 0.01, wheel: 0.0025, line: 16 });
  const KEY_PAN_PX = 48;
  const NUDGE_LARGE_STEPS = 4;
  const EAGER_CANDIDATE_LIMIT = 240;
  const HINT_MS = 2600;
  const ARROW = 10;
  let instances = 0;
  const { el, STATUS_HEIGHT, PORT_DOT } = R;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const rectsIntersect = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const contains = (outer, inner) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
  const friendly = reason => String(reason || '').replace(/^system-diagram diagram\.edges\[\d+\][^:]*: /, '');

  function create({ host, model, library, config, onMessage = () => {}, onView = () => {} }) {
    const doc = host.ownerDocument, win = doc.defaultView;
    const E = config.editor, W = E.nodeWidth, H = E.nodeHeight, GRID = E.grid;
    const uid = ++instances;
    const touches = new Map();
    let fittedView = false;
    let insets = {}, view = { ...model.diagram.view }, gesture = null, pending = null, editing = null;
    let explicitMultiSelect = false, overlay = null, runView = null, runPending = false, inputReceipt = null;
    const reconnectHandles = new Map();
    let frame = 0, queuedPositions = null, viewDirty = false, ownViewChange = false, hintTimer = 0, gestureCount = 0, lastTap = null;
    const events = new AbortController(), on = (target, type, fn, opts = {}) => target.addEventListener(type, fn, { signal: events.signal, ...opts });

    host.classList.add('sd-canvas');
    host.tabIndex = 0;
    host.setAttribute('role', 'application');
    host.setAttribute('aria-roledescription', 'diagram editor');
    host.setAttribute('aria-label', 'System diagram canvas. Tab to nodes; Delete removes, arrows move, C connects, F2 renames.');
    const svg = el(doc, 'svg', { class: 'sd-canvas-svg', width: '100%', height: '100%' });
    const defs = el(doc, 'defs');
    const marker = (id, cls) => {
      const m = el(doc, 'marker', { id, viewBox: `0 0 ${ARROW} ${ARROW}`, refX: ARROW, refY: ARROW / 2, markerWidth: ARROW, markerHeight: ARROW, markerUnits: 'userSpaceOnUse', orient: 'auto' });
      m.append(el(doc, 'path', { d: `M0 1L${ARROW} ${ARROW / 2}L0 ${ARROW - 1}z`, class: cls }));
      return m;
    };
    const arrowId = `sd-arrow-${uid}`, arrowSelectedId = `sd-arrow-selected-${uid}`, gridId = `sd-grid-${uid}`;
    const pattern = el(doc, 'pattern', { id: gridId, width: GRID * GRID_STEPS, height: GRID * GRID_STEPS, patternUnits: 'userSpaceOnUse' });
    pattern.append(el(doc, 'circle', { cx: 0.75, cy: 0.75, r: 0.75, class: 'sd-grid-dot' }));
    defs.append(marker(arrowId, 'sd-arrow'), marker(arrowSelectedId, 'sd-arrow is-selected'), pattern);
    const boardBg = el(doc, 'rect', { class: 'sd-canvas-board-bg' });
    const boardGrid = el(doc, 'rect', { class: 'sd-canvas-board-grid', fill: `url(#${gridId})` });
    const world = el(doc, 'g', { class: 'sd-world' });
    const layers = Object.freeze({
      groups: el(doc, 'g', { class: 'sd-layer-groups' }), edges: el(doc, 'g', { class: 'sd-layer-edges' }), nodes: el(doc, 'g', { class: 'sd-layer-nodes' }),
      overlay: el(doc, 'g', { class: 'sd-layer-overlay' }), interaction: el(doc, 'g', { class: 'sd-layer-interaction' }),
    });
    world.append(boardBg, boardGrid, layers.groups, layers.edges, layers.nodes, layers.overlay, layers.interaction);
    layers.overlay.setAttribute('pointer-events', 'none'); layers.interaction.setAttribute('pointer-events', 'none');
    svg.append(defs, world);
    const hint = doc.createElement('div');
    hint.className = 'sd-canvas-hint'; hint.setAttribute('role', 'status'); hint.setAttribute('aria-live', 'polite');
    host.append(svg, hint);

    // ---- geometry and rendering (editor-canvas-render.js) -----------------------------------
    const renderer = R.create({ doc, model, library, config, layers, arrowId, arrowSelectedId });
    const { items, classInfo, findNode, portPosition, nodeBox, groupBox, noteBox, visiblePorts, portElement, portElements, presentation, curve } = renderer;
    const groupElement = id => items.groups.get(id)?.el || null;
    const foldedGroups = () => [...presentation().groups.values()].filter(entry => entry.group.collapsed).map(entry => ({ id: entry.group.id, members: [...entry.members] }));
    function render() {
      const hadFocus = host.contains(doc.activeElement);
      renderer.render();
      renderReconnectHandles();
      paintBoard();
      paintState();
      if (hadFocus && !host.contains(doc.activeElement) && !editing) host.focus({ preventScroll: true });
    }
    function rect() { return svg.getBoundingClientRect(); }
    function screenToWorld(p) { const r = rect(); return { x: (p.x - r.left) / view.zoom + view.x, y: (p.y - r.top) / view.zoom + view.y }; }
    function worldToScreen(p) { const r = rect(); return { x: (p.x - view.x) * view.zoom + r.left, y: (p.y - view.y) * view.zoom + r.top }; }
    function viewportCenter() { const r = rect(); return screenToWorld({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); }
    const snap = v => Math.round(v / GRID) * GRID;
    function groupAt(point, exclude = []) {
      const hits = model.diagram.groups.filter(g => !g.collapsed && !exclude.includes(g.id) && point.x >= g.x && point.x <= g.x + g.w && point.y >= g.y && point.y <= g.y + g.h);
      hits.sort((a, b) => a.w * a.h - b.w * b.h);
      return hits[0]?.id || null;
    }

    // ---- camera & bounded canvas -----------------------------------------------------------
    function contentBounds() {
      const d = model.diagram;
      const boxes = [...presentation().nodes.map(n => nodeBox(n.id)), ...d.groups.map(g => groupBox(g.id)), ...d.notes.map(noteBox)].filter(Boolean);
      if (!boxes.length) return null;
      const x0 = Math.min(...boxes.map(b => b.x)), y0 = Math.min(...boxes.map(b => b.y));
      return { x: x0, y: y0, w: Math.max(...boxes.map(b => b.x + b.w)) - x0, h: Math.max(...boxes.map(b => b.y + b.h)) - y0, anchors: boxes };
    }
    function canvasBounds() { return V.board(contentBounds(), GRID); }
    function paintBoard() {
      const cb = canvasBounds();
      boardBg.setAttribute('x', cb.x); boardBg.setAttribute('y', cb.y);
      boardBg.setAttribute('width', cb.w); boardBg.setAttribute('height', cb.h);
      boardGrid.setAttribute('x', cb.x); boardGrid.setAttribute('y', cb.y);
      boardGrid.setAttribute('width', cb.w); boardGrid.setAttribute('height', cb.h);
      boardGrid.style.opacity = GRID * GRID_STEPS * view.zoom < GRID_MIN_PX ? '0' : '';
    }
    const minimumZoom = () => V.minimumZoom(contentBounds(), rect(), E, insets);
    function clampView(v) {
      return V.constrain(v, rect(), contentBounds(), canvasBounds(), E, insets);
    }
    function paintView() {
      paintBoard();
      world.setAttribute('transform', `translate(${-view.x * view.zoom} ${-view.y * view.zoom}) scale(${view.zoom})`);
      host.style.setProperty('--sd-zoom', String(view.zoom));
      onView({ ...view });
      if (typeof renderer !== 'undefined') renderReconnectHandles();
    }
    function setView(next, { commit = true, restore = false, fitted = false } = {}) {
      fittedView = fitted;
      const requested = { ...view, ...next };
      // A saved fit can be wider than today's unobstructed area. Preserve its zoom
      // while retaining pan bounds; normal gestures still use the readable floor.
      view = restore ? V.constrain(requested, rect(), contentBounds(), canvasBounds(), {...E, minZoom: E.fitMinZoom || E.minZoom}, insets) : clampView(requested);
      paintView();
      if (commit) { viewDirty = true; schedule(); }
      return { ...view };
    }
    function zoomAt(client, factor) {
      const before = screenToWorld(client), zoom = clamp(view.zoom * factor, minimumZoom(), E.maxZoom), r = rect();
      setView({ zoom, x: before.x - (client.x - r.left) / zoom, y: before.y - (client.y - r.top) / zoom });
    }
    function zoomBy(factor) { const r = rect(); zoomAt({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, factor); return { ...view }; }
    function fit() {
      const r = rect();
      if (!r.width || !r.height) return { ...view };
      return setView(V.fit(contentBounds(), r, E, insets), {fitted:true});
    }

    // Pointer moves are batched per animation frame; drags commit through one coalesced history entry.
    function schedule() { if (!frame) frame = win.requestAnimationFrame(flush); }
    function flush() {
      frame = 0;
      if (queuedPositions) {
        const { positions, key } = queuedPositions; queuedPositions = null;
        model.apply({ type: 'setPositions', positions, coalesce: key });
      }
      if (viewDirty) {
        viewDirty = false; ownViewChange = true;
        model.apply({ type: 'setView', view: { ...view } });
        ownViewChange = false;
      }
    }
    function flushNow() { if (frame) { win.cancelAnimationFrame(frame); frame = 0; } flush(); }

    // ---- hint -----------------------------------------------------------------------------
    function showHint(text, tone = 'info', sticky = false) {
      win.clearTimeout(hintTimer);
      hint.textContent = text || ''; hint.dataset.tone = tone;
      if (text) onMessage(text, tone === 'error' || tone === 'warning');
      if (text && !sticky) hintTimer = win.setTimeout(() => { hint.textContent = ''; }, HINT_MS);
    }

    // ---- hit testing ----------------------------------------------------------------------
    function classify(target) {
      const t = target?.closest ? target : null;
      if (!t || !svg.contains(t)) return { type: 'empty' };
      const reconnect = t.closest('.sd-reconnect');
      if (reconnect) return { type: 'reconnect', id: reconnect.dataset.reconnect, side: reconnect.dataset.side };
      const port = t.closest('.sd-port'), nodeEl = t.closest('.sd-node');
      if (port && (nodeEl || port.dataset.nodeId)) return { type: 'port', id: nodeEl?.dataset.id || port.dataset.nodeId, portId: port.dataset.port, dir: port.dataset.direction };
      if (nodeEl) return { type: 'node', id: nodeEl.dataset.id };
      const groupEl = t.closest('.sd-group');
      if (groupEl && t.closest('.sd-group-toggle')) return { type: 'groupToggle', id: groupEl.dataset.id };
      if (groupEl && t.closest('.sd-group-handle')) return { type: 'groupHandle', id: groupEl.dataset.id };
      if (groupEl && t.closest('.sd-group-tab, .sd-group-hit')) return { type: 'group', id: groupEl.dataset.id };
      const noteEl = t.closest('.sd-note');
      if (noteEl) return { type: 'note', id: noteEl.dataset.id };
      const edgeEl = t.closest('.sd-edge');
      if (edgeEl) return { type: 'edge', id: edgeEl.dataset.id };
      return { type: 'empty' };
    }
    function hitAt(client, connecting = false, eventTarget = null) {
      const atPoint = classify(doc.elementFromPoint(client.x, client.y)), native = eventTarget ? classify(eventTarget) : null;
      // A visible wire or reconnect handle must not be stolen by expanded nearby port targets.
      if (native?.type === 'groupToggle') return native;
      if (atPoint.type === 'reconnect' || atPoint.type === 'groupToggle' || !connecting && atPoint.type === 'edge') return atPoint;
      const physical = !connecting && atPoint.type === 'node' ? atPoint : native?.type === 'port' ? native : atPoint;
      if (physical.type === 'reconnect') return physical;
      if (!connecting && physical.type === 'node') return physical;
      const world = screenToWorld(client), touch = win.matchMedia?.('(pointer: coarse)').matches;
      let nearest = null, distance = touch ? 22 : 12;
      for (const p of visiblePorts()) {
        const d = Math.hypot(p.x - world.x, p.y - world.y) * view.zoom;
        if (d < distance) { distance = d; nearest = { type: 'port', id: p.nodeId, portId: p.portId, dir: p.direction }; }
      }
      if (!connecting && physical.type !== 'port') {
        const body = [...presentation().nodes].reverse().find(node => world.x >= node.x && world.x <= node.x + W && world.y >= node.y && world.y <= node.y + H);
        if (body && (!nearest || distance > Math.max(6, PORT_DOT * view.zoom + 2))) return { type: 'node', id: body.id };
      }
      return nearest || physical;
    }
    function dropPosition(point) {
      const desired = { x: snap(point.x - W / 2), y: snap(point.y - H / 2) }, nodes = model.diagram.nodes;
      const gap = Math.max(GRID * 3, 24 / view.zoom);
      const clear = p => !nodes.some(n => p.x < n.x + W + gap && p.x + W + gap > n.x && p.y < n.y + H + gap && p.y + H + gap > n.y);
      if (clear(desired)) return desired;
      // At most 4N+1 candidates over the bounded document keep new ports clear without moving existing nodes.
      const candidates = [desired];
      for (const n of nodes) candidates.push({ x: snap(n.x + W + gap), y: desired.y }, { x: snap(n.x - W - gap), y: desired.y }, { x: desired.x, y: snap(n.y + H + gap) }, { x: desired.x, y: snap(n.y - H - gap) });
      const score = p => (p.x - desired.x) ** 2 + (p.y - desired.y) ** 2;
      const result = candidates.filter(clear).sort((a, b) => score(a) - score(b) || a.x - b.x || a.y - b.y)[0];
      return result || { x: Math.ceil((Math.max(...nodes.map(n => n.x)) + W + gap) / GRID) * GRID, y: desired.y };
    }
    const selectionKey = { node: 'nodes', group: 'groups', groupToggle: 'groups', note: 'notes', edge: 'edges' };
    const isSelected = hit => model.selection[selectionKey[hit.type]]?.includes(hit.id);

    function reconnectSource(hit) {
      const edge = model.diagram.edges.find(e => e.id === hit.id); if (!edge) return null;
      const fixed = hit.side === 'from' ? edge.to : edge.from;
      return { ...fixed, dir: hit.side === 'from' ? 'in' : 'out', reconnectId: edge.id };
    }
    function renderReconnectHandles() {
      const used = new Set(), touch = win.matchMedia?.('(pointer: coarse)').matches;
      for (const edge of presentation().edges) if (model.selection.edges.includes(edge.id)) for (const side of ['from', 'to']) {
        const key = `${edge.id}:${side}`, end = edge[side], p = portPosition(end.nodeId, end.portId); if (!p) continue;
        used.add(key); let item = reconnectHandles.get(key);
        if (!item) {
          const g = el(doc, 'g', { class: 'sd-reconnect', 'data-reconnect': edge.id, 'data-side': side, tabindex: 0, role: 'button', 'pointer-events': 'all', 'aria-label': `Reconnect ${side} endpoint of ${edge.id}` });
          item = { el: g, hit: el(doc, 'circle', { class: 'sd-reconnect-hit' }), dot: el(doc, 'circle', { class: 'sd-reconnect-dot', r: 6 }) };
          g.append(item.hit, item.dot); layers.interaction.append(g); reconnectHandles.set(key, item);
        }
        const offset = touch ? 36 / view.zoom : 16, x = p.x + p.nx * offset, y = p.y + p.ny * offset;
        item.el.setAttribute('transform', `translate(${x} ${y})`); item.hit.setAttribute('r', touch ? 22 / view.zoom : 10);
      }
      for (const [key, item] of reconnectHandles) if (!used.has(key)) { item.el.remove(); reconnectHandles.delete(key); }
    }
    function paintState() {
      if (!runView || runPending) {
        overlay?.clear();
        for (const item of items.nodes.values()) {
          const stale = item.status.querySelector('.sd-pending-label'); stale?.remove();
          if (runPending) item.status.append(el(doc, 'text', { x: 8, y: 11, class: 'sd-pending-label' }, 'Pending revision'));
        }
        return;
      }
      if (!overlay) {
        const api = globalThis.SimulatteSystemDiagramOverlay;
        if (!api?.create) throw Error('System Diagram overlay script is required for execution state');
        overlay = api.create({ canvas: { host, layers, nodeElement: id => items.nodes.get(id)?.el || null, edgeElement: id => items.edges.get(id)?.path || null, groupElement, foldedGroups, nodeBox, portPosition }, library, config });
      }
      for (const item of items.nodes.values()) item.status.querySelector('.sd-pending-label')?.remove();
      overlay.render(runView);
    }

    // ---- connecting -----------------------------------------------------------------------
    function ends(source, nodeId, portId) {
      const other = { nodeId, portId }, self = { nodeId: source.nodeId, portId: source.portId };
      return source.dir === 'out' ? { from: self, to: other } : { from: other, to: self };
    }
    function beginConnect(source) {
      const candidates = new Map();
      const keys = visiblePorts().filter(p => p.nodeId !== source.nodeId && p.direction !== source.dir).map(p => [p.nodeId, p.portId]);
      const evaluate = (nodeId, portId) => {
        const key = `${nodeId}.${portId}`;
        if (!candidates.has(key)) { const e = ends(source, nodeId, portId); const trial = source.reconnectId ? { ...model.diagram, edges: model.diagram.edges.filter(edge => edge.id !== source.reconnectId) } : model.diagram; candidates.set(key, D.canConnect(trial, library, config, e.from, e.to)); }
        return candidates.get(key);
      };
      host.classList.add('is-connecting');
      portElement(source.nodeId, source.portId)?.classList.add('is-source');
      if (keys.length <= EAGER_CANDIDATE_LIMIT) {
        for (const [nodeId, portId] of keys) {
          const result = evaluate(nodeId, portId), portEl = portElement(nodeId, portId);
          portEl?.classList.add(result.ok ? 'is-valid' : 'is-invalid');
          if (result.ok && result.warning) portEl?.classList.add('is-warning');
        }
      } else for (const [nodeId, portId] of keys) portElement(nodeId, portId)?.classList.add('is-candidate');
      return { source, evaluate, keys };
    }
    function endConnect() {
      host.classList.remove('is-connecting');
      for (const portEl of portElements()) portEl.classList.remove('is-source', 'is-valid', 'is-invalid', 'is-warning', 'is-candidate', 'is-target');
      layers.interaction.querySelector('.sd-connect-preview')?.remove();
    }
    // A target is a port, or a node body whose first compatible port is chosen (large touch target).
    function resolveTarget(connect, hit) {
      if (hit.type === 'port' && hit.id !== connect.source.nodeId) {
        if (hit.dir === connect.source.dir) return { nodeId: hit.id, portId: hit.portId, result: { ok: false, reason: `both ports are ${hit.dir} ports` } };
        return { nodeId: hit.id, portId: hit.portId, result: connect.evaluate(hit.id, hit.portId) };
      }
      if ((hit.type === 'node' || hit.type === 'port') && hit.id !== connect.source.nodeId) {
        const options = connect.keys.filter(([nodeId]) => nodeId === hit.id);
        if (!options.length) return { nodeId: hit.id, portId: null, result: { ok: false, reason: `${findNode(hit.id)?.label || hit.id} has no ${connect.source.dir === 'out' ? 'input' : 'output'} port` } };
        const best = options.find(([n, p]) => connect.evaluate(n, p).ok) || options[0];
        return { nodeId: best[0], portId: best[1], result: connect.evaluate(best[0], best[1]) };
      }
      return null;
    }
    function describeTarget(target) {
      if (!target) return;
      if (!target.result.ok) showHint(`Cannot connect: ${friendly(target.result.reason)}`, 'error', true);
      else showHint(target.result.warning ? `Connect (payload warning): ${target.result.warning}` : `Connect to ${findNode(target.nodeId)?.label || target.nodeId}`, target.result.warning ? 'warning' : 'info', true);
    }
    function markTarget(target) {
      for (const portEl of portElements()) portEl.classList.remove('is-target');
      if (target?.portId) portElement(target.nodeId, target.portId)?.classList.add('is-target');
    }
    function finishConnect(connect, target) {
      endConnect();
      if (!target) { showHint(''); return false; }
      if (!target.result.ok) { showHint(`Cannot connect: ${friendly(target.result.reason)}`, 'error'); return false; }
      const e = ends(connect.source, target.nodeId, target.portId);
      const result = model.apply(connect.source.reconnectId ? { type: 'reconnect', id: connect.source.reconnectId, from: e.from, to: e.to } : { type: 'connect', from: e.from, to: e.to });
      if (!result.ok) showHint(`Cannot connect: ${friendly(result.error)}`, 'error');
      else showHint(result.warning ? `Connected with payload warning: ${result.warning}` : 'Connected', result.warning ? 'warning' : 'info');
      return result.ok;
    }
    function previewLine(from, to) {
      let line = layers.interaction.querySelector('.sd-connect-preview');
      if (!line) { line = el(doc, 'path', { class: 'sd-connect-preview' }); layers.interaction.append(line); }
      line.setAttribute('d', from.dir === 'out' ? curve(from, to) : curve(to, from));
    }
    function startPending(source) {
      cancelPending();
      pending = beginConnect(source);
      const label = findNode(source.nodeId)?.label || source.nodeId;
      const port = classInfo(findNode(source.nodeId).classId).ports.find(p => p.id === source.portId);
      showHint(`Connecting from ${label} · ${port?.label || source.portId}. Choose a target; Escape cancels.`, 'info', true);
    }
    function cancelPending() { if (pending) { pending = null; endConnect(); showHint(''); } }

    // ---- selection helpers ----------------------------------------------------------------
    function selectHit(hit, mode) {
      const key = selectionKey[hit.type];
      if (!key) return;
      model.select({ [key]: [hit.id] }, mode === 'toggle' ? { toggle: true } : mode === 'add' ? { additive: true } : {});
    }
    function movableSelection() {
      const s = model.selection, d = model.diagram;
      const groupIds = new Set(s.groups), ids = new Set([...s.nodes, ...s.groups, ...s.notes]);
      for (const n of d.nodes) if (n.groupId && groupIds.has(n.groupId)) ids.add(n.id);
      return ids;
    }
    function positionOf(id) {
      const d = model.diagram;
      return d.nodes.find(n => n.id === id) || d.groups.find(g => g.id === id) || d.notes.find(n => n.id === id);
    }

    // ---- gestures -------------------------------------------------------------------------
    function beginMove(hit, startWorld) {
      const ids = movableSelection();
      if (!ids.size) return null;
      const starts = new Map([...ids].map(id => [id, { x: positionOf(id).x, y: positionOf(id).y }]));
      host.classList.add('is-dragging');
      return { type: 'move', grabbed: starts.has(hit.id) ? hit.id : [...ids][0], starts, free: freeNodes(), startWorld, key: `drag-${uid}-${++gestureCount}`, dropGroup: undefined };
    }
    function updateMove(g, world) {
      const start = g.starts.get(g.grabbed);
      const dx = snap(start.x + world.x - g.startWorld.x) - start.x, dy = snap(start.y + world.y - g.startWorld.y) - start.y;
      const positions = {};
      for (const [id, p] of g.starts) positions[id] = { x: p.x + dx, y: p.y + dy };
      queuedPositions = { positions, key: g.key };
      schedule();
      if (g.free.length) {
        const first = positions[g.free[0]] || { x: 0, y: 0 };
        const target = groupAt({ x: first.x + W / 2, y: first.y + H / 2 }, model.selection.groups);
        if (target !== g.dropGroup) {
          items.groups.get(g.dropGroup)?.el.classList.remove('is-drop-target');
          g.dropGroup = target;
          items.groups.get(target)?.el.classList.add('is-drop-target');
        }
      }
    }
    // Dropping a node inside a group joins it; dragging it out leaves. Same history entry as the move.
    function updateMembership(free, key) {
      const byGroup = new Map();
      for (const id of free) {
        const n = findNode(id);
        if (!n) continue;
        const target = groupAt({ x: n.x + W / 2, y: n.y + H / 2 }, model.selection.groups);
        if ((n.groupId || null) !== target) byGroup.set(target, [...(byGroup.get(target) || []), id]);
      }
      for (const [groupId, ids] of byGroup) report(model.apply({ type: 'setNodeGroup', ids, groupId, coalesce: key }));
    }
    function freeNodes() { const groupIds = new Set(model.selection.groups); return model.selection.nodes.filter(id => !groupIds.has(findNode(id)?.groupId)); }
    function endMove(g) {
      flushNow();
      host.classList.remove('is-dragging');
      items.groups.get(g.dropGroup)?.el.classList.remove('is-drop-target');
      updateMembership(g.free, g.key);
    }
    function startGesture(g, e) {
      const world = screenToWorld({ x: g.client.x, y: g.client.y });
      const hit = g.hit;
      if (hit.type === 'reconnect') {
        const source = reconnectSource(hit); if (!source) return null;
        const connect = beginConnect(source), from = portPosition(source.nodeId, source.portId);
        return { type: 'connect', connect, from: { ...from, dir: source.dir }, target: null };
      }
      if (hit.type === 'port') {
        const connect = beginConnect({ nodeId: hit.id, portId: hit.portId, dir: hit.dir });
        const from = portPosition(hit.id, hit.portId);
        return { type: 'connect', connect, from: { ...from, dir: hit.dir }, target: null };
      }
      if (hit.type === 'node' || hit.type === 'note' || hit.type === 'group') return beginMove(hit, world);
      if (hit.type === 'groupHandle') {
        const group = model.diagram.groups.find(x => x.id === hit.id);
        return { type: 'resize', id: hit.id, start: { w: group.w, h: group.h }, startWorld: world, key: `resize-${uid}-${++gestureCount}` };
      }
      if (hit.type === 'empty' && (e.shiftKey || g.longPressed || explicitMultiSelect)) {
        const box = el(doc, 'rect', { class: 'sd-marquee' });
        layers.interaction.append(box);
        return { type: 'marquee', startWorld: world, box, additive: e.shiftKey || g.longPressed || explicitMultiSelect };
      }
      if (hit.type === 'empty' || hit.type === 'edge') { host.classList.add('is-panning'); return { type: 'pan', startClient: g.client, startView: { ...view } }; }
      return null;
    }
    function moveGesture(g, e) {
      const client = { x: e.clientX, y: e.clientY }, world = screenToWorld(client);
      if (g.type === 'move') updateMove(g, world);
      else if (g.type === 'pan') setView({ x: g.startView.x - (client.x - g.startClient.x) / view.zoom, y: g.startView.y - (client.y - g.startClient.y) / view.zoom });
      else if (g.type === 'resize') {
        const min = GRID * GROUP_MIN_GRID_STEPS;
        queuedPositions = { positions: { [g.id]: { w: Math.max(min, snap(g.start.w + world.x - g.startWorld.x)), h: Math.max(min, snap(g.start.h + world.y - g.startWorld.y)) } }, key: g.key };
        schedule();
      } else if (g.type === 'marquee') {
        const x = Math.min(world.x, g.startWorld.x), y = Math.min(world.y, g.startWorld.y);
        g.rect = { x, y, w: Math.abs(world.x - g.startWorld.x), h: Math.abs(world.y - g.startWorld.y) };
        for (const [k, v] of Object.entries(g.rect)) g.box.setAttribute(k === 'w' ? 'width' : k === 'h' ? 'height' : k, v);
      } else if (g.type === 'connect') {
        const target = resolveTarget(g.connect, hitAt(client, true));
        g.target = target;
        markTarget(target);
        previewLine(g.from, target?.portId && target.result.ok ? { ...portPosition(target.nodeId, target.portId) } : world);
        if (target) describeTarget(target); else showHint('Drag to a highlighted port', 'info', true);
      }
    }
    function endGesture(g) {
      if (g.type === 'move') endMove(g);
      else if (g.type === 'resize') flushNow();
      else if (g.type === 'pan') { host.classList.remove('is-panning'); flushNow(); }
      else if (g.type === 'connect') finishConnect(g.connect, g.target);
      else if (g.type === 'marquee') {
        g.box.remove();
        if (!g.rect) return;
        const d = model.diagram, r = g.rect;
        const nodes = presentation().nodes.filter(n => rectsIntersect(r, nodeBox(n.id))).map(n => n.id), picked = new Set(nodes);
        model.select({
          nodes, notes: d.notes.filter(n => rectsIntersect(r, noteBox(n))).map(n => n.id), groups: d.groups.filter(gr => contains(r, groupBox(gr.id))).map(gr => gr.id),
          edges: presentation().edges.filter(e => picked.has(e.from.nodeId) && picked.has(e.to.nodeId)).map(e => e.id),
        }, { additive: g.additive });
      }
    }
    function cancelGesture() {
      if (!gesture) return;
      const g = gesture.active;
      win.clearTimeout(gesture.timer);
      if (g?.type === 'connect') { endConnect(); showHint(''); }
      if (g?.type === 'marquee') g.box.remove();
      if (g?.type === 'resize') { queuedPositions = null; model.apply({ type: 'setPositions', positions: { [g.id]: { w: g.start.w, h: g.start.h } }, coalesce: g.key }); }
      if (g?.type === 'move') { queuedPositions = null; const positions = {}; for (const [id, p] of g.starts) if (positionOf(id)) positions[id] = p; model.apply({ type: 'setPositions', positions, coalesce: g.key }); host.classList.remove('is-dragging'); items.groups.get(g.dropGroup)?.el.classList.remove('is-drop-target'); }
      host.classList.remove('is-panning');
      gesture = null;
    }

    function tap(hit, e) {
      if (hit.type === 'groupToggle') { toggleGroup(hit.id); return; }
      const now = e.timeStamp, modifier = e.shiftKey || e.ctrlKey || e.metaKey || explicitMultiSelect;
      const double = lastTap && lastTap.id === hit.id && lastTap.type === hit.type && now - lastTap.at < DOUBLE_TAP_MS;
      lastTap = { id: hit.id, type: hit.type, at: now };
      if (pending) {
        if (hit.type === 'port' && hit.id === pending.source.nodeId) { cancelPending(); return; }
        const target = resolveTarget(pending, hit), connect = pending;
        pending = null;
        if (target) finishConnect(connect, target); else { endConnect(); showHint(''); }
        return;
      }
      if (hit.type === 'reconnect') { const source = reconnectSource(hit); if (source) startPending(source); return; }
      if (hit.type === 'port') { startPending({ nodeId: hit.id, portId: hit.portId, dir: hit.dir }); return; }
      if (hit.type === 'empty') { if (!modifier) model.select(null); return; }
      if (gesture?.longPressed) return;
      if (modifier) { if (gesture?.wasSelected) selectHit(hit, 'toggle'); }
      else selectHit(hit, 'only');
      if (double && !modifier) beginEdit(hit.type === 'group' ? { type: 'group', id: hit.id } : hit);
    }

    on(svg, 'pointerdown', e => {
      if (editing) commitEdit();
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size === 2) { beginPinch(); e.preventDefault(); return; }
        if (touches.size > 2) return;
      }
      const hit = e.button === 1 ? { type: 'empty' } : hitAt({ x: e.clientX, y: e.clientY }, Boolean(pending), e.target);
      if (hit.type === 'reconnect') cancelPending();
      const worldPoint = screenToWorld({ x: e.clientX, y: e.clientY });
      const nearPorts = visiblePorts().map(p => ({ ...p, distancePx: Math.hypot(p.x - worldPoint.x, p.y - worldPoint.y) * view.zoom })).sort((a, b) => a.distancePx - b.distancePx).slice(0, 8);
      inputReceipt = { schema: 'simulatte.diagramPointerReceipt.v1', phase: 'down', pointerType: e.pointerType, client: { x: e.clientX, y: e.clientY }, world: worldPoint, hit, nativeHit: classify(e.target), view: { ...view }, ports: nearPorts };
      host.dataset.inputReceipt = JSON.stringify(inputReceipt);
      const focusTarget = hit.type === 'port' ? portElement(hit.id, hit.portId)?.querySelector('.sd-port-hit') : hit.type === 'node' ? items.nodes.get(hit.id)?.el : hit.type === 'note' ? items.notes.get(hit.id)?.el : hit.type === 'groupToggle' ? items.groups.get(hit.id)?.toggle : hit.type === 'group' ? items.groups.get(hit.id)?.tab : host;
      (focusTarget || host).focus({ preventScroll: true });
      const g = { pointerId: e.pointerId, pointerType: e.pointerType, client: { x: e.clientX, y: e.clientY }, hit, active: null, timer: 0, wasSelected: false, longPressed: false, before: model.selection };
      if (['node', 'note', 'group', 'edge'].includes(hit.type) && !pending) {
        g.wasSelected = isSelected(hit);
        const modifier = e.shiftKey || e.ctrlKey || e.metaKey || explicitMultiSelect;
        if (!g.wasSelected) selectHit(hit, modifier ? 'add' : 'only');
      }
      if (!explicitMultiSelect && e.pointerType === 'touch' && (hit.type === 'empty' || hit.type === 'node')) {
        g.timer = win.setTimeout(() => {
          if (gesture !== g || g.active) return;
          g.longPressed = true;
          if (hit.type === 'node') {
            if (g.wasSelected) selectHit(hit, 'toggle');
            else { model.select(g.before); selectHit(hit, 'add'); }
            showHint(isSelected(hit) ? 'Added to selection; long-press more nodes or drag to move' : 'Removed from selection', 'info');
          }
          else showHint('Drag to select an area', 'info');
        }, LONG_PRESS_MS);
      }
      if (e.button === 1) g.active = startGesture(g, e);
      gesture = g;
      try { svg.setPointerCapture(e.pointerId); } catch { /* capture is best effort for synthetic events */ }
      e.preventDefault();
    });
    on(svg, 'pointermove', e => {
      if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (gesture?.type === 'pinch') { updatePinch(); return; }
      if (!gesture || gesture.pointerId !== e.pointerId) {
        if (pending && e.pointerType === 'mouse') { const target = resolveTarget(pending, hitAt({ x: e.clientX, y: e.clientY }, true)); markTarget(target); if (target) describeTarget(target); }
        return;
      }
      const g = gesture;
      if (!g.active) {
        const distance = Math.hypot(e.clientX - g.client.x, e.clientY - g.client.y);
        if (distance < (DRAG_THRESHOLD[g.pointerType] || DRAG_THRESHOLD.mouse)) return;
        win.clearTimeout(g.timer);
        if (pending && g.hit.type !== 'empty') return;
        g.active = startGesture(g, e);
        if (!g.active) return;
      }
      moveGesture(g.active, e);
    });
    function release(e) {
      if (touches.has(e.pointerId)) touches.delete(e.pointerId);
      if (gesture?.type === 'pinch') { if (touches.size < 2) { flushNow(); gesture = null; } return; }
      if (!gesture || gesture.pointerId !== e.pointerId) return;
      const g = gesture;
      win.clearTimeout(g.timer);
      if (e.type === 'pointercancel') { cancelGesture(); return; }
      const releaseHit = hitAt({ x: e.clientX, y: e.clientY }, true);
      if (!g.active && !pending && ['port', 'reconnect'].includes(g.hit.type) && Math.hypot(e.clientX - g.client.x, e.clientY - g.client.y) > 2) g.active = startGesture(g, e);
      if (g.active?.type === 'connect') g.active.target = resolveTarget(g.active.connect, releaseHit);
      inputReceipt = { ...inputReceipt, phase: 'up', release: { x: e.clientX, y: e.clientY }, releaseHit, gesture: g.active?.type || 'tap' };
      host.dataset.inputReceipt = JSON.stringify(inputReceipt);
      if (g.active) endGesture(g.active);
      else tap(g.hit, e);
      gesture = null;
    }
    on(svg, 'pointerup', release);
    on(svg, 'pointercancel', release);
    on(svg, 'lostpointercapture', e => { if (gesture && gesture.pointerId === e.pointerId && gesture.active && gesture.type !== 'pinch') cancelGesture(); });

    function beginPinch() {
      cancelGesture(); cancelPending();
      host.classList.remove('is-panning');
      const [a, b] = [...touches.values()];
      const r = rect(), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      gesture = { type: 'pinch', startDist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), startZoom: view.zoom, anchor: screenToWorld(mid), r };
    }
    function updatePinch() {
      const [a, b] = [...touches.values()];
      if (!a || !b) return;
      const g = gesture, r = rect(), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoom = clamp(g.startZoom * Math.hypot(a.x - b.x, a.y - b.y) / g.startDist, minimumZoom(), E.maxZoom);
      setView({ zoom, x: g.anchor.x - (mid.x - r.left) / zoom, y: g.anchor.y - (mid.y - r.top) / zoom });
    }

    on(svg, 'wheel', e => {
      e.preventDefault();
      const scale = e.deltaMode === 1 ? WHEEL_ZOOM.line : 1;
      if (e.ctrlKey || e.metaKey) {
        const k = Math.abs(e.deltaY * scale) < 50 ? WHEEL_ZOOM.pinch : WHEEL_ZOOM.wheel;
        zoomAt({ x: e.clientX, y: e.clientY }, Math.exp(-e.deltaY * scale * k));
      } else setView({ x: view.x + (e.deltaX * scale) / view.zoom, y: view.y + (e.deltaY * scale) / view.zoom });
    }, { passive: false });
    on(host, 'scroll', () => { host.scrollTop = 0; host.scrollLeft = 0; });
    on(svg, 'contextmenu', e => { if (gesture) e.preventDefault(); });

    // ---- keyboard -------------------------------------------------------------------------
    function focusedHit() {
      const hit = classify(doc.activeElement);
      return hit.type === 'empty' ? null : hit;
    }
    function keyboardConnect(hit) {
      const n = findNode(hit.id), ports = classInfo(n.classId).ports;
      const order = [...ports.filter(p => p.direction === 'out'), ...ports.filter(p => p.direction === 'in')];
      if (!order.length) return;
      const current = pending && pending.source.nodeId === hit.id ? order.findIndex(p => p.id === pending.source.portId) : -1;
      const port = order[(current + 1) % order.length];
      startPending({ nodeId: hit.id, portId: port.id, dir: port.direction });
    }
    function selectAll() {
      const d = model.diagram;
      model.select({ nodes: presentation().nodes.map(n => n.id), edges: presentation().edges.map(e => e.id), groups: d.groups.map(g => g.id), notes: d.notes.map(n => n.id) });
    }
    on(host, 'keydown', e => {
      if (editing || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const mod = e.ctrlKey || e.metaKey, key = e.key, focused = focusedHit(), selected = model.selectedIds();
      let handled = true;
      if (mod && key.toLowerCase() === 'z') e.shiftKey ? model.redo() : model.undo();
      else if (mod && key.toLowerCase() === 'y') model.redo();
      else if (mod && key.toLowerCase() === 'a') selectAll();
      else if (mod && key.toLowerCase() === 'd') { if (selected.length) report(model.apply({ type: 'duplicate' })); }
      else if (mod) handled = false;
      else if (key === 'Delete' || key === 'Backspace') { if (selected.length) report(model.apply({ type: 'deleteItems', ids: selected })); }
      else if (key === 'Escape') { if (gesture) cancelGesture(); else if (pending) cancelPending(); else model.select(null); }
      else if ((key === 'Enter' || key === ' ') && focused?.type === 'groupToggle') toggleGroup(focused.id);
      else if ((key === 'e' || key === 'E') && ['group', 'groupToggle'].includes(focused?.type)) toggleGroup(focused.id);
      else if (key.startsWith('Arrow')) {
        const step = e.shiftKey ? GRID * NUDGE_LARGE_STEPS : GRID;
        const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0, dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
        if (focused && focused.type !== 'edge' && !isSelected(focused)) selectHit(focused, 'only');
        const ids = [...new Set([...model.selection.nodes, ...model.selection.groups, ...model.selection.notes])];
        const nudgeKey = `nudge-${uid}:${ids.join(',')}`;
        if (ids.length && report(model.apply({ type: 'moveItems', ids, dx, dy, coalesce: nudgeKey })).ok) updateMembership(freeNodes(), nudgeKey);
        else setView({ x: view.x + Math.sign(dx) * KEY_PAN_PX / view.zoom, y: view.y + Math.sign(dy) * KEY_PAN_PX / view.zoom });
      } else if (key === '+' || key === '=') zoomBy(ZOOM_STEP);
      else if (key === '-' || key === '_') zoomBy(1 / ZOOM_STEP);
      else if (key === '!' || (e.shiftKey && e.code === 'Digit1')) fit();
      else if ((key === 'Enter' || key === ' ') && focused?.type === 'reconnect') { const source = reconnectSource(focused); if (source) startPending(source); }
      else if ((key === 'Enter' || key === ' ') && focused?.type === 'port') {
        if (pending) { const connect = pending; pending = null; finishConnect(connect, resolveTarget(connect, focused)); }
        else startPending({ nodeId: focused.id, portId: focused.portId, dir: focused.dir });
      }
      else if ((key === 'Enter' || key === ' ') && focused) {
        if (pending && focused.type === 'node') { const target = resolveTarget(pending, focused), connect = pending; pending = null; if (target) finishConnect(connect, target); else endConnect(); }
        else selectHit(focused, e.shiftKey ? 'toggle' : 'only');
      } else if (key === 'F2' && (focused || selected.length === 1)) beginEdit(focused || { type: model.itemType(selected[0]).slice(0, -1), id: selected[0] });
      else if ((key === 'c' || key === 'C') && focused?.type === 'node') keyboardConnect(focused);
      else handled = false;
      if (handled) { e.preventDefault(); e.stopPropagation(); }
    });
    function report(result) { if (result && !result.ok) showHint(result.error, 'error'); return result; }
    function toggleGroup(id) {
      const group = model.diagram.groups.find(g => g.id === id); if (!group) return;
      cancelPending(); lastTap = null;
      report(model.apply({ type: 'setGroupCollapsed', id, collapsed: !group.collapsed }));
      items.groups.get(id)?.toggle.focus({ preventScroll: true });
    }

    // ---- inline editing -------------------------------------------------------------------
    function beginEdit(hit) {
      if (!hit || !['node', 'note', 'group'].includes(hit.type)) return;
      const d = model.diagram;
      const row = hit.type === 'node' ? d.nodes.find(n => n.id === hit.id) : hit.type === 'note' ? d.notes.find(n => n.id === hit.id) : d.groups.find(g => g.id === hit.id);
      if (!row) return;
      const multiline = hit.type === 'note';
      const input = doc.createElement(multiline ? 'textarea' : 'input');
      input.className = 'sd-inline-edit';
      input.value = multiline ? row.text : row.label;
      input.setAttribute('aria-label', hit.type === 'note' ? 'Note text' : `${hit.type === 'node' ? 'Node' : 'Group'} label`);
      input.maxLength = multiline ? config.bounds.maxNoteLength : config.bounds.maxLabelLength;
      globalThis.SimulatteWorldUI?.SimField({ element: input });
      const r = host.getBoundingClientRect(), topLeft = worldToScreen({ x: row.x, y: row.y });
      const width = (hit.type === 'note' ? noteBox(row).w : hit.type === 'group' ? Math.min(row.w, 260) : W) * view.zoom;
      Object.assign(input.style, { left: `${topLeft.x - r.left}px`, top: `${topLeft.y - r.top}px`, width: `${Math.max(160, width)}px` });
      host.append(input);
      editing = { hit, input, original: input.value };
      on(input, 'keydown', e => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
        else if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) { e.preventDefault(); commitEdit(); }
      });
      on(input, 'blur', () => { if (editing?.input === input) commitEdit(); });
      input.focus({ preventScroll: true }); input.select();
    }
    function closeEdit() {
      const { hit, input } = editing;
      editing = null; input.remove();
      const target = hit.type === 'node' ? items.nodes.get(hit.id)?.el : hit.type === 'note' ? items.notes.get(hit.id)?.el : items.groups.get(hit.id)?.tab;
      (target || host).focus({ preventScroll: true });
    }
    function commitEdit() {
      if (!editing) return;
      const { hit, input, original } = editing, value = input.value;
      closeEdit();
      if (value === original) return;
      if (hit.type === 'node') report(model.apply({ type: 'setNodeLabel', id: hit.id, label: value }));
      else if (hit.type === 'note') report(model.apply({ type: 'updateNote', id: hit.id, patch: { text: value } }));
      else report(model.apply({ type: 'updateGroup', id: hit.id, patch: { label: value } }));
    }
    function cancelEdit() { if (editing) closeEdit(); }

    // ---- lifecycle ------------------------------------------------------------------------
    const unsubscribe = model.subscribe(event => {
      if (event.kind === 'view') { if (!ownViewChange) { view = clampView(event.diagram.view || view); paintView(); } return; }
      if (event.kind === 'load') { fittedView = false; cancelGesture(); cancelPending(); view = clampView(event.diagram.view || view); paintView(); }
      if (event.kind !== 'selection' && pending && (!findNode(pending.source.nodeId) || !portPosition(pending.source.nodeId, pending.source.portId))) cancelPending();
      render();
    });
    let size = rect();
    const resize = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(() => {
      const next = rect();
      if(fittedView)fit();else setView({x: view.x + (size.width - next.width) / (2 * view.zoom), y: view.y + (size.height - next.height) / (2 * view.zoom)});
      size = next;
    }) : null;
    resize?.observe(host);
    doc.fonts?.ready?.then(() => { if (!events.signal.aborted) { renderer.invalidateText(); render(); } });
    paintView();
    render();

    return {
      host, layers, svg,
      metrics: Object.freeze({ nodeWidth: W, nodeHeight: H, statusHeight: STATUS_HEIGHT, grid: GRID }),
      nodeBox, groupBox, groupElement, foldedGroups, portPosition, toggleGroup,
      edgeElement: id => items.edges.get(id)?.path || null,
      nodeElement: id => items.nodes.get(id)?.el || null,
      dropClassAt(classId, clientX, clientY) {
        const p = dropPosition(screenToWorld({ x: clientX, y: clientY }));
        return report(model.apply({ type: 'addNode', classId, x: p.x, y: p.y }));
      },
      setMultiSelect(value) { explicitMultiSelect = Boolean(value); host.dataset.multiSelect = String(explicitMultiSelect); },
      setState(value, options = {}) { runView = value; runPending = Boolean(options.pending); paintState(); },
      flush: flushNow, setInsets(value) {const changed=JSON.stringify(insets)!==JSON.stringify(value);insets={...value};if(changed&&fittedView)fit();}, getInsets:()=>({...insets}),
      fit, zoomBy, getView: () => ({ ...view }), setView: (v, options) => setView(v, options),
      screenToWorld, worldToScreen, viewportCenter, groupAt, snap,
      startConnect: (nodeId, portId) => { const n = findNode(nodeId), port = n && classInfo(n.classId).ports.find(p => p.id === portId); if (port) startPending({ nodeId, portId, dir: port.direction }); },
      cancelConnect: cancelPending,
      editLabel: id => beginEdit({ type: model.itemType(id)?.slice(0, -1), id }),
      showHint,
      render,
      dispose() {
        cancelGesture(); cancelPending(); cancelEdit();
        if (frame) win.cancelAnimationFrame(frame);
        win.clearTimeout(hintTimer);
        overlay?.dispose(); events.abort(); unsubscribe(); resize?.disconnect();
        svg.remove(); hint.remove();
        host.classList.remove('sd-canvas', 'is-connecting', 'is-dragging', 'is-panning');
      },
    };
  }

  return Object.freeze({ create });
});
