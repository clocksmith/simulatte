(function attachInterstellarDatasetValidators(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.InterstellarDatasetValidators = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createInterstellarDatasetValidators() {
  const datasetValidators = Object.freeze({
    'simulatte.gaiaDr3NearbyStars.v2': (value) => {
      if (!Array.isArray(value?.stars) || value.stars.length < 2) throw new Error('nearby star catalog incomplete');
      value.stars.filter((row) => row.sourceId !== 'gaia-sol').forEach((row) => {
        if (!/^\d+$/.test(row.catalogSourceId || '') || !row.sourceRowId) {
          throw new Error(`gaia source row identity missing: ${row.sourceId}`);
        }
      });
      return value;
    },
    'simulatte.starCatalog.v1': (value) => {
      if (!Array.isArray(value?.stars) || value.stars.length < 1000 || value.count !== value.stars.length) {
        throw new Error('visible HYG star catalog incomplete');
      }
      value.stars.forEach((row) => {
        if (typeof row.id !== 'string'
          || !Number.isFinite(row.ra)
          || !Number.isFinite(row.dec)
          || !Number.isFinite(row.distancePc)
          || !Number.isFinite(row.magnitude)) {
          throw new Error(`visible HYG star row invalid: ${row?.id || 'unknown'}`);
        }
      });
      return value;
    },
    'simulatte.relayHardwareArchetypes.v2': (value) => {
      if (!value?.archetypes || !Object.keys(value.archetypes).length) throw new Error('relay hardware missing');
      return value;
    },
    'simulatte.interstellarScenarioNetwork.v2': (value) => {
      if (!Array.isArray(value?.scenarios) || !value.scenarios.length) throw new Error('relay scenarios missing');
      return value;
    },
    'simulatte.interstellarRelayModelCatalog.v1': (value) => {
      if (!Array.isArray(value?.models) || value.models.length < 4) throw new Error('relay model catalog incomplete');
      if (!Array.isArray(value.omissions) || value.omissions.length !== 7) throw new Error('relay model omission catalog incomplete');
      const omissionIds = new Set(value.omissions.map((row) => row.id));
      value.models.forEach((model) => (model.omissionIds || []).forEach((id) => {
        if (!omissionIds.has(id)) throw new Error(`relay model omission unresolved: ${model.id}:${id}`);
      }));
      [...(value.reliabilityScope?.conditionalOn || []), ...(value.reliabilityScope?.excludes || [])].forEach((id) => {
        if (!omissionIds.has(id)) throw new Error(`relay reliability omission unresolved: ${id}`);
      });
      return value;
    },
    'simulatte.interstellarOperationsModels.v1': (value) => {
      if (!Array.isArray(value?.profiles) || value.profiles.length < 3) {
        throw new Error('interstellar operations profiles incomplete');
      }
      const required = [
        'acquisitionMeanHours',
        'dutyCycle',
        'meanTimeBetweenFailuresHours',
        'meanRepairHours',
        'maintenanceIntervalHours',
        'maintenanceDurationHours',
        'retryLimit',
        'queueMeanDelayHours',
        'dustExtinctionMagPerPc',
        'plasmaLossDbPerPc',
        'detectorNoiseScale',
      ];
      value.profiles.forEach((profile) => required.forEach((key) => {
        if (!Number.isFinite(profile[key])) throw new Error(`interstellar operations parameter missing: ${profile.id}:${key}`);
      }));
      return value;
    },
    'simulatte.interstellarAdvancedChannels.v1': (value) => {
      const ids = new Set((value?.channels || []).map((row) => row.id));
      ['classical-optical', 'quantum-assisted', 'traversable-wormhole', 'alcubierre-warp'].forEach((id) => {
        if (!ids.has(id)) throw new Error(`interstellar advanced channel missing: ${id}`);
      });
      value.channels.forEach((channel) => {
        if (!channel.claimBoundary || !channel.truth?.origin || !channel.citations?.length) {
          throw new Error(`interstellar advanced channel governance incomplete: ${channel.id}`);
        }
      });
      return value;
    },
  });

  return Object.freeze({ datasetValidators });
});
