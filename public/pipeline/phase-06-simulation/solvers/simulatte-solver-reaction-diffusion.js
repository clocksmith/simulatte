(function attachSimulatteReactionDiffusionSolver(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteReactionDiffusionSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createReactionDiffusionSolverApi() {
  return {
    id: 'reaction-diffusion',
    operatorTypes: ['reaction_diffusion'],
    stateVariables: ['reactionProgress', 'temperature'],
    supportedInteractions: ['reaction', 'frontPropagation'],
    stableDt: 0.05,
    step,
  };

  function step({ channels = {}, step: row = {}, dt = 0.016 }) {
    const out = firstOutput(row, 'reactionProgress') || firstInput(row, 'reactionProgress');
    if (!out) return;
    const rate = finite(row.params && row.params.rate, 0.4);
    const value = scalar(channels[out], 0);
    channels[out] = clamp(value + value * (1 - value) * rate * dt + 0.01 * dt, 0, 1);
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
