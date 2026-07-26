(function attachHohmann(root, factory) {
  const api = factory();
  root.OrbitalTransferHohmann = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createHohmannModule() {
  // Hohmann transfer calculation between 2 circular orbits around Sun
  function computeHohmann(r1Au, r2Au, gmSunAuD2) {
    const aTransfer = (r1Au + r2Au) / 2;
    const v1 = Math.sqrt(gmSunAuD2 / r1Au);
    const v2 = Math.sqrt(gmSunAuD2 / r2Au);
    const vTrans1 = Math.sqrt(gmSunAuD2 * (2 / r1Au - 1 / aTransfer));
    const vTrans2 = Math.sqrt(gmSunAuD2 * (2 / r2Au - 1 / aTransfer));

    const dv1AuD = Math.abs(vTrans1 - v1);
    const dv2AuD = Math.abs(v2 - vTrans2);
    const totalDvAuD = dv1AuD + dv2AuD;

    // Convert AU/day to km/s (1 AU = 1.495978707e8 km, 1 day = 86400 s => 1 AU/day = 1731.4568 km/s)
    const auDayToKmS = 1731.4568;
    const timeOfFlightDays = Math.PI * Math.sqrt(Math.pow(aTransfer, 3) / gmSunAuD2);

    return {
      r1Au,
      r2Au,
      aTransferAu: aTransfer,
      timeOfFlightDays,
      dv1KmS: dv1AuD * auDayToKmS,
      dv2KmS: dv2AuD * auDayToKmS,
      totalDvKmS: totalDvAuD * auDayToKmS
    };
  }

  function createScreeningBaseline({ r1Au, r2Au, gmSunAuD2, trajectory, fallbackReason }) {
    const result = computeHohmann(r1Au, r2Au, gmSunAuD2);
    return Object.freeze({
      schema: 'simulatte.circularCoplanarHohmannScreeningBaseline.v2',
      method: 'circular_coplanar_hohmann_screening_baseline_v2',
      baselineType: 'circular_coplanar_screening_only',
      reason: fallbackReason,
      assumptions: Object.freeze([
        'circular heliocentric endpoint orbits',
        'coplanar impulsive burns',
        'two-body solar gravity',
        'no epoch-specific rendezvous geometry',
      ]),
      inputRadiiAu: Object.freeze({ departure: result.r1Au, arrival: result.r2Au }),
      timeOfFlightDays: result.timeOfFlightDays,
      totalDeltaVKmS: result.totalDvKmS,
      trajectory: Object.freeze((trajectory || []).map((row) => Object.freeze(row.slice()))),
      claimBoundary: 'Circular coplanar Hohmann screening baseline only; not an epoch-valid trajectory or fallback navigation solution.',
    });
  }

  return Object.freeze({ computeHohmann, createScreeningBaseline });
});
