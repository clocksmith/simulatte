(function attachPluginCompute(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginCompute = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPluginComputeModule() {
  // Worker-backed ensemble execution.
  //
  // The purpose is to run replicate simulations off the UI thread and reduce them into
  // percentile summaries. Plugin code cannot mint its own Worker (the boundary check
  // forbids DOM/host APIs), so the host owns any real worker pool and injects it here.
  // When no pool is available the port runs replicates cooperatively on the current
  // realm, yielding between replicates so long ensembles do not block a frame. Results
  // are identical either way, because each replicate is driven by a named RNG stream
  // keyed by its replicate index rather than by wall-clock or execution order.
  const SCHEMA = 'simulatte.computePort.v1';

  function percentile(sortedValues, fraction) {
    if (!sortedValues.length) return null;
    const position = fraction * (sortedValues.length - 1);
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sortedValues[lower];
    const weight = position - lower;
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }

  function summarize(values) {
    const numeric = values.filter((value) => Number.isFinite(value));
    if (!numeric.length) return Object.freeze({ count: 0, mean: null, median: null, p05: null, p95: null, standardError: null });
    const sorted = numeric.slice().sort((a, b) => a - b);
    const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
    const variance = sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, sorted.length - 1);
    return Object.freeze({
      count: sorted.length,
      mean: Number(mean.toFixed(6)),
      median: percentile(sorted, 0.5),
      p05: percentile(sorted, 0.05),
      p95: percentile(sorted, 0.95),
      standardError: Number(Math.sqrt(variance / sorted.length).toFixed(6)),
    });
  }

  function createComputePort({ workerPool = null, yieldEvery = 16 } = {}) {
    const mode = workerPool ? 'worker-pool' : 'cooperative-inline';

    function forPlugin(pluginId) {
      return Object.freeze({
        schema: SCHEMA,
        mode,
        // simulate(replicateIndex) -> object of named finite metrics.
        async runEnsemble({ replicates, simulate, metrics = null } = {}) {
          if (!Number.isInteger(replicates) || replicates < 1) throw computeError('compute_replicates_invalid', `Plugin ${pluginId} ensemble expected replicates >= 1, received ${replicates}`);
          if (typeof simulate !== 'function') throw computeError('compute_simulate_invalid', `Plugin ${pluginId} ensemble expected a simulate function`);
          const rows = [];
          if (workerPool && typeof workerPool.map === 'function') {
            const mapped = await workerPool.map(replicates, simulate);
            mapped.forEach((row) => rows.push(row));
          } else {
            for (let index = 0; index < replicates; index += 1) {
              rows.push(await simulate(index));
              if (index % yieldEvery === yieldEvery - 1) await Promise.resolve();
            }
          }
          const metricKeys = metrics || (rows.length ? Object.keys(rows[0]).filter((key) => Number.isFinite(rows[0][key])) : []);
          const summaries = {};
          metricKeys.forEach((key) => { summaries[key] = summarize(rows.map((row) => row[key])); });
          return Object.freeze({
            schema: 'simulatte.ensembleResult.v1',
            pluginId,
            replicates,
            mode,
            metrics: Object.freeze(summaries),
            replicateRows: Object.freeze(rows.map((row) => Object.freeze({ ...row }))),
          });
        },
        async map(items, mapper) {
          const output = [];
          for (let index = 0; index < items.length; index += 1) {
            output.push(await mapper(items[index], index));
            if (index % yieldEvery === yieldEvery - 1) await Promise.resolve();
          }
          return output;
        },
      });
    }
    return Object.freeze({ mode, summarize, forPlugin });
  }

  function computeError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulattePluginComputeError';
    error.code = code;
    return error;
  }

  return { SCHEMA, createComputePort, summarize, percentile };
});
