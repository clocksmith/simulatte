(function attachOrbitalPresentation(root, factory) {
  const api = factory();
  root.OrbitalTransferPresentation = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createOrbitalPresentationModule() {
  function createPresentation(ephemerisData, transferPlan) {
    const markers = [];
    const paths = [];

    // Add planetary markers & orbits
    if (ephemerisData?.bodies) {
      Object.entries(ephemerisData.bodies).forEach(([id, body]) => {
        const currentPos = body.vectors?.[0]?.positionAu || [0, 0, 0];
        markers.push({
          id,
          position: currentPos,
          label: body.name,
          tone: id === 'sun' ? 'amber' : id === 'earth' ? 'blue' : id === 'mars' ? 'red' : 'green'
        });
        const orbitCoords = (body.vectors || []).map((v) => v.positionAu);
        if (orbitCoords.length > 0) {
          paths.push({
            id: `orbit-${id}`,
            coordinates: orbitCoords,
            tone: 'muted',
            width: 1
          });
        }
      });
    }

    // Add transfer trajectory if calculated
    if (transferPlan?.trajectory) {
      paths.push({
        id: 'transfer-trajectory',
        coordinates: transferPlan.trajectory,
        tone: 'cyan',
        width: 2
      });
    }

    return Object.freeze({
      schema: 'simulatte.pluginPresentation.v3',
      coordinateSystem: 'heliocentric-ecliptic-au',
      epoch: '2030-09-15T00:00:00Z',
      markers,
      paths,
      actors: [],
      areas: [],
      cameraTargets: [
        { id: 'sun', center: [0, 0, 0] },
        { id: 'earth', center: ephemerisData?.bodies?.earth?.vectors?.[0]?.positionAu || [1, 0, 0] }
      ]
    });
  }

  return Object.freeze({ createPresentation });
});
