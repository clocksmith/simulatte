(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteSystemDiagramRouting = api;
})(globalThis, function () {
  'use strict';
  const GAP = 12, STUB = 24, DOT = 4.5, BEND_COST = 24, RADIUS = 6, EPS = 1e-7;
  const NORMALS = Object.freeze({left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1]});
  const key = p => `${p.nodeId}.${p.portId || p.id}`;
  const length = (a, b) => Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
  function layoutPorts(box, ports, peers = new Map()) {
    const sides = new Map(Object.keys(NORMALS).map(side => [side, []]));
    for (const port of ports) {
      let dx = 0, dy = 0;
      for (const peer of peers.get(key(port)) || []) {
        const x = (peer.x - box.x - box.w / 2) / box.w, y = (peer.y - box.y - box.h / 2) / box.h;
        const distance = Math.hypot(x, y) || 1; dx += x / distance; dy += y / distance;
      }
      const side = Math.hypot(dx, dy) < EPS ? (port.direction === 'out' ? 'right' : 'left')
        : Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'bottom' : 'top');
      sides.get(side).push(port);
    }
    return [...sides].flatMap(([side, entries]) => {
      const horizontalSide = side === 'top' || side === 'bottom';
      const target = port => {const neighbors = peers.get(key(port)) || []; return neighbors.length
        ? neighbors.reduce((sum, peer) => sum + (horizontalSide ? peer.x : peer.y), 0) / neighbors.length
        : horizontalSide ? box.x + box.w / 2 : box.y + box.h / 2;};
      return entries.sort((a, b) => target(a) - target(b) || key(a).localeCompare(key(b))).map((port, i) => {
      const [nx, ny] = NORMALS[side], fraction = (i + 1) / (entries.length + 1);
      return {port, side, nx, ny, x: box.x + (nx ? (nx > 0 ? box.w : 0) : box.w * fraction),
        y: box.y + (ny ? (ny > 0 ? box.h : 0) : box.h * fraction),
        hit: Math.min(12, (nx ? box.h : box.w) / (entries.length + 1) / 2 + 2)};
      });
    });
  }
  function clearSegment(a, b, obstacles) {
    return !obstacles.some(r => a.y === b.y
      ? a.y > r.y + EPS && a.y < r.y + r.h - EPS && Math.max(a.x, b.x) > r.x + EPS && Math.min(a.x, b.x) < r.x + r.w - EPS
      : a.x > r.x + EPS && a.x < r.x + r.w - EPS && Math.max(a.y, b.y) > r.y + EPS && Math.min(a.y, b.y) < r.y + r.h - EPS);
  }
  function simplify(points) {
    const result = [];
    for (const p of points) {
      const last = result.at(-1), before = result.at(-2);
      if (last && length(last, p) < EPS) continue;
      if (before && ((before.x === last.x && last.x === p.x) || (before.y === last.y && last.y === p.y))) result.pop();
      result.push({x: p.x, y: p.y});
    }
    return result;
  }
  class Queue {
    constructor() {this.rows = [];}
    less(a, b) {return a.score < b.score || (a.score === b.score && a.remaining < b.remaining);}
    push(row) {
      const a = this.rows; a.push(row); let i = a.length - 1;
      while (i) {const parent = (i - 1) >> 1; if (!this.less(a[i], a[parent])) break; [a[i], a[parent]] = [a[parent], a[i]]; i = parent;}
    }
    pop() {
      const a = this.rows, first = a[0], end = a.pop();
      if (a.length) {a[0] = end; let i = 0;
        while (true) {let next = i; for (const child of [i * 2 + 1, i * 2 + 2]) if (child < a.length && this.less(a[child], a[next])) next = child;
          if (next === i) break; [a[i], a[next]] = [a[next], a[i]]; i = next;}
      }
      return first;
    }
  }
  // A* on the rectilinear visibility grid. Cost is Manhattan length plus bends;
  // obstacle boundaries supply exact detour coordinates, independent of zoom.
  function search(start, end, obstacles, from, to) {
    const unique = values => [...new Set(values)].sort((a, b) => a - b);
    const xs = unique([start.x, end.x, ...obstacles.flatMap(r => [r.x, r.x + r.w])]);
    const ys = unique([start.y, end.y, ...obstacles.flatMap(r => [r.y, r.y + r.h])]);
    const ny = ys.length, sx = xs.indexOf(start.x), sy = ys.indexOf(start.y);
    const encode = (x, y, axis) => (x * ny + y) * 2 + axis;
    const first = encode(sx, sy, from.nx ? 0 : 1), queue = new Queue(), costs = new Map([[first, 0]]), parents = new Map(), segments = new Map();
    queue.push({id: first, x: sx, y: sy, axis: from.nx ? 0 : 1, cost: 0, remaining: length(start, end), score: length(start, end)});
    while (queue.rows.length) {
      const row = queue.pop(); if (row.cost !== costs.get(row.id)) continue;
      const point = {x: xs[row.x], y: ys[row.y]};
      if (point.x === end.x && point.y === end.y) {
        const points = []; let id = row.id;
        while (id !== undefined) {const vertex = Math.floor(id / 2); points.push({x: xs[Math.floor(vertex / ny)], y: ys[vertex % ny]}); id = parents.get(id);}
        return points.reverse();
      }
      for (const [dx, dy, axis] of [[1, 0, 0], [-1, 0, 0], [0, 1, 1], [0, -1, 1]]) {
        const x = row.x + dx, y = row.y + dy;
        if (x < 0 || y < 0 || x >= xs.length || y >= ys.length) continue;
        const next = {x: xs[x], y: ys[y]};
        if (row.id === first && dx * from.nx + dy * from.ny < 0) continue;
        if (next.x === end.x && next.y === end.y && dx * to.nx + dy * to.ny > 0) continue;
        const pair = [row.x * ny + row.y, x * ny + y].sort((a, b) => a - b).join(':');
        if (!segments.has(pair)) segments.set(pair, clearSegment(point, next, obstacles));
        if (!segments.get(pair)) continue;
        const id = encode(x, y, axis), cost = row.cost + length(point, next) + (axis === row.axis ? 0 : BEND_COST)
          + (next.x === end.x && next.y === end.y && axis !== (to.nx ? 0 : 1) ? BEND_COST : 0);
        if (cost >= (costs.get(id) ?? Infinity)) continue;
        costs.set(id, cost); parents.set(id, row.id);
        const remaining = length(next, end); queue.push({id, x, y, axis, cost, remaining, score: cost + remaining});
      }
    }
    return null;
  }
  function route(from, to, boxes = []) {
    const a = {...from, nx: from.nx ?? 1, ny: from.ny ?? 0}, b = {...to, nx: to.nx ?? -1, ny: to.ny ?? 0};
    const offset = (p, amount) => ({x: p.x + p.nx * amount, y: p.y + p.ny * amount});
    const first = offset(a, DOT), last = offset(b, DOT), forward = (b.x - a.x) * a.nx + (b.y - a.y) * a.ny;
    if ((first.x === last.x || first.y === last.y) && forward > DOT * 2 && a.nx === -b.nx && a.ny === -b.ny && clearSegment(first, last, boxes)) return {blocked: false, points: [first, last]};
    const stub = forward > DOT * 2 && a.nx === -b.nx && a.ny === -b.ny ? Math.min(STUB, forward / 2) : STUB;
    const start = offset(a, stub), end = offset(b, stub);
    const obstacles = boxes.map(r => ({x: r.x - GAP, y: r.y - GAP, w: r.w + GAP * 2, h: r.h + GAP * 2}));
    let middle = search(start, end, obstacles, a, b);
    if (!middle) middle = search(start, end, boxes, a, b);
    // Overlapping authored nodes can enclose a port. Keep that impossibility
    // explicit instead of claiming obstacle avoidance for the fallback preview.
    return {blocked: !middle || !clearSegment(first, start, boxes) || !clearSegment(end, last, boxes), points: simplify([first, ...(middle || [start, {x: end.x, y: start.y}, end]), last])};
  }
  function path(points, radius = RADIUS) {
    if (!points.length) return '';
    let d = `M${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1], p = points[i], b = points[i + 1], r = Math.min(radius, length(a, p) / 2, length(p, b) / 2);
      const before = {x: p.x + Math.sign(a.x - p.x) * r, y: p.y + Math.sign(a.y - p.y) * r};
      const after = {x: p.x + Math.sign(b.x - p.x) * r, y: p.y + Math.sign(b.y - p.y) * r};
      d += `L${before.x} ${before.y}Q${p.x} ${p.y} ${after.x} ${after.y}`;
    }
    return d + `L${points.at(-1).x} ${points.at(-1).y}`;
  }
  function label(points) {
    const total = points.slice(1).reduce((n, p, i) => n + length(points[i], p), 0); let left = total / 2;
    for (let i = 1; i < points.length; i++) {const a = points[i - 1], b = points[i], size = length(a, b);
      if (left <= size) {const t = size ? left / size : 0; return {x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - 8};} left -= size;}
    return {x: points[0]?.x || 0, y: points[0]?.y || 0};
  }
  return Object.freeze({layoutPorts, route, path, label, clearSegment, NORMALS});
});
