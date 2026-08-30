(function attachInterstellarRelayControls(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.InterstellarRelayControls = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createInterstellarRelayControls() {
  function resolveScenario(dataset, id) {
    const aliases = {
      'sol-alpha-centauri-relay': 'sol-proxima-barnard-relay',
      'nearest-ten-star-store-forward': 'nearby-star-store-forward',
      'sirius-high-power-link': '61-cygni-high-power-link',
    };
    const wanted = aliases[id] || id;
    const found = dataset.scenarios?.find((row) => row.id === wanted);
    if (!found) throw new Error(`interstellar_scenario_missing: ${wanted}`);
    return found;
  }

  function normalizeScenario(value, config) {
    if (typeof value === 'string') return Object.freeze({ id: value, seed: value });
    const id = value?.scenarioId || value?.id || config?.defaultScenarioId || 'sol-proxima-direct';
    return Object.freeze({ ...value, id, seed: value?.seed || id });
  }

  function resolveControls({
    config,
    scenario,
    values,
    hardwareData,
    starsData,
    operationsData,
    advancedData,
  }) {
    const starIds = new Set(starsData.stars.map((row) => row.sourceId));
    const hardwareIds = new Set(Object.keys(hardwareData.archetypes));
    const operationsProfileId = String(values.operationsProfileId || config.defaultOperationsProfileId);
    const operationsProfile = operationsData.profiles.find((row) => row.id === operationsProfileId);
    if (!operationsProfile) throw controlError('interstellar_operations_profile_missing', operationsProfileId);
    const channelMode = String(values.channelMode || config.defaultChannelMode);
    if (!advancedData.channels.some((row) => row.id === channelMode)) {
      throw controlError('interstellar_channel_mode_missing', channelMode);
    }
    const scenarioRelays = scenario.relayHops.slice(1, -1);
    const eligibleDefault = starsData.defaultRelayIds || starsData.stars.map((row) => row.sourceId);
    const startEpochIso = normalizeEpoch(values.startEpochIso || config.startEpochIso);
    const controls = {
      startEpochIso,
      astrometryEpochYear: decimalYear(startEpochIso),
      processingDelayHours: Number(values.processingDelayHours ?? config.processingDelayHours),
      packetBytes: Number(values.packetBytes ?? scenario.packetBytes),
      transceiverId: String(values.transceiverId || scenario.transceiverId || config.defaultTransceiver),
      sourceId: String(values.sourceId || scenario.sourceId),
      targetId: String(values.targetId || scenario.targetId),
      routingMode: String(values.routingMode || config.defaultRoutingMode),
      routeObjective: String(values.routeObjective || config.defaultRouteObjective),
      requiredRelayIds: normalizeRequiredRelayIds(values.requiredRelayIds, scenarioRelays),
      eligibleRelayIds: normalizeIds(values.eligibleRelayIds, eligibleDefault),
      maxHops: Number(values.maxHops ?? config.maxHops),
      maxHopDistancePc: Number(values.maxHopDistancePc ?? config.maxHopDistancePc),
      channelMode,
      operationsProfileId,
      ensembleSize: Number(values.ensembleSize ?? config.ensembleSize),
      retryLimit: Number(values.retryLimit ?? operationsProfile.retryLimit),
      quantumMemoryCoherenceHours: Number(
        values.quantumMemoryCoherenceHours ?? advancedData.defaults.quantumMemoryCoherenceHours,
      ),
      quantumInitialFidelity: Number(
        values.quantumInitialFidelity ?? advancedData.defaults.quantumInitialFidelity,
      ),
      entanglementPairRateHz: Number(
        values.entanglementPairRateHz ?? advancedData.defaults.entanglementPairRateHz,
      ),
      wormholeTraversalSeconds: Number(
        values.wormholeTraversalSeconds ?? advancedData.defaults.wormholeTraversalSeconds,
      ),
      wormholeThroatRadiusM: Number(
        values.wormholeThroatRadiusM ?? advancedData.defaults.wormholeThroatRadiusM,
      ),
      warpEffectiveSpeedC: Number(
        values.warpEffectiveSpeedC ?? advancedData.defaults.warpEffectiveSpeedC,
      ),
      warpBubbleRadiusM: Number(
        values.warpBubbleRadiusM ?? advancedData.defaults.warpBubbleRadiusM,
      ),
      speculativeBandwidthGbps: Number(
        values.speculativeBandwidthGbps ?? advancedData.defaults.speculativeBandwidthGbps,
      ),
      speculativeStabilityProbability: Number(
        values.speculativeStabilityProbability ?? advancedData.defaults.speculativeStabilityProbability,
      ),
      acquisitionMeanHours: operationsProfile.acquisitionMeanHours,
      dutyCycle: operationsProfile.dutyCycle,
      meanTimeBetweenFailuresHours: operationsProfile.meanTimeBetweenFailuresHours,
      meanRepairHours: operationsProfile.meanRepairHours,
      maintenanceIntervalHours: operationsProfile.maintenanceIntervalHours,
      maintenanceDurationHours: operationsProfile.maintenanceDurationHours,
      queueMeanDelayHours: operationsProfile.queueMeanDelayHours,
      dustExtinctionMagPerPc: operationsProfile.dustExtinctionMagPerPc,
      plasmaLossDbPerPc: operationsProfile.plasmaLossDbPerPc,
      detectorNoiseScale: operationsProfile.detectorNoiseScale,
    };
    validateControls(controls, { starIds, hardwareIds });
    return deepFreeze(controls);
  }

  function validateControls(value, { starIds, hardwareIds }) {
    if (!starIds.has(value.sourceId)) throw controlError('interstellar_source_star_missing', value.sourceId);
    if (!starIds.has(value.targetId)) throw controlError('interstellar_target_star_missing', value.targetId);
    if (value.sourceId === value.targetId) throw controlError('interstellar_route_endpoints_equal', value.sourceId);
    if (!hardwareIds.has(value.transceiverId)) throw controlError('interstellar_transceiver_missing', value.transceiverId);
    value.requiredRelayIds.filter((id) => id !== 'none').forEach((id) => {
      if (!starIds.has(id)) throw controlError('interstellar_required_relay_missing', id);
    });
    value.eligibleRelayIds.forEach((id) => {
      if (!starIds.has(id)) throw controlError('interstellar_eligible_relay_missing', id);
    });
    if (!['direct', 'automatic', 'manual'].includes(value.routingMode)) {
      throw controlError('interstellar_routing_mode_invalid', value.routingMode);
    }
    if (!['latency', 'throughput', 'energy', 'reliability', 'balanced'].includes(value.routeObjective)) {
      throw controlError('interstellar_route_objective_invalid', value.routeObjective);
    }
    requireNumber(value, 'astrometryEpochYear', 2016, 2200);
    requireNumber(value, 'processingDelayHours', 0, 8760);
    requireInteger(value, 'packetBytes', 64, 1073741824);
    requireInteger(value, 'maxHops', 1, 8);
    requireNumber(value, 'maxHopDistancePc', 0.01, 250000);
    requireInteger(value, 'ensembleSize', 8, 512);
    requireInteger(value, 'retryLimit', 0, 20);
    requireNumber(value, 'quantumMemoryCoherenceHours', 0.001, 1e12);
    requireNumber(value, 'quantumInitialFidelity', 0, 1);
    requireNumber(value, 'entanglementPairRateHz', 1, 1e18);
    requireNumber(value, 'wormholeTraversalSeconds', 0.000001, 1e12);
    requireNumber(value, 'wormholeThroatRadiusM', 1e-35, 1e12);
    requireNumber(value, 'warpEffectiveSpeedC', 0.01, 1e6);
    requireNumber(value, 'warpBubbleRadiusM', 0.01, 1e12);
    requireNumber(value, 'speculativeBandwidthGbps', 1e-12, 1e12);
    requireNumber(value, 'speculativeStabilityProbability', 0, 1);
  }

  function controlOptions({ starsData, hardwareData, operationsData, advancedData }) {
    return deepFreeze({
      stars: starsData.stars.map(starOption),
      relays: [
        { value: 'none', label: 'No required relay' },
        ...starsData.stars.map(starOption),
      ],
      terminals: Object.values(hardwareData.archetypes).map((row) => ({ value: row.id, label: row.name })),
      operationsProfiles: operationsData.profiles.map((row) => ({ value: row.id, label: row.label })),
      channels: advancedData.channels.map(channelOption),
    });
  }

  function controlFields(controls, options) {
    return [
      selectField('sourceId', 'Route: from star', controls.sourceId, options.stars),
      selectField('targetId', 'Route: to star', controls.targetId, options.stars),
      selectField('routingMode', 'Route: mode', controls.routingMode, routeModes()),
      selectField('routeObjective', 'Route: objective', controls.routeObjective, routeObjectives()),
      { id: 'maxHops', label: 'Relays: maximum hops', type: 'number', value: controls.maxHops },
      { id: 'maxHopDistancePc', label: 'Relays: maximum hop distance (pc)', type: 'number', value: controls.maxHopDistancePc },
      { id: 'startEpochIso', label: 'Transmission: epoch (UTC)', type: 'date', value: controls.startEpochIso.slice(0, 10) },
      { id: 'packetBytes', label: 'Transmission: packet bytes', type: 'number', value: controls.packetBytes },
      { id: 'processingDelayHours', label: 'Transmission: relay processing hours', type: 'number', value: controls.processingDelayHours },
      selectField('transceiverId', 'Transmission: optical terminal', controls.transceiverId, options.terminals),
      selectField('operationsProfileId', 'Operations: profile', controls.operationsProfileId, options.operationsProfiles),
      { id: 'ensembleSize', label: 'Operations: samples', type: 'number', value: controls.ensembleSize },
      { id: 'retryLimit', label: 'Operations: retry limit', type: 'number', value: controls.retryLimit },
      selectField('channelMode', 'Physics: channel lane', controls.channelMode, options.channels),
      ...advancedFields(controls),
    ];
  }

  function advancedFields(controls) {
    if (controls.channelMode === 'quantum-assisted') return [
      { id: 'quantumMemoryCoherenceHours', label: 'Physics: quantum memory coherence (h)', type: 'number', value: controls.quantumMemoryCoherenceHours },
      { id: 'quantumInitialFidelity', label: 'Physics: initial entanglement fidelity', type: 'number', value: controls.quantumInitialFidelity },
      { id: 'entanglementPairRateHz', label: 'Physics: entanglement pair rate (Hz)', type: 'number', value: controls.entanglementPairRateHz },
    ];
    if (controls.channelMode === 'traversable-wormhole') return [
      { id: 'wormholeTraversalSeconds', label: 'Physics: wormhole traversal (s)', type: 'number', value: controls.wormholeTraversalSeconds },
      { id: 'wormholeThroatRadiusM', label: 'Physics: wormhole throat radius (m)', type: 'number', value: controls.wormholeThroatRadiusM },
      { id: 'speculativeBandwidthGbps', label: 'Physics: speculative bandwidth (Gbps)', type: 'number', value: controls.speculativeBandwidthGbps },
      { id: 'speculativeStabilityProbability', label: 'Physics: speculative stability', type: 'number', value: controls.speculativeStabilityProbability },
    ];
    if (controls.channelMode === 'alcubierre-warp') return [
      { id: 'warpEffectiveSpeedC', label: 'Physics: effective speed (c)', type: 'number', value: controls.warpEffectiveSpeedC },
      { id: 'warpBubbleRadiusM', label: 'Physics: warp bubble radius (m)', type: 'number', value: controls.warpBubbleRadiusM },
      { id: 'speculativeBandwidthGbps', label: 'Physics: speculative bandwidth (Gbps)', type: 'number', value: controls.speculativeBandwidthGbps },
      { id: 'speculativeStabilityProbability', label: 'Physics: speculative stability', type: 'number', value: controls.speculativeStabilityProbability },
    ];
    return [];
  }

  function routeModes() {
    return [
      { value: 'automatic', label: 'Automatic route search' },
      { value: 'manual', label: 'Use required relay set' },
      { value: 'direct', label: 'Direct link only' },
    ];
  }
  function routeObjectives() {
    return [
      { value: 'balanced', label: 'Balanced frontier' },
      { value: 'latency', label: 'Lowest latency' },
      { value: 'throughput', label: 'Highest throughput' },
      { value: 'energy', label: 'Lowest energy' },
      { value: 'reliability', label: 'Highest reliability' },
    ];
  }
  function selectField(id, label, value, options) {
    return { id, label, type: 'select', value, options };
  }

  function decimalYear(epochIso) {
    const milliseconds = Date.parse(epochIso);
    const date = new Date(milliseconds);
    const year = date.getUTCFullYear();
    const start = Date.UTC(year, 0, 1);
    const end = Date.UTC(year + 1, 0, 1);
    return year + ((milliseconds - start) / (end - start));
  }
  function starOption(row) {
    const catalog = row.catalogDatasetId === 'hyg.visible-stars.v1' ? 'HYG' : 'Gaia';
    return { value: row.sourceId, label: `${row.name} · ${catalog}` };
  }
  function channelOption(row) {
    const suffix = row.id === 'classical-optical'
      ? 'engineering model'
      : row.id === 'quantum-assisted'
        ? 'modeled, classical message required'
        : 'speculative, not constructible';
    return { value: row.id, label: `${row.label} (${suffix})` };
  }
  function normalizeIds(value, fallback) {
    const rows = Array.isArray(value) ? value : fallback;
    return [...new Set(rows.map(String).filter((id) => id !== 'none'))];
  }
  function normalizeRequiredRelayIds(value, fallback) {
    return normalizeIds(value, fallback);
  }
  function normalizeEpoch(value) {
    const text = String(value);
    const normalized = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/.test(text)
      ? `${text.includes('T') ? text : `${text}T00:00:00`}Z`
      : text;
    if (!Number.isFinite(Date.parse(normalized))) throw controlError('interstellar_start_epoch_invalid', value);
    return new Date(normalized).toISOString();
  }
  function requireNumber(value, key, minimum, maximum) {
    if (!Number.isFinite(value[key]) || value[key] < minimum || value[key] > maximum) {
      throw controlError('interstellar_numeric_control_invalid', key);
    }
  }
  function requireInteger(value, key, minimum, maximum) {
    requireNumber(value, key, minimum, maximum);
    if (!Number.isInteger(value[key])) throw controlError('interstellar_integer_control_invalid', key);
  }
  function controlError(code, detail) {
    const error = new Error(`${code}: ${detail}`);
    error.code = code;
    return error;
  }
  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({
    controlFields,
    controlOptions,
    normalizeScenario,
    resolveControls,
    resolveScenario,
    routeModes,
    routeObjectives,
  });
});
