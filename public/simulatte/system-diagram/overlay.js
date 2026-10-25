(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteSystemDiagramOverlay = api;
})(globalThis, function (root) {
  'use strict';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  // Payload families keep the dot palette to three validated hues; edges and node frames
  // carry the remaining state so payload identity never has to stand alone.
  const PAYLOAD_FAMILY = Object.freeze({
    http: 'request', query: 'request', rows: 'request', blob: 'request',
    task: 'message', event: 'message',
    text: 'language', json: 'language', document: 'language', embedding: 'language',
  });
  const FAMILIES = Object.freeze([
    Object.freeze({ id: 'request', label: 'Requests and data' }),
    Object.freeze({ id: 'message', label: 'Tasks and events' }),
    Object.freeze({ id: 'language', label: 'Language and documents' }),
  ]);
  const EDGE_ERROR_RATE = 0.05;
  const EDGE_BASE_WIDTH = 1.5;
  const EDGE_MAX_EXTRA_WIDTH = 4;
  const PATH_SAMPLE_SPACING = 8;
  const PATH_SAMPLES_MIN = 8;
  const PATH_SAMPLES_MAX = 96;
  const DOT_RADIUS = 3.5;
  // The canvas status slot is a strip along the node's bottom edge (data-width x data-height).
  const STATUS_GAP = 4;
  const STATUS_INSET = 8;
  const BAR_HEIGHT = 2;
  const COUNTER_BASELINE = 10;
  const BADGE_HEIGHT = 14;
  const BADGE_CHAR_WIDTH = 6;
  const HEALTH_STATES = Object.freeze(['ok', 'busy', 'degraded', 'down', 'open', 'electing']);

  const payloadFamily = ptype => PAYLOAD_FAMILY[ptype] || 'request';
  const clamp01 = v => (v > 1 ? 1 : v > 0 ? v : 0);

  function transitFraction(t, t0, t1, kind) {
    const span = t1 - t0;
    const f = span > 0 ? clamp01((t - t0) / span) : 1;
    return kind === 'res' ? 1 - f : f;
  }

  // Width grows with the log of message rate so a 1 msg/s edge and a 1000 msg/s edge both read.
  function edgeActivity(edge) {
    if (!edge) return { state: 'idle', width: EDGE_BASE_WIDTH, faulted: false };
    const faulted = Array.isArray(edge.faults) && edge.faults.length > 0;
    const rate = Number(edge.rate) || 0, errorRate = Number(edge.errorRate) || 0, inTransit = Number(edge.inTransit) || 0;
    const state = errorRate >= EDGE_ERROR_RATE ? 'error' : faulted ? 'faulted' : rate > 0 || inTransit > 0 ? 'flowing' : 'idle';
    const width = EDGE_BASE_WIDTH + Math.min(EDGE_MAX_EXTRA_WIDTH, Math.log2(1 + rate) / 2);
    return { state, width: Math.round(width * 10) / 10, faulted };
  }

  function compactNumber(value) {
    if (!Number.isFinite(value)) return '-';
    const a = Math.abs(value);
    if (a >= 1e6) return `${(value / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
    if (a >= 1e3) return `${(value / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
    if (a >= 100 || Number.isInteger(value)) return String(Math.round(value));
    return value.toFixed(a >= 10 ? 0 : 1);
  }

  function counterText(node) {
    const parts = [`${compactNumber(node.throughput)}/s`];
    const p95 = node.latency?.p95;
    if (Number.isFinite(p95) && node.served > 0) parts.push(`p95 ${p95 >= 1000 ? `${(p95 / 1000).toFixed(1)}s` : `${Math.round(p95)}ms`}`);
    if (node.errors > 0 || node.rejected > 0) parts.push(`err ${compactNumber((node.errors || 0) + (node.rejected || 0))}`);
    return parts.join(' · ');
  }

  // Path geometry is sampled once per `d` value; per-frame dot placement is pure arithmetic.
  function samplePath(path) {
    const length = path.getTotalLength();
    const count = Math.max(PATH_SAMPLES_MIN, Math.min(PATH_SAMPLES_MAX, Math.ceil(length / PATH_SAMPLE_SPACING)));
    const xs = new Float64Array(count + 1), ys = new Float64Array(count + 1);
    for (let i = 0; i <= count; i++) { const p = path.getPointAtLength((length * i) / count); xs[i] = p.x; ys[i] = p.y; }
    return { length, count, xs, ys };
  }

  function pointAt(sample, f) {
    const pos = clamp01(f) * sample.count, i = Math.min(sample.count - 1, Math.floor(pos)), r = pos - i;
    return [sample.xs[i] + (sample.xs[i + 1] - sample.xs[i]) * r, sample.ys[i] + (sample.ys[i + 1] - sample.ys[i]) * r];
  }

  function groupSummary(members, nodes) {
    const ids = [...new Set(members)], result = { components: ids.length, missing: 0, unhealthy: 0, queued: 0, busy: 0 };
    for (const id of ids) {
      const node = nodes[id];
      if (!node) { result.missing++; continue; }
      if (!['ok', 'busy'].includes(node.health) || (node.faults || []).length) result.unhealthy++;
      if (Number.isFinite(node.queue) && node.queue >= 0) result.queued += node.queue;
      if (Number.isFinite(node.busy) && node.busy >= 0) result.busy += node.busy;
    }
    result.health = result.missing ? 'unknown' : result.unhealthy ? 'degraded' : result.busy ? 'busy' : 'ok';
    result.text = result.missing ? `${result.missing} unobserved components` : `${compactNumber(result.queued)} queued jobs · ${result.unhealthy} unhealthy`;
    result.detail = `${result.components} components; ${result.missing} unobserved; ${result.busy} busy slots. Queue totals count component jobs, not unique end-to-end requests.`;
    return result;
  }

  function create({ canvas, library, config }) {
    if (!canvas?.layers?.overlay) throw Error('Overlay requires canvas.layers.overlay');
    const layer = canvas.layers.overlay;
    const doc = layer.ownerDocument;
    const svg = (tag, attrs, parent) => {
      const el = doc.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
      if (parent) parent.append(el);
      return el;
    };
    const nodeSize = { w: config?.editor?.nodeWidth, h: config?.editor?.nodeHeight };
    if (!Number.isFinite(nodeSize.w) || !Number.isFinite(nodeSize.h)) throw Error('Overlay requires config.editor.nodeWidth and nodeHeight');
    void library;

    let edgeGroup, dotGroup;
    const samples = new Map(); // edgeId -> { d, sample }
    const edgeMarks = new Map(); // edgeId -> { el, key }
    const dots = []; // pooled circles with last-state cache
    const statuses = new Map(); // nodeId -> entry
    const groupStatuses = new Map();
    let visibleDots = 0;

    function ensureGroups() {
      if (edgeGroup?.isConnected && dotGroup?.isConnected) return;
      edgeGroup = svg('g', { class: 'sd-run-edges', 'pointer-events': 'none' });
      dotGroup = svg('g', { class: 'sd-run-transit', 'pointer-events': 'none' });
      layer.prepend(edgeGroup); edgeGroup.after(dotGroup);
      edgeMarks.clear(); dots.length = 0; visibleDots = 0;
    }

    let frameSamples = new Map();
    function sampleFor(edgeId) {
      if (frameSamples.has(edgeId)) return frameSamples.get(edgeId);
      const entry = readSample(edgeId);
      frameSamples.set(edgeId, entry);
      return entry;
    }
    function readSample(edgeId) {
      const path = canvas.edgeElement(edgeId);
      if (!path || typeof path.getTotalLength !== 'function') return null;
      const d = path.getAttribute('d');
      if (!d) return null;
      const cached = samples.get(edgeId);
      if (cached && cached.d === d) return cached;
      const entry = { d, sample: samplePath(path) };
      samples.set(edgeId, entry);
      return entry;
    }

    function renderEdges(edges) {
      const seen = new Set();
      for (const id in edges) {
        const activity = edgeActivity(edges[id]);
        let mark = edgeMarks.get(id);
        if (activity.state === 'idle') { if (mark && mark.key !== 'idle') { mark.el.setAttribute('display', 'none'); mark.key = 'idle'; } if (mark) seen.add(id); continue; }
        const entry = sampleFor(id);
        if (!entry) continue;
        if (!mark) { mark = { el: svg('path', { class: 'sd-run-edge', fill: 'none' }, edgeGroup), key: '', d: '' }; edgeMarks.set(id, mark); }
        seen.add(id);
        if (mark.d !== entry.d) { mark.el.setAttribute('d', entry.d); mark.d = entry.d; }
        const key = `${activity.state}|${activity.width}|${activity.faulted}`;
        if (mark.key !== key) {
          mark.key = key;
          mark.el.removeAttribute('display');
          mark.el.setAttribute('data-activity', activity.state);
          mark.el.setAttribute('data-faulted', String(activity.faulted));
          mark.el.setAttribute('stroke-width', String(activity.width));
        }
      }
      for (const [id, mark] of edgeMarks) if (!seen.has(id)) { mark.el.remove(); edgeMarks.delete(id); samples.delete(id); }
    }

    function renderTransit(t, transit) {
      let used = 0;
      for (let i = 0; i < transit.length; i++) {
        const m = transit[i];
        const entry = sampleFor(m.edgeId);
        if (!entry) continue;
        let dot = dots[used];
        if (!dot) { dot = { el: svg('circle', { r: String(DOT_RADIUS), class: 'sd-run-dot' }, dotGroup), key: '', hidden: false }; dots.push(dot); }
        const [x, y] = pointAt(entry.sample, transitFraction(t, m.t0, m.t1, m.kind));
        dot.el.setAttribute('cx', x.toFixed(1)); dot.el.setAttribute('cy', y.toFixed(1));
        const family = payloadFamily(m.ptype), key = `${family}|${m.kind}|${m.ok !== false}`;
        if (dot.key !== key) {
          dot.key = key;
          dot.el.setAttribute('data-family', family);
          dot.el.setAttribute('data-kind', m.kind === 'res' ? 'res' : 'req');
          dot.el.setAttribute('data-ok', String(m.ok !== false));
        }
        if (dot.hidden) { dot.el.removeAttribute('display'); dot.hidden = false; }
        used++;
      }
      for (let i = used; i < visibleDots; i++) { if (!dots[i].hidden) { dots[i].el.setAttribute('display', 'none'); dots[i].hidden = true; } }
      visibleDots = used;
    }

    function buildStatus(slot) {
      const w = Number(slot.getAttribute('data-width')) || nodeSize.w;
      const sh = Number(slot.getAttribute('data-height')) || 0;
      const top = -(nodeSize.h - sh);
      const half = (w - 2 * STATUS_INSET - STATUS_GAP) / 2, barY = String(Math.max(0, sh - BAR_HEIGHT - 2));
      slot.replaceChildren();
      const frame = svg('rect', { class: 'sd-run-frame', x: '-3', y: String(top - 3), width: String(w + 6), height: String(nodeSize.h + 6), rx: '6' }, slot);
      const bar = (cls, x, width) => svg('rect', { class: cls, x: String(x), y: barY, width: String(width), height: String(BAR_HEIGHT), rx: '1' }, slot);
      bar('sd-run-track', STATUS_INSET, half);
      const qFill = bar('sd-run-queue', STATUS_INSET, 0);
      bar('sd-run-track', STATUS_INSET + half + STATUS_GAP, half);
      const uFill = bar('sd-run-util', STATUS_INSET + half + STATUS_GAP, 0);
      const counters = svg('text', { class: 'sd-run-counters', x: String(STATUS_INSET), y: String(Math.min(COUNTER_BASELINE, sh - BAR_HEIGHT - 3)) }, slot);
      const badges = svg('g', { class: 'sd-run-badges', transform: `translate(${w - 4},${top - BADGE_HEIGHT / 2})` }, slot);
      const title = svg('title', {}, slot);
      return { slot, frame, qFill, uFill, counters, badges, title, half, health: '', q: -1, u: -1, text: '', faults: '', tip: '' };
    }

    function renderBadges(entry, faults) {
      entry.badges.replaceChildren();
      let x = 0;
      for (let i = faults.length - 1; i >= 0; i--) {
        const label = faults[i], width = label.length * BADGE_CHAR_WIDTH + 8;
        x -= width;
        const g = svg('g', { class: 'sd-run-badge', transform: `translate(${x},0)` }, entry.badges);
        svg('rect', { width: String(width), height: String(BADGE_HEIGHT), rx: '2' }, g);
        const text = svg('text', { x: String(width / 2), y: String(BADGE_HEIGHT - 4), 'text-anchor': 'middle' }, g);
        text.textContent = label;
        x -= 2;
      }
    }

    function renderNodes(nodes) {
      const seen = new Set();
      for (const id in nodes) {
        const n = nodes[id], host = canvas.nodeElement(id);
        const slot = host?.querySelector('.sd-node-status');
        if (!slot) continue;
        seen.add(id);
        let entry = statuses.get(id);
        if (!entry || entry.slot !== slot || !slot.firstChild) { entry = buildStatus(slot); entry.host = host; statuses.set(id, entry); }
        const health = HEALTH_STATES.includes(n.health) ? n.health : 'ok';
        if (entry.health !== health) { entry.health = health; slot.setAttribute('data-health', health); host.setAttribute('data-health', health); }
        const q = n.queueCapacity > 0 ? clamp01(n.queue / n.queueCapacity) : n.queue > 0 ? 1 : 0;
        const qw = Math.round(q * entry.half * 2) / 2;
        if (entry.q !== qw) { entry.q = qw; entry.qFill.setAttribute('width', String(qw)); entry.qFill.setAttribute('data-full', String(q >= 0.9)); }
        const uw = Math.round(clamp01(n.utilization) * entry.half * 2) / 2;
        if (entry.u !== uw) { entry.u = uw; entry.uFill.setAttribute('width', String(uw)); entry.uFill.setAttribute('data-high', String(n.utilization >= 0.9)); }
        const text = counterText(n);
        if (entry.text !== text) { entry.text = text; entry.counters.textContent = text; }
        const faults = (n.faults || []).join(',');
        if (entry.faults !== faults) { entry.faults = faults; renderBadges(entry, n.faults || []); }
        const tip = `${health}; queue ${n.queue}/${n.queueCapacity}; utilization ${Math.round(clamp01(n.utilization) * 100)}%; ${text}`;
        if (entry.tip !== tip) { entry.tip = tip; entry.title.textContent = tip; }
      }
      for (const [id, entry] of statuses) if (!seen.has(id)) { resetStatus(entry); statuses.delete(id); }
    }

    function renderGroups(nodes) {
      const seen = new Set();
      for (const group of canvas.foldedGroups?.() || []) {
        const host = canvas.groupElement(group.id), slot = host?.querySelector('.sd-group-status');
        if (!slot) continue;
        seen.add(group.id);
        let entry = groupStatuses.get(group.id);
        if (!entry || entry.slot !== slot || !slot.firstChild) {
          slot.replaceChildren();
          entry = { host, slot, text: svg('text', { class: 'sd-run-counters', x: 12, y: 12 }, slot), title: svg('title', {}, slot) };
          groupStatuses.set(group.id, entry);
        }
        const summary = groupSummary(group.members, nodes);
        entry.text.textContent = summary.text;
        entry.title.textContent = summary.detail;
        host.setAttribute('data-health', summary.health);
      }
      for (const [id, entry] of groupStatuses) if (!seen.has(id)) { resetStatus(entry); groupStatuses.delete(id); }
    }

    function resetStatus(entry) {
      if (entry.slot.isConnected) { entry.slot.replaceChildren(); entry.slot.removeAttribute('data-health'); }
      entry.host?.removeAttribute('data-health');
    }

    function render(view) {
      if (!view) { clear(); return; }
      ensureGroups();
      frameSamples = new Map();
      renderEdges(view.edges || {});
      renderTransit(view.t, view.transit || []);
      renderNodes(view.nodes || {});
      renderGroups(view.nodes || {});
    }

    function clear() {
      for (const entry of statuses.values()) resetStatus(entry);
      statuses.clear();
      for (const entry of groupStatuses.values()) resetStatus(entry);
      groupStatuses.clear();
      edgeGroup?.remove(); dotGroup?.remove();
      edgeGroup = null; dotGroup = null;
      edgeMarks.clear(); samples.clear(); dots.length = 0; visibleDots = 0;
    }

    return { render, clear, dispose: clear };
  }

  return Object.freeze({ create, groupSummary, FAMILIES, payloadFamily, transitFraction, edgeActivity, counterText, compactNumber, EDGE_ERROR_RATE });
});
