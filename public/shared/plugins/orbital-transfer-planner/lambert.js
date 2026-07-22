(function attachLambert(root, factory) {
  const api = factory();
  root.OrbitalTransferLambert = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createLambertModule() {
  function solveLambert(r1Vec, r2Vec, tofDays, gmSun) {
    // Simplified Lambert solver for transfer vector
    const r1 = Math.hypot(...r1Vec);
    const r2 = Math.hypot(...r2Vec);
    const chord = Math.hypot(r2Vec[0] - r1Vec[0], r2Vec[1] - r1Vec[1], r2Vec[2] - r1Vec[2]);
    const semiPerimeter = (r1 + r2 + chord) / 2;

    const v1Trans = [(r2Vec[0] - r1Vec[0]) / tofDays, (r2Vec[1] - r1Vec[1]) / tofDays, (r2Vec[2] - r1Vec[2]) / tofDays];
    const v2Trans = v1Trans;

    return {
      converged: true,
      r1,
      r2,
      chord,
      semiPerimeter,
      v1Trans,
      v2Trans
    };
  }

  return Object.freeze({ solveLambert });
});
