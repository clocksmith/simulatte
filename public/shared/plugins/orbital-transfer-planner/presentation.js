(function attachOrbitalPresentation(root, factory) {
  const api = factory();
  root.OrbitalTransferPresentation = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createOrbitalPresentationModule() {
  function createPresentation(ephemerisData, transferPlan = {}) {
    const selected = new Set(transferPlan.selectedBodyIds || []);
    const markers = [];
    const paths = [];
    const ephemerisDay = Number(transferPlan.ephemerisDay || 0);
    Object.entries(ephemerisData?.bodies || {}).forEach(([id, body]) => {
      const currentPos = stateAtDay(body.vectors || [], ephemerisDay);
      markers.push({
        id, position: currentPos, label: body.name || id,
        tone: id === 'sun' ? 'amber' : selected.has(id) ? 'cyan' : 'muted',
        radius: id === 'sun' ? 0.12 : selected.has(id) ? 0.07 : 0.035,
      });
      const coordinates = (body.vectors || []).filter((_, index) => index % 5 === 0).map((row) => row.positionAu);
      if (coordinates.length >= 2) paths.push({ id: `orbit-${id}`, label: `${body.name || id} reference path`, coordinates, tone: 'muted', width: 1 });
    });
    if (Array.isArray(transferPlan.trajectory) && transferPlan.trajectory.length >= 2) {
      paths.push({ id: 'transfer-trajectory', label: 'Selected transfer chord', coordinates: transferPlan.trajectory, tone: 'cyan', width: 3 });
    }
    return Object.freeze({
      schema: 'simulatte.pluginPresentation.v3', coordinateSystem: 'heliocentric-ecliptic-au',
      epoch: epochForDay(ephemerisData, ephemerisDay), markers, paths,
      actors: transferPlan.actorPosition ? [{
        id: 'screening-spacecraft',
        position: transferPlan.actorPosition,
        label: `Modeled coast · ${Math.round((transferPlan.flightFraction || 0) * 100)}%`,
        tone: 'green',
        radius: 0.055,
      }] : [],
      areas: [],
      cameraTargets: [
        { id: 'solar-system', label: 'Solar system', center: [0, 0, 0], distance: 35 },
        { id: 'earth', label: 'Earth', center: ephemerisData?.bodies?.earth?.vectors?.[0]?.positionAu || [1, 0, 0], distance: 3 },
      ],
    });
  }
  function stateAtDay(vectors, day) {
    if (!vectors.length) return [0, 0, 0];
    const bounded = Math.max(Number(vectors[0].day || 0), Math.min(Number(vectors.at(-1).day), day));
    let lowerIndex = 0;
    for (let index = 1; index < vectors.length && Number(vectors[index].day) <= bounded; index += 1) lowerIndex = index;
    const lower = vectors[lowerIndex];
    const upper = vectors[Math.min(vectors.length - 1, lowerIndex + 1)];
    const lowerDay = Number(lower.day ?? lowerIndex);
    const upperDay = Number(upper.day ?? lowerIndex + 1);
    const ratio = upperDay === lowerDay ? 0 : (bounded - lowerDay) / (upperDay - lowerDay);
    return lower.positionAu.map((value, index) => value + (upper.positionAu[index] - value) * ratio);
  }

  function epochForDay(dataset, day) {
    const start = Date.parse(dataset?.epochStart || dataset?.epoch?.start || '');
    return Number.isFinite(start)
      ? new Date(start + day * 86400000).toISOString()
      : dataset?.epochStart || '2030-09-15T00:00:00Z';
  }

  return Object.freeze({ createPresentation });
});
