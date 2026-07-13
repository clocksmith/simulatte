(function attachSimulatteSolverValues(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSolverValues = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSolverValuesApi() {
  const TAU = Math.PI * 2;

  function firstInput(step, prefix) {
    return firstMatching(step.inputs || step.reads || [], prefix);
  }

  function firstOutput(step, prefix) {
    return firstMatching(step.outputs || step.writes || [], prefix);
  }

  function lastOutput(step, prefix) {
    const values = (step.outputs || step.writes || [])
      .filter((id) => id.startsWith(`${prefix}:`));
    return values[values.length - 1] || '';
  }

  function firstMatching(values, prefix) {
    return (values || []).find((id) => id.startsWith(`${prefix}:`)) || '';
  }

  function vector(value, fallback) {
    if (value && typeof value === 'object') {
      return { x: finite(value.x, fallback.x), y: finite(value.y, fallback.y) };
    }
    return { ...fallback };
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

  function wrapAngle(angle) {
    const wrapped = angle % TAU;
    return wrapped < 0 ? wrapped + TAU : wrapped;
  }

  return Object.freeze({
    firstInput,
    firstOutput,
    lastOutput,
    firstMatching,
    vector,
    scalar,
    finite,
    clamp,
    wrapAngle,
  });
});
