(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./overlay.js') : root.SimulatteSystemDiagramOverlay);
  if (node) module.exports = api; else root.SimulatteSystemDiagramEffectsModel = api;
})(globalThis, function (Overlay) {
  'use strict';
  if (!Overlay?.transitFraction || !Overlay.edgeActivity || !Overlay.payloadFamily) throw Error('Effects model requires the System Diagram overlay helpers');
  // Every effect is a pure function of the observed run view and simulation time, so pausing freezes it
  // and playback speed scales it; nothing animates on wall-clock time alone.
  const TRAIL = Object.freeze({steps: 5, spacing: 12});
  const PARTICLE = Object.freeze({head: 15, trail: 10, response: 14});
  const FLOW = Object.freeze({baseSpeed: 40, rateSpeed: 18, spacing: 46, widthScale: 2.6});
  const PULSE = Object.freeze({durationSec: 0.6, reach: 48});
  const QUEUE_SATURATION = 6;

  const clamp01 = v => (v > 1 ? 1 : v > 0 ? v : 0);
  function pointAt(sample, f) {
    const pos = clamp01(f) * sample.count, i = Math.min(sample.count - 1, Math.floor(pos)), r = pos - i;
    return [sample.xs[i] + (sample.xs[i + 1] - sample.xs[i]) * r, sample.ys[i] + (sample.ys[i + 1] - sample.ys[i]) * r];
  }

  function parseColor(text) {
    const value = String(text || '').trim();
    let m = /^#([0-9a-f]{3})$/i.exec(value);
    if (m) return [...m[1]].map(c => parseInt(c + c, 16) / 255);
    m = /^#([0-9a-f]{6})$/i.exec(value);
    if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255);
    m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(value);
    if (m) return [m[1], m[2], m[3]].map(v => Math.min(255, Number(v)) / 255);
    throw Error(`Unsupported effect color: ${value || '(empty)'}`);
  }
  const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  function particleBuffers(limit) {
    const capacity = limit * (TRAIL.steps + 1);
    return {capacity, position: new Float32Array(capacity * 3), tint: new Float32Array(capacity * 3), size: new Float32Array(capacity), alpha: new Float32Array(capacity), shape: new Float32Array(capacity)};
  }

  // Heads sit where the engine says each message is; trails are earlier positions of the same message.
  function writeParticles(out, {t, transit, sampleFor, palette}) {
    let n = 0;
    const put = (x, y, color, size, alpha, shape) => {
      if (n >= out.capacity) return false;
      out.position[n * 3] = x; out.position[n * 3 + 1] = -y; out.position[n * 3 + 2] = 0;
      out.tint[n * 3] = color[0]; out.tint[n * 3 + 1] = color[1]; out.tint[n * 3 + 2] = color[2];
      out.size[n] = size; out.alpha[n] = alpha; out.shape[n] = shape; n++;
      return true;
    };
    for (const m of transit || []) {
      const entry = sampleFor(m.edgeId);
      if (!entry) continue;
      const response = m.kind === 'res', failed = m.ok === false;
      const color = failed ? palette.danger : palette[Overlay.payloadFamily(m.ptype)] || palette.request;
      const f = Overlay.transitFraction(t, m.t0, m.t1, m.kind), [x, y] = pointAt(entry.sample, f);
      if (!put(x, y, color, response ? PARTICLE.response : PARTICLE.head, 1, response ? 1 : 0)) break;
      const step = TRAIL.spacing / Math.max(1, entry.sample.length), behind = response ? 1 : -1;
      for (let k = 1; k <= TRAIL.steps; k++) {
        const g = f + behind * step * k;
        if (g < 0 || g > 1) break;
        const [tx, ty] = pointAt(entry.sample, g);
        if (!put(tx, ty, color, PARTICLE.trail * (1 - k / (TRAIL.steps + 2)), 0.45 * (1 - k / (TRAIL.steps + 1)), 0)) return n;
      }
    }
    return n;
  }

  // Flow speed follows the observed message rate; the phase is simulation time, so a paused run stands still.
  function edgeFlows(edges, sampleFor) {
    const flows = [];
    for (const id of Object.keys(edges || {}).sort()) {
      const activity = Overlay.edgeActivity(edges[id]);
      if (activity.state === 'idle') continue;
      const entry = sampleFor(id);
      if (!entry) continue;
      const rate = Number(edges[id].rate) || 0;
      flows.push({id, d: entry.d, sample: entry.sample, state: activity.state, faulted: activity.faulted, halfWidth: activity.width * FLOW.widthScale, speed: FLOW.baseSpeed + FLOW.rateSpeed * Math.log2(1 + rate), spacing: FLOW.spacing});
    }
    return flows;
  }

  // A triangle strip around a sampled path: two vertices per sample with distance along the path and side.
  function ribbon(sample, halfWidth) {
    const n = sample.count + 1, position = new Float32Array(n * 2 * 3), along = new Float32Array(n * 2), side = new Float32Array(n * 2), index = [];
    let distance = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let dx = sample.xs[b] - sample.xs[a], dy = sample.ys[b] - sample.ys[a];
      const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
      if (i > 0) distance += Math.hypot(sample.xs[i] - sample.xs[i - 1], sample.ys[i] - sample.ys[i - 1]);
      for (const s of [-1, 1]) {
        const v = i * 2 + (s > 0 ? 1 : 0);
        position[v * 3] = sample.xs[i] - dy * halfWidth * s; position[v * 3 + 1] = -(sample.ys[i] + dx * halfWidth * s); position[v * 3 + 2] = 0;
        along[v] = distance; side[v] = s;
      }
      if (i < n - 1) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    return {position, along, side, index, length: distance};
  }

  // Bursts mark observed failures: a node's error or rejection count rose, or a fault became active.
  function nodeEvents(previous, nodes, t) {
    const events = [];
    for (const id of Object.keys(nodes || {}).sort()) {
      const now = nodes[id], before = previous?.[id];
      if (!before) continue;
      const failures = (now.errors || 0) + (now.rejected || 0), prior = (before.errors || 0) + (before.rejected || 0);
      if (failures > prior) events.push({id, kind: 'failure', at: t});
      if ((now.faults || []).length && !(before.faults || []).length) events.push({id, kind: 'fault', at: t});
    }
    return events;
  }
  const pulseAge = (event, t) => (t - event.at) / PULSE.durationSec;
  const livePulses = (events, t) => events.filter(e => { const age = pulseAge(e, t); return age >= 0 && age < 1; });

  // Queue glow saturates logarithmically so a short queue reads but a long one does not swamp the diagram.
  function nodeGlows(nodes) {
    const glows = [];
    for (const id of Object.keys(nodes || {}).sort()) {
      const node = nodes[id], queue = Number(node.queue) || 0, faulted = (node.faults || []).length > 0 || node.health === 'down';
      if (queue <= 0 && !faulted) continue;
      glows.push({id, queue: clamp01(Math.log2(1 + queue) / QUEUE_SATURATION), faulted});
    }
    return glows;
  }

  return Object.freeze({TRAIL, PARTICLE, FLOW, PULSE, pointAt, parseColor, luminance, particleBuffers, writeParticles, edgeFlows, ribbon, nodeEvents, pulseAge, livePulses, nodeGlows});
});
