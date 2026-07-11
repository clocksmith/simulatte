(function attachSimulatteNetworkControlSolver(root, factory) {
  const values = typeof module === 'object' && module.exports
    ? require('./simulatte-solver-values.js')
    : root.SimulatteSolverValues;
  const api = factory(values);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteNetworkControlSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createNetworkControlSolverApi(values) {
  const { firstInput, firstOutput, scalar, finite, clamp } = values;
  return {
    id: 'network-control',
    operatorTypes: ['network_flow'],
    stateVariables: ['backlog', 'throughput', 'signalDelay'],
    supportedInteractions: ['demand', 'service', 'feedback'],
    stableDt: 0.05,
    step,
  };

  function step({ channels = {}, step: row = {}, dt = 0.016 }) {
    const backlogId = firstOutput(row, 'backlog') || firstInput(row, 'backlog');
    const throughputId = firstOutput(row, 'throughput') || firstInput(row, 'throughput');
    const delayId = firstInput(row, 'signalDelay');
    if (!backlogId || !throughputId) return;
    const demand = finite(row.params && row.params.demand, 0.45);
    const delay = delayId ? scalar(channels[delayId], 0.2) : 0.2;
    const previousThroughput = scalar(channels[throughputId], 0.4);
    const previousBacklog = scalar(channels[backlogId], 0.2);
    const throughput = clamp(previousThroughput + (demand - delay) * dt * 0.16, 0, 1);
    const backlog = clamp(previousBacklog + Math.max(0, demand - previousThroughput) * dt * 0.32, 0, 1);
    channels[throughputId] = throughput;
    channels[backlogId] = backlog;
  }

});
