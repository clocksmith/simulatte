(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteSystemDiagramMetrics = api;
})(globalThis, function (root) {
  'use strict';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const VALIDITY = 'synthetic model';
  const REDRAW_MS = 250;
  const CHART_HEIGHT = 88;
  const AXIS_BAND = 18;
  const CHART_LEFT = 36;
  const CHART_RIGHT = 8;
  const CHART_TOP = 8;
  const EVENT_LIMIT = 40;
  const DANGER_EVENT = /fault|crash|down|open|dead|error|fail|stop|reject|timeout|partition|outage|limit|lost|drop/i;
  const HEALTH_RANK = Object.freeze({ down: 0, open: 1, degraded: 2, electing: 3, busy: 4, ok: 5 });
  const NODE_COLUMNS = Object.freeze([
    { id: 'name', label: 'Node', numeric: false },
    { id: 'health', label: 'Health', numeric: false },
    { id: 'utilization', label: 'Util', numeric: true },
    { id: 'queue', label: 'Queue', numeric: true },
    { id: 'throughput', label: 'req/s', numeric: true },
    { id: 'p95', label: 'p95 ms', numeric: true },
    { id: 'errors', label: 'Errors', numeric: true },
  ]);

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return 'n/a';
    const a = Math.abs(value);
    if (a >= 1e6) return `${(value / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
    if (a >= 1e4) return `${(value / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k`;
    if (digits != null) return value.toFixed(digits);
    if (a >= 100 || Number.isInteger(value)) return Math.round(value).toLocaleString('en-US');
    if (a >= 10) return value.toFixed(1);
    if (a >= 1) return value.toFixed(2);
    if (a === 0) return '0';
    return value.toPrecision(2);
  }
  const formatMs = ms => (!Number.isFinite(ms) ? 'n/a' : ms >= 1000 ? formatNumber(ms / 1000, ms >= 10000 ? 1 : 2) : formatNumber(ms));
  const msUnit = ms => (Number.isFinite(ms) && ms >= 1000 ? 's' : 'ms');
  const formatPercent = fraction => (!Number.isFinite(fraction) ? 'n/a' : fraction > 0 && fraction < 0.001 ? '<0.1' : (fraction * 100).toFixed(fraction >= 0.1 ? 0 : 1));
  const formatTime = t => `${Number.isFinite(t) ? t.toFixed(1) : '0.0'} s`;

  // Maps one observe() view to governing/supporting/detail tiles with honest measurement metadata.
  function tilesFor(view) {
    const g = view.global || {}, t = view.t || 0;
    const freshness = view.done ? 'final' : 'current';
    const validity = view.error ? 'invalid' : VALIDITY;
    const span = `0–${t.toFixed(1)} s`;
    const lat = g.latency || {}, win = g.latencyWindow || {};
    const hasLatency = (g.completed || 0) > 0 && Number.isFinite(lat.p95);
    const latencyTile = (id, subject, value, level) => ({
      id, subject, level, value: hasLatency ? formatMs(value) : 'n/a', unit: hasLatency ? msUnit(value) : '',
      timeBasis: `completed requests, ${span}`, freshness, validity: hasLatency ? validity : 'no samples',
    });
    const tiles = [
      { id: 'throughput', subject: 'Throughput', value: formatNumber(g.throughput || 0), unit: 'req/s', timeBasis: 'last 5 s', freshness, validity, level: 'governing' },
      latencyTile('p95', 'p95 latency', lat.p95, 'governing'),
      { id: 'errorRate', subject: 'Error rate', value: formatPercent(g.errorRate || 0), unit: '%', timeBasis: 'last 5 s', freshness, validity, level: 'governing' },
      latencyTile('p50', 'p50 latency', lat.p50, 'supporting'),
      latencyTile('p99', 'p99 latency', lat.p99, 'supporting'),
      { id: 'inFlight', subject: 'In flight', value: formatNumber(g.inFlight || 0), unit: 'requests', timeBasis: `at ${t.toFixed(1)} s`, freshness, validity, level: 'supporting' },
      { id: 'outcomes', subject: 'Completed / failed', value: `${formatNumber(g.completed || 0)} / ${formatNumber(g.failed || 0)}`, unit: '', timeBasis: span, freshness, validity, level: 'supporting' },
      { id: 'retries', subject: 'Retries / requests', value: `${formatNumber(g.retries || 0)} / ${formatNumber(g.offered || 0)}`, unit: '', timeBasis: `${formatNumber(g.attempts || 0)} attempts, ${span}`, freshness, validity, level: 'detail' },
      { id: 'effects', subject: 'Effects / duplicates', value: `${formatNumber(g.effects || 0)} / ${formatNumber(g.duplicateEffects || 0)}`, unit: '', timeBasis: span, freshness, validity, level: 'detail' },
      { id: 'window', subject: 'p95 latency, recent', value: Number.isFinite(win.p95) ? formatMs(win.p95) : 'n/a', unit: Number.isFinite(win.p95) ? msUnit(win.p95) : '', timeBasis: 'last 10 s', freshness, validity: Number.isFinite(win.p95) ? validity : 'no samples', level: 'detail' },
      { id: 'wasted', subject: 'Wasted work', value: formatNumber(g.wastedWork || 0), unit: 'late replies', timeBasis: span, freshness, validity, level: 'detail' },
    ];
    if ((g.cost || 0) > 0) tiles.push({ id: 'cost', subject: 'Synthetic cost', value: g.cost >= 1 ? g.cost.toFixed(2) : g.cost.toPrecision(2), unit: 'USD', timeBasis: span, freshness, validity, level: 'detail' });
    return tiles;
  }

  function failureBreakdown(failedBy) {
    return Object.entries(failedBy || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([code, n]) => `${code} ${formatNumber(n)}`).join(' · ');
  }

  // Only buckets that ended at or before t are drawn, so the trailing partial bucket never reads as a drop.
  function seriesRows(series, t) {
    if (!series || !Array.isArray(series.offered)) return [];
    const b = series.bucketSec, rows = [];
    for (let i = 0; i < series.offered.length; i++) {
      const start = series.startSec + i * b;
      if (start + b > t + 1e-9) break;
      rows.push({ t: start + b, offered: series.offered[i] / b, completed: (series.completed[i] || 0) / b, failed: (series.failed[i] || 0) / b, p95: Number.isFinite(series.p95[i]) && series.p95[i] > 0 ? series.p95[i] : null });
    }
    return rows;
  }

  function niceMax(value) {
    if (!(value > 0)) return 1;
    const exp = Math.pow(10, Math.floor(Math.log10(value))), f = value / exp;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
  }

  function nodeRows(view, labelFor) {
    return Object.entries(view.nodes || {}).map(([id, n]) => ({
      id, name: labelFor ? labelFor(id) : id, health: n.health || 'ok', utilization: n.utilization || 0, queue: n.queue || 0, queueCapacity: n.queueCapacity || 0,
      throughput: n.throughput || 0, p95: n.served > 0 && Number.isFinite(n.latency?.p95) ? n.latency.p95 : null, errors: (n.errors || 0) + (n.rejected || 0),
    }));
  }

  function sortNodeRows(rows, key, direction) {
    const sign = direction === 'asc' ? 1 : -1;
    const value = row => (key === 'health' ? HEALTH_RANK[row.health] ?? 9 : key === 'p95' ? row.p95 ?? -1 : row[key]);
    return [...rows].sort((a, b) => {
      const va = value(a), vb = value(b);
      const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
      return c * sign || a.id.localeCompare(b.id);
    });
  }

  function createChart(doc, { title, unit, series, legend }) {
    const el = doc.createElement('figure'); el.className = 'sd-chart';
    const caption = doc.createElement('figcaption'); caption.className = 'sd-chart-title';
    const name = doc.createElement('span'); name.textContent = title;
    const latest = doc.createElement('span'); latest.className = 'sd-chart-latest';
    caption.append(name, latest);
    const keys = doc.createElement('div'); keys.className = 'sd-chart-legend';
    if (legend) for (const s of series) {
      const key = doc.createElement('span'); key.className = 'sd-chart-key'; key.dataset.series = s.id;
      const swatch = doc.createElement('i'); swatch.setAttribute('aria-hidden', 'true');
      key.append(swatch, doc.createTextNode(s.label)); keys.append(key);
    }
    const plot = doc.createElement('div'); plot.className = 'sd-chart-plot'; plot.tabIndex = 0;
    plot.setAttribute('role', 'img'); plot.setAttribute('aria-label', `${title} chart`);
    const svg = doc.createElementNS(SVG_NS, 'svg'); svg.setAttribute('class', 'sd-chart-svg');
    const tip = doc.createElement('div'); tip.className = 'sd-chart-tip'; tip.hidden = true;
    plot.append(svg, tip);
    const note = doc.createElement('p'); note.className = 'sd-chart-note';
    el.append(caption, ...(legend ? [keys] : []), plot, note);
    let width = 0, rows = [], hover = -1, geometry = null;
    const mk = (tag, attrs, parent) => { const n = doc.createElementNS(SVG_NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); parent.append(n); return n; };

    function draw() {
      svg.replaceChildren();
      const w = width || 280, h = CHART_HEIGHT + AXIS_BAND;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('width', String(w)); svg.setAttribute('height', String(h));
      const values = rows.flatMap(r => series.map(s => r[s.id])).filter(Number.isFinite);
      const max = niceMax(Math.max(0, ...values));
      const x0 = CHART_LEFT, x1 = w - CHART_RIGHT, y0 = CHART_HEIGHT, yTop = CHART_TOP;
      const tMin = rows.length ? rows[0].t : 0, tMax = rows.length ? rows.at(-1).t : 1;
      const sx = t => (tMax > tMin ? x0 + ((t - tMin) / (tMax - tMin)) * (x1 - x0) : x1);
      const sy = v => y0 - (v / max) * (y0 - yTop);
      geometry = { sx, sy, x0, x1, y0, yTop };
      for (const [v, label] of [[0, '0'], [max / 2, null], [max, formatNumber(max)]]) {
        mk('line', { class: 'sd-chart-grid', x1: x0, x2: x1, y1: sy(v), y2: sy(v) }, svg);
        if (label) { const text = mk('text', { class: 'sd-chart-axis', x: x0 - 6, y: sy(v) + 3, 'text-anchor': 'end' }, svg); text.textContent = label; }
      }
      if (rows.length) {
        for (const [t, anchor] of [[tMin, 'start'], [tMax, 'end']]) { const text = mk('text', { class: 'sd-chart-axis', x: sx(t), y: y0 + 14, 'text-anchor': anchor }, svg); text.textContent = `${Math.round(t)} s`; }
      }
      for (const s of series) {
        let d = '', pen = false;
        for (const r of rows) {
          const v = r[s.id];
          if (!Number.isFinite(v)) { pen = false; continue; }
          d += `${pen ? 'L' : 'M'}${sx(r.t).toFixed(1)},${sy(v).toFixed(1)}`; pen = true;
        }
        if (d) mk('path', { class: 'sd-chart-line', 'data-series': s.id, d }, svg);
        const last = [...rows].reverse().find(r => Number.isFinite(r[s.id]));
        if (last) mk('circle', { class: 'sd-chart-end', 'data-series': s.id, cx: sx(last.t), cy: sy(last[s.id]), r: 4 }, svg);
      }
      if (hover >= 0 && rows[hover]) {
        const r = rows[hover], x = sx(r.t);
        mk('line', { class: 'sd-chart-cross', x1: x, x2: x, y1: yTop, y2: y0 }, svg);
        for (const s of series) if (Number.isFinite(r[s.id])) mk('circle', { class: 'sd-chart-end', 'data-series': s.id, cx: x, cy: sy(r[s.id]), r: 4 }, svg);
        tip.replaceChildren();
        const head = doc.createElement('div'); head.className = 'sd-chart-tip-time'; head.textContent = `${r.t.toFixed(0)} s`; tip.append(head);
        for (const s of series) {
          const line = doc.createElement('div'); line.className = 'sd-chart-tip-row'; line.dataset.series = s.id;
          const key = doc.createElement('i'); key.setAttribute('aria-hidden', 'true');
          const v = doc.createElement('strong'); v.textContent = Number.isFinite(r[s.id]) ? `${formatNumber(r[s.id])} ${unit}` : 'n/a';
          line.append(key, v, doc.createTextNode(` ${s.label}`)); tip.append(line);
        }
        tip.hidden = false;
        tip.style.left = `${Math.min(Math.max(0, x - 60), Math.max(0, w - 130))}px`;
      } else tip.hidden = true;
    }

    function pick(clientX) {
      if (!rows.length || !geometry) return -1;
      const rect = svg.getBoundingClientRect(), x = clientX - rect.left;
      let best = 0, dist = Infinity;
      rows.forEach((r, i) => { const d = Math.abs(geometry.sx(r.t) - x); if (d < dist) { dist = d; best = i; } });
      return best;
    }
    plot.addEventListener('pointermove', e => { hover = pick(e.clientX); draw(); });
    plot.addEventListener('pointerleave', () => { hover = -1; draw(); });
    plot.addEventListener('blur', () => { hover = -1; draw(); });
    plot.addEventListener('keydown', e => {
      if (!rows.length) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); hover = hover < 0 ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, hover + (e.key === 'ArrowLeft' ? -1 : 1))); draw(); }
      else if (e.key === 'Escape') { hover = -1; draw(); }
    });
    return {
      element: el,
      resize(next) { if (next > 0 && Math.abs(next - width) >= 1) { width = Math.floor(next); draw(); } },
      update(nextRows, latestText, noteText) {
        rows = nextRows; if (hover >= rows.length) hover = rows.length - 1;
        latest.textContent = latestText; note.textContent = noteText || '';
        plot.setAttribute('aria-label', `${title} chart, ${rows.length} one-second buckets. ${latestText}`);
        draw();
      },
      widthOf: () => plot,
    };
  }

  function create(options) {
    const { host, config } = options;
    const ui = root.SimulatteWorldUI;
    if (!ui) throw Error('Metrics panel requires shared World UI');
    if (!host) throw Error('Metrics panel requires a host element');
    const doc = host.ownerDocument;
    const el = (tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const panel = el('section', 'sd-metrics'); panel.setAttribute('aria-label', 'Run metrics');
    const errorLine = el('p', 'wui-error sd-metrics-error'); errorLine.setAttribute('role', 'status');
    const tilesHost = el('div', 'wui-metrics sd-metrics-tiles'); tilesHost.setAttribute('aria-live', 'off');
    const claim = el('p', 'sd-metrics-claim', config?.claimBoundary || '');
    const tiles = new Map();

    const charts = {
      throughput: createChart(doc, { title: 'Throughput', unit: 'req/s', legend: true, series: [{ id: 'offered', label: 'Offered' }, { id: 'completed', label: 'Completed' }] }),
      failed: createChart(doc, { title: 'Failures', unit: '/s', legend: false, series: [{ id: 'failed', label: 'Failed' }] }),
      p95: createChart(doc, { title: 'p95 latency', unit: 'ms', legend: false, series: [{ id: 'p95', label: 'p95' }] }),
    };
    const chartGrid = el('div', 'sd-metrics-charts');
    chartGrid.append(charts.throughput.element, charts.failed.element, charts.p95.element);

    const transitLegend = el('p', 'sd-transit-legend');
    const families = root.SimulatteSystemDiagramOverlay?.FAMILIES || [];
    for (const f of families) { const k = el('span', 'sd-transit-key'); k.dataset.family = f.id; const dot = el('i'); dot.setAttribute('aria-hidden', 'true'); k.append(dot, doc.createTextNode(f.label)); transitLegend.append(k); }
    for (const [cls, label] of [['reply', 'Reply'], ['failed', 'Failed reply']]) { const k = el('span', `sd-transit-key sd-transit-${cls}`); const dot = el('i'); dot.setAttribute('aria-hidden', 'true'); k.append(dot, doc.createTextNode(label)); transitLegend.append(k); }

    const seriesTable = el('table', 'sd-table sd-series-table');
    const seriesDisclosure = ui.SimDisclosure({ document: doc, title: 'Series table', children: [el('div', 'sd-table-scroll')] });
    seriesDisclosure.lastChild.append(seriesTable);
    seriesDisclosure.addEventListener('toggle', () => { if (seriesDisclosure.open) drawSeriesTable(); });

    const nodeHeading = el('h3', 'sd-metrics-heading', 'Nodes');
    const nodeTable = el('table', 'sd-table sd-node-table');
    const nodeHead = el('thead'), headRow = el('tr'), nodeBody = el('tbody');
    let sortKey = 'utilization', sortDir = 'desc';
    const sortButtons = new Map();
    for (const col of NODE_COLUMNS) {
      const th = el('th'); th.scope = 'col'; if (col.numeric) th.dataset.numeric = 'true';
      const b = ui.SimButton({ document: doc, label: col.label, variant: 'quiet', onAction: () => { sortDir = sortKey === col.id && sortDir === 'desc' ? 'asc' : 'desc'; sortKey = col.id; refreshSort(); drawNodes(true); } });
      b.element.dataset.sortKey = col.id; sortButtons.set(col.id, { th, b }); th.append(b.element); headRow.append(th);
    }
    nodeHead.append(headRow); nodeTable.append(nodeHead, nodeBody);
    const nodeScroll = el('div', 'sd-table-scroll sd-node-scroll'); nodeScroll.append(nodeTable);
    const rowsById = new Map();

    const eventsHeading = el('h3', 'sd-metrics-heading', 'Recent events');
    const eventsList = el('ol', 'sd-events');
    const eventsEmpty = el('p', 'sd-events-empty', 'No notable events yet.');
    let lastSeq = -Infinity;

    panel.append(errorLine, tilesHost, chartGrid, transitLegend, seriesDisclosure, nodeHeading, nodeScroll, eventsHeading, eventsEmpty, eventsList, claim);
    host.append(panel);

    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => {
      for (const entry of entries) for (const c of Object.values(charts)) if (c.widthOf() === entry.target) c.resize(entry.contentRect.width);
    }) : null;
    for (const c of Object.values(charts)) resize?.observe(c.widthOf());

    let view = null, lastDraw = -Infinity, lastT = -1;

    function refreshSort() {
      for (const [id, { th }] of sortButtons) th.setAttribute('aria-sort', id === sortKey ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
    }
    refreshSort();

    function drawTiles() {
      const next = tilesFor(view), ids = new Set(next.map(t => t.id));
      for (const data of next) {
        let tile = tiles.get(data.id);
        if (!tile) { tile = { metric: ui.SimMetric({ document: doc }), key: '' }; tile.metric.element.dataset.metric = data.id; tiles.set(data.id, tile); }
        if (tile.metric.element.parentNode !== tilesHost) tilesHost.append(tile.metric.element);
        const key = JSON.stringify(data);
        if (tile.key !== key) { tile.key = key; tile.metric.update(data); }
      }
      for (const [id, tile] of tiles) if (!ids.has(id) && tile.metric.element.parentNode) tile.metric.element.remove();
    }

    function drawCharts() {
      const rows = seriesRows(view.series, view.t);
      const last = rows.at(-1), g = view.global || {};
      charts.throughput.update(rows, last ? `${formatNumber(last.completed)} of ${formatNumber(last.offered)} req/s` : 'no complete buckets');
      charts.failed.update(rows, last ? `${formatNumber(last.failed)} /s` : '', failureBreakdown(g.failedBy));
      const lastP95 = [...rows].reverse().find(r => r.p95 != null);
      charts.p95.update(rows, lastP95 ? `${formatMs(lastP95.p95)} ${msUnit(lastP95.p95)}` : 'no samples');
      if (seriesDisclosure.open) drawSeriesTable();
    }

    function drawSeriesTable() {
      if (!view) return;
      const rows = seriesRows(view.series, view.t).slice(-30).reverse();
      const head = el('thead'), tr = el('tr');
      for (const label of ['End s', 'Offered req/s', 'Completed req/s', 'Failed /s', 'p95 ms']) { const th = el('th', '', label); th.scope = 'col'; tr.append(th); }
      head.append(tr);
      const body = el('tbody');
      for (const r of rows) {
        const row = el('tr');
        for (const v of [r.t.toFixed(0), formatNumber(r.offered), formatNumber(r.completed), formatNumber(r.failed), r.p95 == null ? 'n/a' : formatMs(r.p95)]) row.append(el('td', '', v));
        body.append(row);
      }
      seriesTable.replaceChildren(head, body);
    }

    function drawNodes(force) {
      const rows = sortNodeRows(nodeRows(view, options.labelFor), sortKey, sortDir);
      const ids = new Set(rows.map(r => r.id));
      for (const [id, entry] of rowsById) if (!ids.has(id)) { entry.tr.remove(); rowsById.delete(id); }
      rows.forEach((r, index) => {
        let entry = rowsById.get(r.id);
        if (!entry) {
          const tr = el('tr'); tr.dataset.nodeId = r.id;
          const cells = NODE_COLUMNS.map(col => { const td = el(col.id === 'name' ? 'th' : 'td'); if (col.id === 'name') td.scope = 'row'; if (col.numeric) td.dataset.numeric = 'true'; tr.append(td); return td; });
          if (options.onSelectNode) { tr.dataset.selectable = 'true'; tr.addEventListener('click', () => options.onSelectNode(r.id)); }
          entry = { tr, cells, key: '' }; rowsById.set(r.id, entry);
        }
        const text = [r.name, r.health, `${Math.round(r.utilization * 100)}%`, r.queueCapacity ? `${formatNumber(r.queue)}/${formatNumber(r.queueCapacity)}` : formatNumber(r.queue), formatNumber(r.throughput), r.p95 == null ? 'n/a' : formatNumber(r.p95), formatNumber(r.errors)];
        const key = text.join('|');
        if (entry.key !== key) {
          entry.key = key;
          text.forEach((v, i) => { entry.cells[i].textContent = v; });
          entry.cells[1].dataset.health = r.health;
          entry.tr.dataset.health = r.health;
        }
        if (force || nodeBody.children[index] !== entry.tr) nodeBody.insertBefore(entry.tr, nodeBody.children[index] || null);
      });
    }

    function drawEvents() {
      const log = view.log || [];
      const maxSeq = log.length ? log.at(-1).seq : -Infinity;
      if (maxSeq < lastSeq) { eventsList.replaceChildren(); lastSeq = -Infinity; }
      const fresh = log.filter(e => e.seq > lastSeq);
      for (const e of fresh) {
        const li = el('li', 'sd-event'); li.dataset.kind = e.kind; li.dataset.tone = DANGER_EVENT.test(e.kind) ? 'danger' : 'neutral';
        const time = el('span', 'sd-event-time', formatTime(e.t)), message = el('span', 'sd-event-message', e.message);
        li.append(time, message); eventsList.prepend(li);
      }
      if (fresh.length) lastSeq = fresh.at(-1).seq;
      while (eventsList.children.length > EVENT_LIMIT) eventsList.lastChild.remove();
      eventsEmpty.hidden = eventsList.children.length > 0;
    }

    function render(next) {
      if (!next) return;
      const restarted = next.t < lastT;
      view = next;
      errorLine.textContent = next.error ? `Run stopped: ${next.error}` : '';
      drawTiles();
      const now = typeof performance === 'object' ? performance.now() : Date.now();
      if (restarted || next.t !== lastT && (now - lastDraw >= REDRAW_MS || next.done) || lastDraw === -Infinity) {
        lastDraw = now;
        if (restarted) { eventsList.replaceChildren(); lastSeq = -Infinity; }
        drawCharts(); drawNodes(false); drawEvents();
      }
      lastT = next.t;
    }

    return { element: panel, render, dispose() { resize?.disconnect(); panel.remove(); } };
  }

  return Object.freeze({ create, tilesFor, seriesRows, niceMax, nodeRows, sortNodeRows, failureBreakdown, formatNumber, formatMs, formatPercent, NODE_COLUMNS });
});
