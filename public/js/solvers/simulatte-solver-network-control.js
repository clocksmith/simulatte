(function attachSimulatteNetworkControlSolver(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteNetworkControlSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createNetworkControlSolverApi() {
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
    const throughput = clamp(scalar(channels[throughputId], 0.4) + (demand - delay) * dt * 0.16, 0, 1);
    const backlog = clamp(scalar(channels[backlogId], 0.2) + (demand - throughput) * dt * 0.32, 0, 1);
    channels[throughputId] = throughput;
    channels[backlogId] = backlog;
  }

  function firstInput(step, prefix) {
    return firstMatching(step.inputs || step.reads || [], prefix);
  }

  function firstOutput(step, prefix) {
    return firstMatching(step.outputs || step.writes || [], prefix);
  }

  function firstMatching(values, prefix) {
    return (values || []).find((id) => id.startsWith(`${prefix}:`)) || '';
  }

  function scalar(value, fallback) {
    return finite(value, fallback);
  }

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
});
