(function attachGridMetrics(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteGridMetrics = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createGridMetrics() {
  function summarize(snapshots) {
    const terminal = snapshots.at(-1);
    return deepFreeze({
      modeledUnservedEnergyMwh: sum(snapshots.flatMap((row) => row.regions), 'unservedMw'),
      modeledDemandResponseMwh: sum(snapshots.flatMap((row) => row.regions), 'demandResponseMw'),
      modeledEmissionsTons: sum(snapshots.flatMap((row) => row.regions), 'emissionsTons'),
      modeledStorageDischargeMwh: sum(snapshots.flatMap((row) => row.regions), 'storageDischargeMw'),
      minimumReserveMarginRatio: Math.min(...snapshots.flatMap((row) => row.regions).map((row) => row.reserveMarginRatio)),
      terminalRestoredTargetCount: terminal.restoredTargetIds.length,
      maximumInterfaceUtilizationRatio: Math.max(0, ...snapshots.flatMap((row) => row.interfaces).map((row) => row.utilizationRatio)),
    });
  }

  function summarizeEnsemble(runs) {
    const metrics = runs.map((row) => row.metrics);
    return deepFreeze(Object.fromEntries(Object.keys(metrics[0]).map((key) => {
      const values = metrics.map((row) => row[key]).filter(Number.isFinite).sort((a, b) => a - b);
      return [key, { minimum: values[0], median: quantile(values, 0.5), maximum: values.at(-1) }];
    })));
  }

  function quantile(values, fraction) {
    if (!values.length) return null;
    return values[Math.min(values.length - 1, Math.floor((values.length - 1) * fraction))];
  }

  function sum(rows, key) {
    return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({ summarize, summarizeEnsemble });
});
