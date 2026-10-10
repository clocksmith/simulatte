(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SimulatteFieldGrid = api;
})(globalThis, function () {
  function validate(p, keys) {
    if (
      !p ||
      typeof p !== "object" ||
      Object.keys(p).some((key) => !keys.includes(key)) ||
      keys.some((key) => !Object.hasOwn(p, key))
    )
      throw Error("field_parameters_contract_invalid");
    if (
      !Number.isInteger(p.size) ||
      p.size < 8 ||
      p.size > 96 ||
      !(p.step > 0) ||
      !(p.spacing > 0) ||
      Object.values(p).some((v) => !Number.isFinite(v))
    )
      throw Error("field_parameters_invalid");
  }
  function neighbors(i, n) {
    const x = i % n,
      y = Math.floor(i / n);
    return [
      x ? i - 1 : i,
      x < n - 1 ? i + 1 : i,
      y ? i - n : i,
      y < n - 1 ? i + n : i,
    ];
  }
  function laplacian(a, i, n, dx) {
    return neighbors(i, n).reduce((sum, j) => sum + a[j] - a[i], 0) / (dx * dx);
  }
  function sum(a) {
    return a.reduce((s, v) => s + v, 0);
  }
  function random(seed) {
    let value = Number(seed) >>> 0;
    return () => {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }
  function diffuse(a, n, dx, dt, d) {
    if ((dt * d) / (dx * dx) > 0.25)
      throw Error("field_diffusion_step_unstable");
    return a.map((v, i) => v + dt * d * laplacian(a, i, n, dx));
  }
  return Object.freeze({
    validate,
    neighbors,
    laplacian,
    sum,
    random,
    diffuse,
  });
});
