(function attachSubseaMetrics(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSubseaMetrics = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSubseaMetrics() {
  const METRIC_SCHEMA = Object.freeze([
    'requestedGbps',
    'deliveredGbps',
    'droppedGbps',
    'deliveredFraction',
    'essentialDeliveredFraction',
    'weightedMeanLatencyMs',
    'maximumUtilizationRatio',
    'jainServiceFairness',
    'restorationHours',
  ]);

  function computeMetrics(allocation, restorationHours = 0) {
    const requestedGbps = sum(allocation.demands, 'requestedGbps');
    const deliveredGbps = sum(allocation.demands, 'deliveredGbps');
    const droppedGbps = sum(allocation.demands, 'droppedGbps');
    const essential = allocation.demands.filter((row) => row.categoryId === 'essential');
    const essentialRequested = sum(essential, 'requestedGbps');
    const serviceRatios = allocation.demands.map((row) => row.requestedGbps ? row.deliveredGbps / row.requestedGbps : 1);
    const latencyNumerator = allocation.demands.reduce(
      (total, row) => total + (row.latencyMs || 0) * row.deliveredGbps,
      0
    );
    const values = {
      requestedGbps,
      deliveredGbps,
      droppedGbps,
      deliveredFraction: ratio(deliveredGbps, requestedGbps),
      essentialDeliveredFraction: ratio(sum(essential, 'deliveredGbps'), essentialRequested),
      weightedMeanLatencyMs: ratio(latencyNumerator, deliveredGbps),
      maximumUtilizationRatio: Math.max(0, ...allocation.edges.map((row) => row.utilizationRatio)),
      jainServiceFairness: jain(serviceRatios),
      restorationHours,
    };
    return Object.freeze(Object.fromEntries(METRIC_SCHEMA.map((key) => [key, clean(values[key])])));
  }

  function summarizeEnsemble(runs) {
    return Object.freeze({
      schema: 'simulatte.subseaEnsembleSummary.v1',
      replicateCount: runs.length,
      interpretation: 'scenario variance from declared seed set; not a calibrated confidence interval',
      distributions: Object.fromEntries(METRIC_SCHEMA.map((metricId) => [
        metricId,
        quantiles(runs.map((run) => run.metrics[metricId])),
      ])),
    });
  }

  function quantiles(values) {
    const sorted = [...values].sort((left, right) => left - right);
    return {
      minimum: sorted[0],
      p05: percentile(sorted, 0.05),
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      maximum: sorted.at(-1),
    };
  }

  function percentile(sorted, probability) {
    if (!sorted.length) return null;
    const position = (sorted.length - 1) * probability;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    const value = sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
    return clean(value);
  }

  function jain(values) {
    if (!values.length) return 1;
    const total = values.reduce((sumValue, value) => sumValue + value, 0);
    const squares = values.reduce((sumValue, value) => sumValue + value * value, 0);
    return squares ? (total * total) / (values.length * squares) : 1;
  }

  function sum(rows, key) {
    return rows.reduce((total, row) => total + row[key], 0);
  }

  function ratio(numerator, denominator) {
    return denominator ? numerator / denominator : 0;
  }

  function clean(value) {
    return Number(Number(value).toFixed(9));
  }

  return Object.freeze({ METRIC_SCHEMA, computeMetrics, summarizeEnsemble });
});
