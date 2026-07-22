(function attachMaritimePresentation(root, factory) {
  const api = factory();
  root.MaritimeTradePresentation = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMaritimePresentationModule() {
  function createPresentation(portsData, result) {
    const active = new Set([result.route.originPort, result.route.destinationPort]);
    const markers = (portsData?.ports || []).map((port) => ({
      id: port.id, position: [port.lon, port.lat, 0], label: port.name,
      tone: active.has(port.id) ? 'cyan' : 'blue', radius: active.has(port.id) ? 1.4 : 0.7,
    }));
    const paths = [{
      id: 'active-shipping-lane', label: result.route.name,
      coordinates: result.route.waypoints.map(([lon, lat]) => [lon, lat, 0]),
      tone: result.disruption.id === 'baseline' ? 'cyan' : 'amber', width: result.disruption.id === 'baseline' ? 2 : 4,
    }];
    const actors = [{
      id: 'modeled-vessel', position: result.route.waypoints[Math.floor(result.route.waypoints.length / 2)] || [0,0],
      label: `Modeled vessel — ${result.scenarioId}`, tone: 'green',
    }];
    return Object.freeze({
      schema: 'simulatte.pluginPresentation.v3', coordinateSystem: 'wgs84', epoch: '2026-07-21T00:00:00Z',
      markers, paths, actors, areas: [],
      cameraTargets: [
        { id: 'global-overview', label: 'Global maritime network', center: [0, 10, 0], distance: 230 },
        { id: 'active-corridor', label: result.route.name, center: center(result.route.waypoints), distance: 120 },
      ],
    });
  }
  function center(rows) { if (!rows.length) return [0,0,0]; return [rows.reduce((s,r)=>s+r[0],0)/rows.length, rows.reduce((s,r)=>s+r[1],0)/rows.length, 0]; }
  return Object.freeze({ createPresentation });
});
