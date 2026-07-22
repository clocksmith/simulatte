(function attachMaritimeRouting(root, factory) {
  const api = factory();
  root.MaritimeTradeRouting = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMaritimeRoutingModule() {
  function computeRoute(lanesDataset, vesselClassesDataset, corridorId, vesselClassId) {
    const corridor = lanesDataset?.corridors?.find((c) => c.id === corridorId) || lanesDataset?.corridors?.[0];
    const vesselClass = vesselClassesDataset?.classes?.[vesselClassId] || vesselClassesDataset?.classes?.['ultra-large-container-v1'];

    const distanceNm = corridor?.distanceNm || 10500;
    const speedKnots = vesselClass?.designSpeedKnots || 20;
    const transitDays = distanceNm / (speedKnots * 24);

    const fuelTonsDay = vesselClass?.fuelConsTonsDay || 150;
    const totalFuelTons = transitDays * fuelTonsDay;
    const totalCo2Tons = distanceNm * (vesselClass?.co2TonsPerNm || 0.04);

    return {
      corridorId: corridor?.id,
      name: corridor?.name,
      distanceNm,
      transitDays,
      speedKnots,
      totalFuelTons,
      totalCo2Tons,
      waypoints: corridor?.waypoints || []
    };
  }

  return Object.freeze({ computeRoute });
});
