(function attachGridOperatingSnapshot(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteGridOperatingSnapshot = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createGridOperatingSnapshot() {
  function materialize({ eiaDemand, eiaGeneration, topology, resources, storage }) {
    const respondentByRegion = new Map(topology.regions.map((row) => [row.id, row.respondent]));
    const demandByRespondent = group(eiaDemand.rows, (row) => row.respondent);
    const generationByKey = group(eiaGeneration.rows, (row) => `${row.respondent}:${row.period}`);
    const regions = topology.regions.map((region) => {
      const demandRows = [...(demandByRespondent.get(region.respondent) || [])].sort((a, b) => a.period.localeCompare(b.period));
      if (demandRows.length !== 24) throw gridError('grid_operating_snapshot_incomplete', `${region.respondent} requires 24 demand rows`);
      const peakDemandMw = Math.max(...demandRows.map((row) => row.value));
      return {
        ...region,
        peakDemandMw,
        hourly: demandRows.map((row, hour) => ({
          hour,
          period: row.period,
          demandMw: row.value,
          demandRowId: row.rowId,
          generationRows: generationByKey.get(`${region.respondent}:${row.period}`) || [],
        })),
        resources: resources.blocks.filter((row) => row.regionId === region.id).map((row) => ({
          ...row,
          capacityMw: round(peakDemandMw * row.capacityFractionOfPeakDemand),
        })),
        storage: storage.storage.filter((row) => row.regionId === region.id).map((row) => {
          const powerCapacityMw = round(peakDemandMw * row.powerFractionOfPeakDemand);
          return {
            ...row,
            powerCapacityMw,
            energyCapacityMwh: round(powerCapacityMw * row.durationHours),
            initialStateOfChargeMwh: round(powerCapacityMw * row.durationHours * row.initialStateOfChargeFraction),
          };
        }),
      };
    });
    return deepFreeze({
      schema: 'simulatte.gridOperatingSnapshot.v1',
      regions,
      interfaces: topology.interfaces,
      respondentByRegion: Object.fromEntries(respondentByRegion),
      startPeriod: regions[0].hourly[0].period,
      durationHours: 24,
    });
  }

  function group(rows, key) {
    const result = new Map();
    rows.forEach((row) => {
      const id = key(row);
      if (!result.has(id)) result.set(id, []);
      result.get(id).push(row);
    });
    return result;
  }

  function round(value) {
    return Math.round(value * 1e6) / 1e6;
  }

  function gridError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.code = code;
    return error;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({ materialize });
});
