(function attachMaritimePresentation(root, factory) {
  const api = factory();
  root.MaritimeTradePresentation = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMaritimePresentationModule() {
  function createPresentation(portsData, routePlan) {
    const markers = [];
    const paths = [];

    if (portsData?.ports) {
      portsData.ports.forEach((p) => {
        markers.push({
          id: p.id,
          position: [p.lat, p.lon],
          label: p.name,
          tone: 'blue'
        });
      });
    }

    if (routePlan?.waypoints) {
      paths.push({
        id: 'active-shipping-lane',
        coordinates: routePlan.waypoints,
        tone: 'cyan',
        width: 2
      });
    }

    return Object.freeze({
      schema: 'simulatte.pluginPresentation.v3',
      coordinateSystem: 'wgs84',
      epoch: '2026-07-21T00:00:00Z',
      markers,
      paths,
      actors: [],
      areas: [],
      cameraTargets: [
        { id: 'global-overview', center: [0, 0] },
        { id: 'singapore-hub', center: [1.264, 103.84] }
      ]
    });
  }

  return Object.freeze({ createPresentation });
});
