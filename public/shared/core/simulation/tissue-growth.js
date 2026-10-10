(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SimulatteTissueGrowth = api;
})(globalThis, function () {
  const KEYS = [
    "size",
    "spacing",
    "step",
    "diffusion",
    "decay",
    "production",
    "growthMin",
    "growthMax",
    "threshold",
    "hill",
    "crowding",
    "maxCells",
    "mechanicalRate",
  ];
  function validate(p) {
    if (
      !p ||
      KEYS.some((k) => !Number.isFinite(p[k])) ||
      Object.keys(p).some((k) => !KEYS.includes(k)) ||
      !Number.isInteger(p.size) ||
      p.spacing <= 0 ||
      p.size * p.spacing < 8 ||
      p.size < 8 ||
      p.size > 96 ||
      p.step <= 0 ||
      p.step > 0.5 ||
      p.diffusion < 0 ||
      p.decay < 0 ||
      p.production < 0 ||
      p.growthMax < 0 ||
      p.growthMin > 0 ||
      p.threshold <= 0 ||
      p.hill < 1 ||
      p.hill > 16 ||
      p.step * Math.max(p.growthMax, -p.growthMin) > 0.25 ||
      p.crowding < 1 ||
      !Number.isInteger(p.maxCells) ||
      p.maxCells < 8 ||
      p.maxCells > 256 ||
      p.mechanicalRate < 0
    )
      throw Error("tissue_parameters_invalid");
  }
  function growth(signal, neighbors, p) {
    const signalPower = signal ** p.hill;
    return (
      (((p.growthMax - p.growthMin) * signalPower) /
        (p.threshold ** p.hill + signalPower) +
        p.growthMin) *
      (p.crowding ** p.hill / (p.crowding ** p.hill + neighbors ** p.hill))
    );
  }
  function initial(p, seed) {
    validate(p);
    const c = (p.size * p.spacing) / 2;
    return {
      step: 0,
      time: 0,
      nextId: 8,
      source: [c, c],
      boundary: null,
      capacityReached: false,
      divisions: 0,
      deaths: 0,
      removed: 0,
      cells: Array.from({ length: 7 }, (_, i) => ({
        id: `cell:${i}`,
        parentId: null,
        lineageId: `cell:${i}`,
        x: c + (i ? 1.6 * Math.cos((i * Math.PI) / 3) : 0),
        y: c + (i ? 1.6 * Math.sin((i * Math.PI) / 3) : 0),
        area: Math.PI * (i ? 1.5 : 1),
        signal: i ? 0.5 : 2,
        producer: i === 0,
        neighbors: 0,
        growthRate: 0,
      })),
      seed,
    };
  }
  function step(state, p) {
    validate(p);
    const s = structuredClone(state),
      cells = s.cells;
    const contacts = [],
      weights = cells.map(() => 0);
    for (let i = 0; i < cells.length; i++)
      for (let j = i + 1; j < cells.length; j++) {
        const distance = Math.hypot(
          cells[i].x - cells[j].x,
          cells[i].y - cells[j].y,
        );
        if (distance >= 3) continue;
        const weight = Math.min(1, 3 - distance);
        contacts.push({ i, j, weight });
        weights[i] += weight / cells[i].area;
        weights[j] += weight / cells[j].area;
      }
    const substeps = Math.max(
        1,
        Math.ceil(
          (p.step *
            (p.diffusion * Math.max(0, ...weights) + p.decay + p.growthMax)) /
            0.15,
        ),
      ),
      h = p.step / substeps;
    for (let k = 0; k < substeps; k++) {
      const changes = cells.map(() => 0),
        counts = cells.map(() => 0);
      for (const { i, j, weight } of contacts) {
        counts[i]++;
        counts[j]++;
        const flux = p.diffusion * weight * (cells[j].signal - cells[i].signal);
        changes[i] += flux / cells[i].area;
        changes[j] -= flux / cells[j].area;
      }
      cells.forEach((cell, i) => {
        cell.neighbors = counts[i];
        cell.growthRate = cell.producer ? 0 : growth(cell.signal, counts[i], p);
        cell.signal = Math.max(
          0,
          cell.signal +
            h *
              (changes[i] +
                (cell.producer ? p.production : 0) -
                p.decay * cell.signal -
                cell.growthRate * cell.signal),
        );
        cell.area *= Math.exp(h * cell.growthRate);
      });
    }
    const children = [];
    for (const cell of cells) {
      if (cell.producer || cell.area < 2 * Math.PI) continue;
      if (cells.length + children.length >= p.maxCells) {
        s.capacityReached = true;
        continue;
      }
      const angle = (s.seed + s.nextId) * 2.399963229728653,
        offset = Math.sqrt(cell.area / Math.PI) * 0.45;
      cell.area /= 2;
      const id = `cell:${s.nextId++}`;
      children.push({
        ...cell,
        id,
        parentId: cell.id,
        lineageId: cell.lineageId,
        x: cell.x + offset * Math.cos(angle),
        y: cell.y + offset * Math.sin(angle),
      });
      cell.x -= offset * Math.cos(angle);
      cell.y -= offset * Math.sin(angle);
      s.divisions++;
    }
    s.cells = cells.concat(children).filter((cell) => {
      if (cell.producer || cell.area > Math.PI / 2) return true;
      s.deaths++;
      return false;
    });
    for (let i = 0; i < s.cells.length; i++)
      for (let j = i + 1; j < s.cells.length; j++) {
        const a = s.cells[i],
          b = s.cells[j],
          dx = b.x - a.x,
          dy = b.y - a.y,
          d = Math.max(0.001, Math.hypot(dx, dy)),
          overlap =
            Math.sqrt(a.area / Math.PI) + Math.sqrt(b.area / Math.PI) - d;
        if (overlap <= 0) continue;
        const shift = Math.min(0.15, p.mechanicalRate * p.step * overlap);
        if (!a.producer) {
          a.x -= (shift * dx) / d;
          a.y -= (shift * dy) / d;
        }
        if (!b.producer) {
          b.x += (shift * dx) / d;
          b.y += (shift * dy) / d;
        }
      }
    const edge = p.size * p.spacing;
    s.cells.forEach((cell) => {
      const radius = Math.sqrt(cell.area / Math.PI);
      cell.x = Math.max(radius, Math.min(edge - radius, cell.x));
      cell.y = Math.max(radius, Math.min(edge - radius, cell.y));
      if (s.boundary !== null) cell.x = Math.min(s.boundary - radius, cell.x);
    });
    s.step++;
    s.time = s.step * p.step;
    return s;
  }
  function apply(state, action, p) {
    const s = structuredClone(state);
    if (action.kind === "remove") {
      const count = s.cells.length;
      s.cells = s.cells.filter(
        (c) => c.producer || Math.hypot(c.x - action.x, c.y - action.y) > 3,
      );
      s.removed += count - s.cells.length;
    } else if (action.kind === "source") {
      const cell = s.cells.find((c) => c.producer);
      if (!cell) throw Error("tissue_source_missing");
      cell.x = action.x;
      cell.y = action.y;
      s.source = [action.x, action.y];
    } else if (action.kind === "boundary") {
      if (action.x < 3) throw Error("tissue_boundary_too_narrow");
      s.boundary = action.x;
    } else throw Error("tissue_action_unsupported");
    return s;
  }
  function metrics(s) {
    return {
      cells: s.cells.length,
      divisions: s.divisions,
      removed: s.removed,
      area: s.cells.reduce((sum, c) => sum + c.area, 0),
      meanSignal:
        s.cells.reduce((sum, c) => sum + c.signal, 0) /
        Math.max(1, s.cells.length),
    };
  }
  return Object.freeze({ validate, growth, initial, step, apply, metrics });
});
