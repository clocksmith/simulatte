(function attachOrbitalPresentation(root, factory) {
  const ephemerisApi=typeof module==='object'&&module.exports?require('./ephemeris.js'):root.OrbitalTransferEphemeris;
  const api = factory(ephemerisApi);
  root.OrbitalTransferPresentation = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createOrbitalPresentationModule(ephemerisApi) {
  function createPresentation(ephemerisData, transferPlan = {}) {
    const selected = new Set(transferPlan.selectedBodyIds || []);
    const markers = [];
    const paths = [];
    const ephemerisDay = Number(transferPlan.ephemerisDay || 0);
    Object.entries(ephemerisData?.bodies || {}).forEach(([id, body]) => {
      const currentPos = ephemerisApi.getBodyState(ephemerisData,id,ephemerisDay,{clamp:true}).positionAu;
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
  function epochForDay(dataset, day) {
    const start = Date.parse(dataset?.epochStart || dataset?.epoch?.start || '');
    return Number.isFinite(start)
      ? new Date(start + day * 86400000).toISOString()
      : dataset?.epochStart || '2030-09-15T00:00:00Z';
  }

  return Object.freeze({ createPresentation });
});
