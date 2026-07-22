(function attachLightTime(root, factory) {
  const api = factory();
  root.InterstellarLightTime = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createLightTimeModule() {
  function computeOneWayLightTime(pos1Pc, pos2Pc, transmissionEpochIso = '2026-07-21T00:00:00Z') {
    const pcToMeters = 3.08567758149137e16;
    const lightSpeedMs = 299792458;

    const dx = pos2Pc[0] - pos1Pc[0];
    const dy = pos2Pc[1] - pos1Pc[1];
    const dz = pos2Pc[2] - pos1Pc[2];

    const distancePc = Math.hypot(dx, dy, dz);
    const distanceMeters = distancePc * pcToMeters;
    const latencySeconds = distanceMeters / lightSpeedMs;
    const latencyYears = latencySeconds / (86400 * 365.25);

    const txTime = new Date(transmissionEpochIso).getTime();
    const rxTime = txTime + Math.round(latencySeconds * 1000);

    return {
      transmissionEpochIso,
      arrivalEpochIso: new Date(rxTime).toISOString(),
      distancePc,
      distanceLy: distancePc * 3.26156,
      distanceMeters,
      latencySeconds,
      latencyYears,
      precision: 'finite_light_speed_c'
    };
  }

  return Object.freeze({ computeOneWayLightTime });
});
