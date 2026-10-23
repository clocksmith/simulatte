(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteSystemDiagramGlyphs = api;
})(globalThis, function () {
  'use strict';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const VIEW = 20;
  const STROKE = 1.5;
  const c = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  const r = (x, y, w, h, k = 1) => `M${x + k} ${y}h${w - 2 * k}a${k} ${k} 0 0 1 ${k} ${k}v${h - 2 * k}a${k} ${k} 0 0 1 ${-k} ${k}h${-(w - 2 * k)}a${k} ${k} 0 0 1 ${-k} ${-k}v${-(h - 2 * k)}a${k} ${k} 0 0 1 ${k} ${-k}z`;
  const cylinder = 'M4 5c0-1.7 2.7-3 6-3s6 1.3 6 3-2.7 3-6 3-6-1.3-6-3z M4 5v10c0 1.7 2.7 3 6 3s6-1.3 6-3V5';

  // One stroke-only path per glyph on a 20 unit grid; drawn with currentColor so themes apply.
  const PATHS = Object.freeze({
    users: `${c(8, 7, 3)} M2.5 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5 ${c(14.5, 6, 2.3)} M14.5 11c2.4.2 4 2 4 4.8`,
    phone: `${r(6, 2, 8, 16, 2)} M9 15h2`,
    api: 'M7 6l-4 4 4 4M13 6l4 4-4 4M11.2 4l-2.4 12',
    burst: 'M10 2v4M10 14v4M2 10h4M14 10h4M4.3 4.3l2.8 2.8M12.9 12.9l2.8 2.8M4.3 15.7l2.8-2.8M12.9 7.1l2.8-2.8',
    text: 'M3 4h14v10H8.5L5 17v-3H3z M6 7.5h8M6 10.5h5',
    document: 'M5 2h7l4 4v12H5z M12 2v4h4 M8 10h5M8 13h5',
    server: `${r(3, 3, 14, 6)} ${r(3, 11, 14, 6)} M6 6h1M6 14h1M10 6h4M10 14h4`,
    cube: 'M10 2l7 4v8l-7 4-7-4V6z M3 6l7 4 7-4 M10 10v8',
    lock: `${r(4, 9, 12, 9, 1.5)} M7 9V6a3 3 0 0 1 6 0v3 M10 12.5v2.5`,
    cog: `${c(10, 10, 2.5)} ${c(10, 10, 5.5)} M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3M4 4l2.1 2.1M13.9 13.9L16 16M4 16l2.1-2.1M13.9 6.1L16 4`,
    fanout: `${c(4, 10, 2)} M6 10h11M6 9l5-5h6M6 11l5 5h6`,
    bulkhead: `${r(2, 5, 16, 10)} M7.3 5v10M12.7 5v10`,
    person: `${c(10, 6, 3.2)} M4 18c0-3.5 2.7-6 6-6s6 2.5 6 6`,
    queue: 'M2 7h11v6H2z M5.7 7v6M9.3 7v6 M15 10h3.5M16.5 8l2 2-2 2',
    topic: `${c(10, 10, 1.8)} M6.5 6.5a5 5 0 0 0 0 7M13.5 6.5a5 5 0 0 1 0 7M4 4a8.5 8.5 0 0 0 0 12M16 4a8.5 8.5 0 0 1 0 12`,
    stream: 'M2 6c3-2 5 2 8 0s5-2 8 0M2 10c3-2 5 2 8 0s5-2 8 0M2 14c3-2 5 2 8 0s5-2 8 0',
    dlq: 'M2 11l3-7h10l3 7v5H2z M2 11h5l1 2h4l1-2h5 M8.5 5.8l3 3M11.5 5.8l-3 3',
    database: `${cylinder} M4 10c0 1.7 2.7 3 6 3s6-1.3 6-3`,
    warehouse: 'M2 8l8-5 8 5v10H2z M6 18v-6h8v6 M6 15h8',
    globe: `${c(10, 10, 8)} M2 10h16 M10 2c2.5 2.2 3.5 5 3.5 8s-1 5.8-3.5 8c-2.5-2.2-3.5-5-3.5-8s1-5.8 3.5-8z`,
    plug: 'M7 2v4M13 2v4M5 6h10v4a5 5 0 0 1-10 0z M10 15v3',
    balancer: `${c(10, 4, 2)} M10 6v8M4 14v-2h12v2 ${c(4, 16, 2)} ${c(10, 16, 2)} ${c(16, 16, 2)}`,
    gateway: 'M3 18V8l7-5 7 5v10 M7 18v-6a3 3 0 0 1 6 0v6',
    limiter: 'M3 15a7 7 0 1 1 14 0 M10 15l3.5-4.5 M3 15h2M15 15h2M10 6v1.5',
    breaker: `${c(5, 13, 1.5)} ${c(15, 13, 1.5)} M2 13h1.5M16.5 13H18 M6.2 12L13 6.5`,
    retry: 'M15.6 7A6.5 6.5 0 1 0 16.5 11 M16.2 3v4.2H12',
    fallback: 'M2 6h16M15 3l3 3-3 3 M6 6v6a3 3 0 0 0 3 3h9 M15 12l3 3-3 3',
    switch: `${r(2, 6, 16, 8, 4)} ${c(14, 10, 2.5)}`,
    replicas: `${r(2, 8, 10, 10)} M5 8V5h10v10h-3 M8 5V2h10v10h-3`,
    cache: 'M11 2L4 11h5l-1 7 7-9h-5z',
    bucket: 'M3 5h14l-1.8 12H4.8z M3 5c0-1.1 3.1-2 7-2s7 .9 7 2',
    lake: 'M5 10l3-6 3 4 2-2 3 4 M2 13c2-1.5 4 1.5 6 0s4-1.5 6 0 3 1 4 .5 M2 16.5c2-1.5 4 1.5 6 0s4-1.5 6 0 3 1 4 .5',
    gpu: `${r(5, 5, 10, 10)} ${r(8, 8, 4, 4, 0.5)} M8 2v3M12 2v3M8 15v3M12 15v3M2 8h3M2 12h3M15 8h3M15 12h3`,
    sparkle: 'M9 2c.6 4 1.8 5.2 5.8 5.8-4 .6-5.2 1.8-5.8 5.8-.6-4-1.8-5.2-5.8-5.8 4-.6 5.2-1.8 5.8-5.8z M15.5 12.5c.3 1.6.8 2.1 2.4 2.4-1.6.3-2.1.8-2.4 2.4-.3-1.6-.8-2.1-2.4-2.4 1.6-.3 2.1-.8 2.4-2.4z',
    braces: 'M7 3c-2 0-2 1-2 3v2c0 1-1 2-2 2 1 0 2 1 2 2v2c0 2 0 3 2 3 M13 3c2 0 2 1 2 3v2c0 1 1 2 2 2-1 0-2 1-2 2v2c0 2 0 3-2 3',
    vector: 'M3 3v14h14 M3 17l10-10 M8.5 7H13v4.5',
    'vector-db': `${cylinder} M7 13.5l2-2.5 2 1.5 2.5-3`,
    magnifier: `${c(8.5, 8.5, 5.5)} M12.5 12.5l5 5`,
    rank: 'M3 5h14M3 10h10M3 15h6',
    scissors: `${c(5, 15, 2.5)} ${c(15, 15, 2.5)} M6.8 13.2L15 3M13.2 13.2L5 3`,
    clock: `${c(10, 10, 8)} M10 5v5l3.2 2`,
    spider: `${c(10, 11, 2.6)} ${c(10, 6.5, 1.5)} M7.6 10L3 7M12.4 10L17 7M7.5 12L3 15M12.5 12L17 15M8.6 13.4L6.5 18M11.4 13.4l2.1 4.6`,
  });
  const FALLBACK = `${r(3, 3, 14, 14, 2)} ${c(10, 10, 2.5)}`;
  const IDS = Object.freeze(Object.keys(PATHS));

  const has = id => Object.prototype.hasOwnProperty.call(PATHS, id);
  const path = id => (has(id) ? PATHS[id] : FALLBACK);

  function shape(doc, id) {
    const el = doc.createElementNS(SVG_NS, 'path');
    el.setAttribute('d', path(id));
    el.setAttribute('fill', 'none'); el.setAttribute('stroke', 'currentColor');
    el.setAttribute('stroke-width', String(STROKE)); el.setAttribute('stroke-linecap', 'round'); el.setAttribute('stroke-linejoin', 'round');
    return el;
  }

  // Standalone <svg> for HTML (palette); decorative unless a title is given.
  function create(doc, id, size = VIEW, title = null) {
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${VIEW} ${VIEW}`); svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size));
    svg.setAttribute('class', 'sd-glyph'); svg.dataset.glyph = has(id) ? id : 'generic';
    if (title) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', title); } else svg.setAttribute('aria-hidden', 'true');
    svg.append(shape(doc, id));
    return svg;
  }

  // Fills an existing SVG <g> (canvas nodes); the caller positions and scales the group.
  function fill(group, id, size = VIEW) {
    group.replaceChildren(shape(group.ownerDocument, id));
    group.dataset.glyph = has(id) ? id : 'generic';
    const scale = size / VIEW;
    if (scale !== 1) group.firstChild.setAttribute('transform', `scale(${scale})`);
    return group;
  }

  return Object.freeze({ VIEW, IDS, has, path, create, fill });
});
