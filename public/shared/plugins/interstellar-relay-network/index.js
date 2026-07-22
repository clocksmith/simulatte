(function attachInterstellarRelayPlugin(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginInterstellarRelayNetwork = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createInterstellarRelayPluginApi(root) {
  const PLUGIN_ID = 'interstellar-relay-network';
  function dep(globalName, path) { return typeof module === 'object' && module.exports ? require(path) : root[globalName]; }

  async function activate({ sdk, config, profile, scenario }) {
    const stellarApi = dep('InterstellarStellarState', './stellar-state.js');
    const contactApi = dep('InterstellarContactScheduler', './contact-scheduler.js');
    const linkApi = dep('InterstellarOpticalLinkBudget', './optical-link-budget.js');
    const packetApi = dep('InterstellarPacketQueue', './packet-queue.js');
    const metricsApi = dep('InterstellarMetrics', './metrics.js');
    const presentationApi = dep('InterstellarRelayPresentation', './presentation.js');

    const starsData = sdk.datasets.require('gaia.dr3.nearby-stars.v1');
    const nameCrosswalk = sdk.datasets.optional('stellar.name.crosswalk.v1');
    const transceiversData = sdk.datasets.require('relay.hardware.archetypes.v1');
    const scenariosData = sdk.datasets.require('interstellar.scenario.network.v1');
    const starsById = new Map((starsData.stars || []).map((row) => [row.sourceId, applyName(row, nameCrosswalk)]));
    const statesById = new Map([...starsById].map(([id, star]) => [id, stellarApi.convertEquatorialToCartesianPc(star, 2026.5)]));

    let activeScenario = normalizeScenario(scenario, config);
    let current = await computeScenario(activeScenario);
    sdk.state.register(reduce, { scenarioId: current.scenarioId, result: current, lastAction: 'activated' });
    appendScenarioReceipt(current);

    async function computeScenario(spec) {
      const scenarioSpec = resolveScenario(scenariosData, spec.id);
      const schedule = contactApi.scheduleRelay({
        relayPath: scenarioSpec.relayHops, statesById, scheduler: sdk.scheduler,
        startEpochIso: '2026-07-21T00:00:00Z', processingDelayHours: Number(config?.processingDelayHours || 8),
      });
      const linkBudgets = schedule.hops.map((hop) => {
        const hardware = transceiversData.archetypes?.[scenarioSpec.transceiverId] || Object.values(transceiversData.archetypes || {})[0];
        return linkApi.computeLinkBudget(hop.lightTime.distanceMeters, hardware);
      });
      const packet = await packetApi.createPacket({
        receiptTools: sdk.receipts, packetId: `packet:${spec.id}:0`, sequence: 0,
        payload: 'SYN-ACK-INTERSTELLAR', sourceId: scenarioSpec.sourceId, destinationId: scenarioSpec.targetId,
        relayPath: scenarioSpec.relayHops, createdAt: schedule.startEpochIso, schedule,
      });
      const metrics = metricsApi.summarize({ schedule, linkBudgets, packet });
      return Object.freeze({
        schema: 'simulatte.interstellarRelayResult.v1', scenarioId: spec.id, datasetScenarioId: scenarioSpec.id,
        seed: spec.seed, scenario: scenarioSpec, schedule, linkBudgets: Object.freeze(linkBudgets), packet, metrics,
        sourceState: statesById.get(scenarioSpec.sourceId), targetState: statesById.get(scenarioSpec.targetId),
        relayStates: Object.freeze(scenarioSpec.relayHops.map((id) => statesById.get(id))),
        claimBoundary: 'Hypothetical store-and-forward optical network over measured stellar astrometry; no relay infrastructure is asserted to exist.',
      });
    }

    function appendScenarioReceipt(result) {
      sdk.receipts.append({
        schema: 'simulatte.plugin.interstellarScenarioReceipt.v1', scenarioId: result.scenarioId,
        datasetScenarioId: result.datasetScenarioId, seed: result.seed, relayPath: result.scenario.relayHops,
        catalogSha256: sdk.datasets.receipt('gaia.dr3.nearby-stars.v1')?.sha256 || null,
        hopCount: result.metrics.hopCount, latencyYears: result.metrics.oneWayLatencyYears,
        claimBoundary: result.claimBoundary,
      });
    }

    async function setScenario(nextScenario) {
      activeScenario = normalizeScenario(nextScenario, config);
      current = await computeScenario(activeScenario);
      appendScenarioReceipt(current);
      sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.scenario-computed`, scenarioId: current.scenarioId, result: current });
      return current;
    }

    function contributeRequest({ sourceText, mission = null }) {
      if (!/\b(?:interstellar|relay|light[- ]?time|optical\s+link|proxima|sirius|alpha\s+centauri|stellar\s+packet)\b/i.test(sourceText || '')) return null;
      if (!mission) return { recognized: true, obligations: [], unresolved: [] };
      return { recognized: true, obligations: [
        { id: `${PLUGIN_ID}:delivery:${activeScenario.id}`, kind: 'packet_delivery', required: true },
        { id: `${PLUGIN_ID}:integrity:${activeScenario.id}`, kind: 'packet_integrity', required: true },
      ], unresolved: [] };
    }

    async function appendRunReceipts(result) {
      sdk.receipts.append(result.packet);
      sdk.receipts.append({
        schema: 'simulatte.plugin.interstellarContactScheduleReceipt.v1', scenarioId: result.scenarioId,
        relayPath: result.scenario.relayHops, hopCount: result.metrics.hopCount,
        startEpochIso: result.schedule.startEpochIso, deliveryEpochIso: result.schedule.deliveryEpochIso,
        latencyYears: result.metrics.oneWayLatencyYears, scheduler: result.schedule.schedulerReceipt,
      });
      sdk.receipts.append({
        schema: 'simulatte.plugin.opticalLinkBudgetReceipt.v1', scenarioId: result.scenarioId,
        hopBudgets: result.linkBudgets.map((row, index) => ({ index, achievableDataRateGbps: row.achievableDataRateGbps, linkMarginDb: row.linkMarginDb, method: row.method })),
        bottleneckDataRateGbps: result.metrics.bottleneckDataRateGbps,
        minimumLinkMarginDb: result.metrics.minimumLinkMarginDb,
        claimBoundary: result.linkBudgets[0]?.claimBoundary || null,
      });
      sdk.receipts.append({
        schema: 'simulatte.plugin.interstellarIntegrityReceipt.v1', scenarioId: result.scenarioId,
        packetId: result.packet.packetId, algorithm: result.packet.integrity.algorithm,
        payloadHash: result.packet.integrity.payloadHash, packetHash: result.packet.integrity.packetHash,
        terminalVerification: result.packet.terminalVerification,
      });
    }

    async function handleAction(actionId) {
      const result = sdk.state.read().result;
      if (actionId === 'scenario.run' || actionId === 'simulate.packet.transmission') {
        await appendRunReceipts(result);
        sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.packet-recorded`, actionId, result });
        return { status: 'settled', metrics: result.metrics };
      }
      if (actionId === 'counterfactual.compare') {
        const baselineSpec = normalizeScenario({ id: 'sol-proxima-direct', seed: result.seed }, config);
        const baseline = await computeScenario(baselineSpec);
        const delayDiffYears = result.metrics.oneWayLatencyYears - baseline.metrics.oneWayLatencyYears;
        const rateDiffGbps = result.metrics.bottleneckDataRateGbps - baseline.metrics.bottleneckDataRateGbps;
        sdk.receipts.append({
          schema: 'simulatte.plugin.interstellarCounterfactualReceipt.v1', baselineScenarioId: baseline.scenarioId,
          counterfactualScenarioId: result.scenarioId, delayDiffYears, rateDiffGbps,
          commonSeed: result.seed, claimBoundary: 'Counterfactual uses the same catalog epoch and declared hardware models.',
        });
        return { status: 'settled', delayDiffYears, rateDiffGbps };
      }
      return { status: 'refused', reason: 'unknown_action', actionId };
    }

    function settle() {
      const state = sdk.state.read();
      const result = state.result;
      return { obligationResults: [
        { obligationId: `${PLUGIN_ID}:delivery:${state.scenarioId}`, status: result.packet.estimatedArrivalEpoch === result.schedule.deliveryEpochIso ? 'settled' : 'unmet', evidence: { deliveryEpochIso: result.schedule.deliveryEpochIso } },
        { obligationId: `${PLUGIN_ID}:integrity:${state.scenarioId}`, status: result.packet.terminalVerification === 'verified_sha256_match' ? 'settled' : 'unmet', evidence: { packetHash: result.packet.integrity.packetHash, verification: result.packet.terminalVerification } },
        { obligationId: `${PLUGIN_ID}:schedule`, status: result.schedule.schedulerReceipt.processedCount === result.schedule.trace.length ? 'settled' : 'unmet', evidence: result.schedule.schedulerReceipt },
      ], stateIdentity: `${state.scenarioId}:${result.packet.integrity.packetHash}`, losses: [] };
    }

    function view() {
      const result = sdk.state.read().result;
      return [
        { slot: 'inspector', title: 'Interstellar Relay Network', rows: [
          { label: 'Scenario', value: result.scenario.name },
          { label: 'Relay path', value: result.scenario.relayHops.join(' → ') },
          { label: 'Hops', value: String(result.metrics.hopCount) },
          { label: 'One-way latency', value: `${result.metrics.oneWayLatencyYears.toFixed(5)} years` },
          { label: 'Delivery epoch', value: result.metrics.deliveryEpochIso },
          { label: 'Bottleneck rate', value: `${result.metrics.bottleneckDataRateGbps.toExponential(3)} Gbps` },
          { label: 'Minimum margin', value: result.metrics.minimumLinkMarginDb == null ? 'n/a' : `${result.metrics.minimumLinkMarginDb.toFixed(2)} dB` },
          { label: 'Packet hash', value: result.metrics.packetHash.slice(0, 16) },
        ], actions: [
          { id: 'simulate.packet.transmission', label: 'Transmit optical packet' },
          { id: 'counterfactual.compare', label: 'Compare Proxima direct' },
        ] },
        { slot: 'hud', title: 'Interstellar claim boundary', rows: [
          { label: 'Status', value: 'Hypothetical infrastructure over measured star positions' },
          { label: 'Boundary', value: result.claimBoundary },
        ], actions: [] },
      ];
    }
    function present() { const result = sdk.state.read().result; return presentationApi.createPresentation(starsData, { pathPositions: result.relayStates.map((row) => row.positionPc), relayPath: result.scenario.relayHops }); }

    const capabilities = Object.freeze({
      'field.stellar-flux.v1': () => ({ schema: 'field.stellar-flux.v1', value: current.targetState?.astrometricQuality || null, units: 'catalog_astrometry', providerId: PLUGIN_ID }),
      'simulation.light-delay-queue.v1': () => sdk.state.read().result.schedule,
      'simulation.interstellar-communications.v1': () => sdk.state.read().result,
    });
    return Object.freeze({ id: PLUGIN_ID, contributeRequest, setScenario, handleAction, settle, view, present, reduce, capabilities, dispose() {} });
  }

  function resolveScenario(dataset, id) {
    const aliases = { 'sol-proxima-link': 'sol-proxima-direct', 'sol-sirius-link': 'sirius-high-power-link' };
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
  function applyName(star, crosswalk) {
    const row = crosswalk?.names?.find?.((entry) => entry.sourceId === star.sourceId) || crosswalk?.bySourceId?.[star.sourceId];
    return row ? { ...star, name: row.name || row.properName || star.name } : star;
  }
  function reduce(state, event) {
    if (event.kind === `${PLUGIN_ID}.scenario-computed`) return { ...state, scenarioId: event.scenarioId, result: event.result, lastAction: 'scenario' };
    if (event.kind === `${PLUGIN_ID}.packet-recorded`) return { ...state, result: event.result, lastAction: event.actionId };
    return state;
  }
  const datasetValidators = Object.freeze({
    'simulatte.gaiaDr3NearbyStars.v1': (value) => { if (!Array.isArray(value?.stars) || value.stars.length < 2) throw new Error('nearby star catalog incomplete'); return value; },
    'simulatte.stellarNameCrosswalk.v1': (value) => value,
    'simulatte.nasaExoplanetHosts.v1': (value) => value,
    'simulatte.relayHardwareArchetypes.v1': (value) => { if (!value?.archetypes || !Object.keys(value.archetypes).length) throw new Error('relay hardware missing'); return value; },
    'simulatte.interstellarScenarioNetwork.v1': (value) => { if (!Array.isArray(value?.scenarios) || !value.scenarios.length) throw new Error('relay scenarios missing'); return value; },
  });
  return Object.freeze({ activate, datasetValidators });
});
