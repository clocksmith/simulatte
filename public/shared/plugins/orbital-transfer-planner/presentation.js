(function attachOrbitalPresentation(root, factory) {
  const api = factory();
  root.OrbitalTransferPresentation = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createOrbitalPresentationModule() {
  function createPresentation(ephemerisData, transferPlan = {}) {
    const selected = new Set(transferPlan.selectedBodyIds || []);
    const markers = [];
    const paths = [];
    Object.entries(ephemerisData?.bodies || {}).forEach(([id, body]) => {
      const currentPos = body.vectors?.[0]?.positionAu || [0, 0, 0];
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
      epoch: ephemerisData?.epochStart || '2030-09-15T00:00:00Z', markers, paths,
      actors: [], areas: [],
      cameraTargets: [
        { id: 'solar-system', label: 'Solar system', center: [0, 0, 0], distance: 35 },
        { id: 'earth', label: 'Earth', center: ephemerisData?.bodies?.earth?.vectors?.[0]?.positionAu || [1, 0, 0], distance: 3 },
      ],
    });
  }
  return Object.freeze({ createPresentation });
});
