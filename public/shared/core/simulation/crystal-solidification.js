(function (root, factory) {
  const grid =
    typeof module === "object" && module.exports
      ? require("./field-grid.js")
      : root.SimulatteFieldGrid;
  const api = factory(grid);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SimulatteCrystalSolidification = api;
})(globalThis, function (grid) {
  const KEYS = [
    "size",
    "spacing",
    "step",
    "thermalDiffusion",
    "alpha",
    "anisotropy",
    "symmetry",
    "tau",
    "kappa1",
    "kappa2",
    "undercooling",
    "seedRadius",
  ];
  function validate(p) {
    grid.validate(p, KEYS);
    if (
      (p.step * p.thermalDiffusion) / p.spacing ** 2 > 0.24 ||
      p.step / p.tau > 0.25 ||
      (p.step * p.alpha ** 2 * (1 + Math.abs(p.anisotropy)) ** 2) /
        (p.tau * p.spacing ** 2) >
        0.24 ||
      p.kappa1 <= 0 ||
      p.kappa1 > 2 ||
      p.kappa2 <= 0 ||
      Math.abs(p.undercooling) > 2 ||
      p.thermalDiffusion < 0 ||
      p.alpha <= 0 ||
      Math.abs(p.anisotropy) > 0.08 ||
      !Number.isInteger(p.symmetry) ||
      p.symmetry < 2 ||
      p.symmetry > 8 ||
      p.tau <= 0 ||
      p.seedRadius <= 0
    )
      throw Error("crystal_parameters_unstable");
  }
  function initial(p, seed) {
    validate(p);
    const n = p.size;
    const seeds = [
      {
        id: "grain:0",
        x: n * p.spacing * 0.35,
        y: n * p.spacing * 0.5,
        orientation: Math.PI / 8,
      },
      {
        id: "grain:1",
        x: n * p.spacing * 0.68,
        y: n * p.spacing * 0.5,
        orientation: Math.PI / 3,
      },
    ];
    const s = {
      step: 0,
      time: 0,
      seeds,
      phase: Array(n * n).fill(0),
      temperature: Array(n * n).fill(p.undercooling),
      grain: Array(n * n).fill(0),
      heatInput: 0,
      limitedFluxes: 0,
      seed,
    };
    assign(s, p, true);
    s.initialEnthalpy = grid.sum(s.temperature) - grid.sum(s.phase);
    return s;
  }
  function assign(s, p, seedPhase) {
    for (let i = 0; i < s.phase.length; i++) {
      if (!seedPhase && s.phase[i] > 0.5) continue;
      const x = ((i % p.size) + 0.5) * p.spacing,
        y = (Math.floor(i / p.size) + 0.5) * p.spacing;
      let distance = Infinity,
        index = 0;
      s.seeds.forEach((seed, k) => {
        const d = Math.hypot(x - seed.x, y - seed.y);
        if (d < distance) {
          distance = d;
          index = k;
        }
      });
      s.grain[i] = index;
      if (seedPhase && distance < p.seedRadius) s.phase[i] = 1;
    }
  }
  function step(state, p) {
    validate(p);
    const s = structuredClone(state),
      n = p.size,
      dx = p.spacing,
      phi = state.phase,
      flux = phi.map(() => 0),
      transfers = [],
      incoming = phi.map(() => 0),
      outgoing = phi.map(() => 0);
    function tensor(gx, gy, orientation) {
      const angle = orientation + Math.atan2(gy, gx),
        beta = Math.cos(p.symmetry * angle),
        derivative = -p.symmetry * Math.sin(p.symmetry * angle),
        base = p.alpha ** 2 * (1 + p.anisotropy * beta);
      return {
        diagonal: base * (1 + p.anisotropy * beta),
        off: base * p.anisotropy * derivative,
      };
    }
    const gradient = (i) => {
      const [l, r, u, d] = grid.neighbors(i, n);
      return [(phi[r] - phi[l]) / (2 * dx), (phi[d] - phi[u]) / (2 * dx)];
    };
    for (let i = 0; i < phi.length; i++)
      for (const [j, axis] of [
        [i % n < n - 1 ? i + 1 : i, 0],
        [Math.floor(i / n) < n - 1 ? i + n : i, 1],
      ]) {
        if (j === i) continue;
        const ga = gradient(i),
          gb = gradient(j),
          gx = axis === 0 ? (phi[j] - phi[i]) / dx : (ga[0] + gb[0]) / 2,
          gy = axis === 1 ? (phi[j] - phi[i]) / dx : (ga[1] + gb[1]) / 2;
        const a = tensor(gx, gy, state.seeds[state.grain[i]].orientation),
          b = tensor(gx, gy, state.seeds[state.grain[j]].orientation);
        const diagonal = (a.diagonal + b.diagonal) / 2,
          off = (a.off + b.off) / 2;
        const f =
          (axis === 0 ? diagonal * gx - off * gy : off * gx + diagonal * gy) /
          dx;
        const amount = (Math.abs(f) * p.step) / p.tau;
        const from = f >= 0 ? j : i,
          to = f >= 0 ? i : j;
        transfers.push({ from, to, amount });
        incoming[to] += amount;
        outgoing[from] += amount;
      }
    // Limit pair transfers by donor mass and receiving capacity. Unlike
    // clipping a completed update, this preserves the conservative face flux.
    for (const { from, to, amount } of transfers) {
      const scale = Math.min(
        1,
        outgoing[from] ? phi[from] / outgoing[from] : 1,
        incoming[to] ? (1 - phi[to]) / incoming[to] : 1,
      );
      if (scale < 1 && amount > 1e-14) s.limitedFluxes++;
      const transferred = amount * Math.max(0, scale);
      flux[from] -= transferred;
      flux[to] += transferred;
    }
    s.phase = phi.map((v, i) => {
      const diffused = v + flux[i];
      const driving =
        diffused -
        0.5 -
        (p.kappa1 / Math.PI) * Math.atan(p.kappa2 * state.temperature[i]);
      const next =
        diffused + (p.step / p.tau) * diffused * (1 - diffused) * driving;
      if (next < -1e-12 || next > 1 + 1e-12 || !Number.isFinite(next))
        throw Error("crystal_phase_bounds_violated");
      // Only roundoff at the endpoints is removed; the operator stays bounded.
      return Math.max(0, Math.min(1, next));
    });
    s.temperature = grid
      .diffuse(state.temperature, n, dx, p.step, p.thermalDiffusion)
      .map((v, i) => v + s.phase[i] - phi[i]);
    s.step++;
    s.time = s.step * p.step;
    assign(s, p, false);
    return s;
  }
  function apply(state, action, p) {
    const s = structuredClone(state);
    if (action.kind === "seed") {
      s.seeds.push({
        id: `grain:${s.seeds.length}`,
        x: action.x,
        y: action.y,
        orientation: action.orientation,
      });
      const old = grid.sum(s.phase);
      assign(s, p, true);
      const added = grid.sum(s.phase) - old;
      s.initialEnthalpy -= added;
    } else if (action.kind === "rotate") {
      const index = action.grainId;
      if (!s.seeds[index]) throw Error("crystal_grain_missing");
      s.seeds[index].orientation += Math.PI / 6;
    } else if (action.kind === "thermal") {
      for (let i = 0; i < s.temperature.length; i++) {
        if (
          Math.abs(((i % p.size) + 0.5) * p.spacing - action.x) >
          p.spacing * 2
        )
          continue;
        const delta = action.temperature - s.temperature[i];
        s.temperature[i] = action.temperature;
        s.heatInput += delta;
      }
    } else throw Error("crystal_action_unsupported");
    return s;
  }
  function metrics(s, p) {
    const solid = grid.sum(s.phase);
    return {
      solidArea: solid * p.spacing ** 2,
      solidFraction: solid / s.phase.length,
      meanTemperature: grid.sum(s.temperature) / s.temperature.length,
      enthalpyResidual:
        (grid.sum(s.temperature) - solid - s.initialEnthalpy - s.heatInput) *
        p.spacing ** 2,
      limitedFluxes: s.limitedFluxes,
    };
  }
  return Object.freeze({ validate, initial, step, apply, metrics });
});
