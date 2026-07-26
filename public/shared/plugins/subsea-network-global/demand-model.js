(function attachSubseaDemandModel(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSubseaDemandModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSubseaDemandModel() {
  function materializeDemands({ scenario, seed, essentialServiceWeight, ensembleMode = false }) {
    if (!scenario?.demands?.length) throw new Error('subsea_demand_scenario_empty');
    return deepFreeze(scenario.demands.map((row) => {
      const factor = ensembleMode ? 0.88 + 0.24 * seededUnit(`${seed}:${row.id}:demand`) : 1;
      return {
        ...row,
        requestedGbps: Number((row.requestedGbps * factor).toFixed(6)),
        weight: row.categoryId === 'essential' ? essentialServiceWeight : row.weight,
        truth: {
          origin: 'scenario',
          temporalStatus: 'forecast',
          uncertainty: {
            kind: 'distribution',
            value: {
              source: 'declared scenario seed set',
              calibrationStatus: 'not_calibrated_to_current_traffic',
            },
          },
        },
      };
    }));
  }

  function seededUnit(seed) {
    let state = 2166136261;
    for (let index = 0; index < seed.length; index += 1) {
      state ^= seed.charCodeAt(index);
      state = Math.imul(state, 16777619);
    }
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({ materializeDemands, seededUnit });
});
