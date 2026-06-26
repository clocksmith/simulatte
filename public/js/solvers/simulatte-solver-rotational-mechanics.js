(function attachSimulatteRotationalMechanicsSolver(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteRotationalMechanicsSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRotationalMechanicsSolverApi() {
  return {
    id: 'rotational-mechanics',
    operatorTypes: ['rotational_torque'],
    stateVariables: ['angularVelocity', 'angle', 'torque'],
    supportedInteractions: ['fluidForce', 'torqueTransfer'],
    stableDt: 0.05,
  };
});
