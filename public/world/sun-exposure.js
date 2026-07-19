(function attachSunExposureCompatibility(root, factory) {
  const sun = typeof module === 'object' && module.exports
    ? require('../plugins/sun-walker/sun-exposure.js')
    : root.SimulatteSunExposure;
  const routePlanner = typeof module === 'object' && module.exports
    ? require('./route-planner.js')
    : root.SimulatteAutonomyRoutePlanner;
  const api = factory(sun, routePlanner);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSunExposure = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSunExposureCompatibility(sun, routePlanner) {
  return Object.freeze({
    ...sun,
    selectShadeAwareRoute(args) {
      return sun.selectShadeAwareRoute({ ...args, routeAlternatives: routePlanner.planRouteAlternatives });
    },
  });
});
