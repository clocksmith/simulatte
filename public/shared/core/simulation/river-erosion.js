(function (root, factory) {
  const grid =
    typeof module === "object" && module.exports
      ? require("./field-grid.js")
      : root.SimulatteFieldGrid;
  const api = factory(grid);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SimulatteRiverErosion = api;
})(globalThis, function (grid) {
  const KEYS = [
    "size",
    "spacing",
    "step",
    "rainRate",
    "conductivity",
    "erosionRate",
    "depositionRate",
    "capacity",
    "terrainTimeScale",
    "slope",
  ];
  function validate(p) {
    grid.validate(p, KEYS);
    if (
      p.step > 1 ||
      p.rainRate < 0 ||
      p.conductivity < 0 ||
      p.erosionRate < 0 ||
      p.depositionRate < 0 ||
      p.capacity < 0 ||
      p.terrainTimeScale < 1 ||
      p.terrainTimeScale > 10000 ||
      p.slope < 0
    )
      throw Error("river_parameters_invalid");
  }
  function initial(p, seed) {
    validate(p);
    const random = grid.random(seed),
      height = Array.from(
        { length: p.size * p.size },
        (_, i) =>
          2 +
          p.slope * (p.size - 1 - Math.floor(i / p.size)) * p.spacing +
          0.04 * random(),
      );
    return {
      step: 0,
      time: 0,
      height,
      water: height.map(() => 0),
      sediment: height.map(() => 0),
      rainCenter: [p.size / 2, p.size / 4],
      rainInput: 0,
      waterExport: 0,
      sedimentExport: 0,
      terrainEdits: 0,
      initialTerrain: grid.sum(height) * p.spacing ** 2,
    };
  }
  function step(state, p) {
    validate(p);
    const s = structuredClone(state),
      n = p.size,
      area = p.spacing ** 2,
      water = s.water,
      sediment = s.sediment,
      height = state.height,
      delta = water.map(() => 0),
      sd = water.map(() => 0);
    let erosion = 0,
      deposition = 0;
    for (let i = 0; i < water.length; i++) {
      const rain =
        p.rainRate *
        p.step *
        Math.exp(
          -(
            ((i % n) - s.rainCenter[0]) ** 2 +
            (Math.floor(i / n) - s.rainCenter[1]) ** 2
          ) /
            ((n * n) / 8),
        );
      water[i] += rain;
      s.rainInput += rain * area;
    }
    for (let i = 0; i < water.length; i++) {
      const surface = height[i] + water[i];
      const targets = grid
        .neighbors(i, n)
        .filter((j) => j !== i && surface > height[j] + water[j]);
      const slopes = targets.map(
          (j) => (surface - height[j] - water[j]) / p.spacing,
        ),
        raw = slopes.map(
          (slope) => (p.conductivity * water[i] * slope * p.step) / p.spacing,
        );
      const edge = Math.floor(i / n) === n - 1;
      const outlet = edge
        ? (p.conductivity * water[i] * p.step) / p.spacing
        : 0;
      const total = grid.sum(raw) + outlet,
        scale = total > water[i] ? water[i] / total : 1;
      targets.forEach((j, k) => {
        const transfer = raw[k] * scale,
          load = water[i] > 0 ? (sediment[i] * transfer) / water[i] : 0;
        delta[i] -= transfer;
        delta[j] += transfer;
        sd[i] -= load;
        sd[j] += load;
      });
      const exported = outlet * scale,
        load = water[i] > 0 ? (sediment[i] * exported) / water[i] : 0;
      delta[i] -= exported;
      sd[i] -= load;
      s.waterExport += exported * area;
      s.sedimentExport += load * area;
      const carrying =
          p.capacity *
          ((grid.sum(raw) * scale) / p.step) *
          Math.max(0, ...slopes),
        morphDt = p.step * p.terrainTimeScale;
      if (sediment[i] < carrying) {
        const amount = Math.min(
          s.height[i],
          (carrying - sediment[i]) * p.erosionRate * morphDt,
        );
        s.height[i] -= amount;
        sd[i] += amount;
        erosion += amount * area;
      } else {
        const amount = Math.min(
          Math.max(0, sediment[i] + sd[i]),
          (sediment[i] - carrying) * p.depositionRate * morphDt,
        );
        s.height[i] += amount;
        sd[i] -= amount;
        deposition += amount * area;
      }
    }
    s.water = water.map((v, i) => Math.max(0, v + delta[i]));
    s.sediment = sediment.map((v, i) => Math.max(0, v + sd[i]));
    s.lastErosion = erosion;
    s.lastDeposition = deposition;
    s.step++;
    s.time = s.step * p.step;
    return s;
  }
  function apply(state, action, p) {
    const s = structuredClone(state);
    if (action.kind === "rain")
      s.rainCenter = [action.x / p.spacing, action.y / p.spacing];
    else if (["channel", "ridge"].includes(action.kind)) {
      const delta = action.kind === "channel" ? -0.35 : 0.35;
      for (let i = 0; i < s.height.length; i++) {
        const dx = (i % p.size) * p.spacing - action.x;
        const dy = Math.floor(i / p.size) * p.spacing - action.y;
        // A channel runs downhill; a ridge crosses that direction.
        const across = action.kind === "channel" ? dx : dy;
        const along = action.kind === "channel" ? dy : dx;
        if (Math.abs(across) > p.spacing || Math.abs(along) > 5 * p.spacing)
          continue;
        const actual = Math.max(0, s.height[i] + delta) - s.height[i];
        s.height[i] += actual;
        s.terrainEdits += actual * p.spacing ** 2;
      }
    } else throw Error("river_action_unsupported");
    return s;
  }
  function metrics(s, p) {
    const water = grid.sum(s.water) * p.spacing ** 2,
      sediment = grid.sum(s.sediment) * p.spacing ** 2,
      terrain = grid.sum(s.height) * p.spacing ** 2;
    return {
      water,
      sediment,
      terrain,
      waterExport: s.waterExport,
      sedimentExport: s.sedimentExport,
      waterResidual: water + s.waterExport - s.rainInput,
      sedimentResidual:
        terrain +
        sediment +
        s.sedimentExport -
        s.initialTerrain -
        s.terrainEdits,
    };
  }
  return Object.freeze({ validate, initial, step, apply, metrics });
});
