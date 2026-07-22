(function attachOrbitalTransferPlugin(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginOrbitalTransferPlanner = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createOrbitalTransferPluginApi(root) {
  const PLUGIN_ID = 'orbital-transfer-planner';

  function dependency(name, path) {
    if (typeof module === 'object' && module.exports) return require(path);
    const value = root[name];
    if (!value) throw new Error(`orbital_dependency_missing: ${name}`);
    return value;
  }

  async function activate({ sdk, config, profile, scenario }) {
    const ephemerisApi = dependency('OrbitalTransferEphemeris', './ephemeris.js');
    const launchWindowApi = dependency('OrbitalTransferLaunchWindow', './launch-window.js');
    const metricsApi = dependency('OrbitalTransferMetrics', './metrics.js');
    const radiationApi = dependency('OrbitalTransferRadiation', './radiation.js');
    const presentationApi = dependency('OrbitalTransferPresentation', './presentation.js');
    const hohmannApi = dependency('OrbitalTransferHohmann', './hohmann.js');

    const ephemerisData = sdk.datasets.require('jpl.horizons.heliocentric-vectors.v1');
    const gmData = sdk.datasets.require('solar.system.gm-constants-de440.v1');
    const radData = sdk.datasets.optional('solar.radiation.snapshot.v1');
    const depotsData = sdk.datasets.optional('orbital.depots.v1');
    const spacecraftData = sdk.datasets.optional('spacecraft.archetypes.v1');
    const sunGm = gmData.bodies.sun.gmAuD2;
    const profileWeights = profile?.routeObjective || {};

    let activeScenario = normalizeScenario(scenario, config);
    let current = computeScenario(activeScenario);
    sdk.state.register(reduce, { scenarioId: activeScenario.id, result: current, lastAction: 'activated' });
    appendEphemerisReceipt();

    function appendEphemerisReceipt() {
      sdk.receipts.append({
        schema: 'simulatte.plugin.ephemerisIdentityReceipt.v1',
        datasetId: ephemerisData.id,
        datasetSha256: sdk.datasets.receipt('jpl.horizons.heliocentric-vectors.v1')?.sha256 || null,
        epochStart: ephemerisData.epochStart || ephemerisData.epoch?.start || null,
        epochCount: ephemerisData.epochCount || null,
        sourceKind: ephemerisData.provenance?.sourceKind || ephemerisData.sourceKind || 'declared_dataset',
        claimBoundary: ephemerisData.provenance?.claimBoundary || 'Pinned ephemeris state vectors; not operational navigation data.',
      });
    }

    function computeScenario(spec) {
      const targetBodyId = targetForScenario(spec.id);
      const searchSpec = searchForTarget(targetBodyId, ephemerisData);
      const search = launchWindowApi.scanLaunchWindow({
        ephemerisDataset: ephemerisData,
        departureBodyId: 'earth',
        arrivalBodyId: targetBodyId,
        gmSunAuD2: sunGm,
        objectiveWeights: {
          deltaV: Number(profileWeights.deltaV ?? 1),
          timeOfFlight: Number(profileWeights.timeOfFlight ?? profileWeights.timeOfFlightDays ?? 0.01),
        },
        bodyConstants: bodyConstants(gmData),
        ...searchSpec,
      });
      let selected = search.selected;
      let fallback = null;
      if (!selected) {
        const earth = ephemerisApi.getBodyState(ephemerisData, 'earth', 0, { clamp: true });
        const target = ephemerisApi.getBodyState(ephemerisData, targetBodyId, 0, { clamp: true });
        const h = hohmannApi.computeHohmann(Math.hypot(...earth.positionAu), Math.hypot(...target.positionAu), sunGm);
        fallback = Object.freeze({ method: 'circular_hohmann_fallback_v1', timeOfFlightDays: h.timeOfFlightDays, totalDeltaVKmS: h.totalDvKmS, trajectory: [earth.positionAu, target.positionAu] });
      }
      const tofDays = selected?.tofDays ?? fallback.timeOfFlightDays;
      const spacecraft = spacecraftData?.archetypes?.[config?.defaultArchetype || 'cargo-freighter-v1'];
      const radiation = radiationApi.computeExposure(tofDays, radData, spacecraft?.radiationShieldingGcm2 || 15);
      const metrics = selected ? metricsApi.summarize(search, radiation) : Object.freeze({
        schema: 'simulatte.orbitalTransferMetrics.v1', solutionCount: 0, attemptedCount: search.search.attempted,
        departureEpoch: null, arrivalEpoch: null, timeOfFlightDays: tofDays,
        totalDeltaVKmS: fallback.totalDeltaVKmS, radiationExposureUnits: radiation.shieldedProtonUnits,
        algorithm: fallback.method, claimBoundary: search.claimBoundary,
      });
      return Object.freeze({
        schema: 'simulatte.orbitalScenarioResult.v1',
        scenarioId: spec.id, seed: spec.seed || null, targetBodyId,
        search, selected, fallback, metrics, radiation,
        depots: depotsData?.depots || [],
        claimBoundary: 'Deterministic mission-design comparison over pinned state vectors; not operational navigation or flight certification.',
      });
    }

    function setScenario(nextScenario) {
      activeScenario = normalizeScenario(nextScenario, config);
      current = computeScenario(activeScenario);
      sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.scenario-computed`, scenarioId: activeScenario.id, result: current });
      return current;
    }

    function contributeRequest({ sourceText, mission = null }) {
      if (!/\b(?:orbital|transfer|launch\s+window|delta[- ]?v|earth\s+to\s+(?:mars|moon|venus|jupiter)|lambert|hohmann)\b/i.test(sourceText || '')) return null;
      if (!mission) return { recognized: true, obligations: [], unresolved: [] };
      return {
        recognized: true,
        obligations: [
          { id: `${PLUGIN_ID}:solution:${activeScenario.id}`, kind: 'orbital_solution', required: true },
          { id: `${PLUGIN_ID}:ephemeris:${activeScenario.id}`, kind: 'ephemeris_identity', required: true },
        ],
        unresolved: [],
      };
    }

    function appendTransferReceipt(kind = 'plan') {
      sdk.receipts.append({
        schema: 'simulatte.plugin.orbitalTransferReceipt.v1',
        scenarioId: current.scenarioId,
        kind,
        targetBodyId: current.targetBodyId,
        selectedCandidateId: current.selected?.id || null,
        departureEpoch: current.metrics.departureEpoch,
        arrivalEpoch: current.metrics.arrivalEpoch,
        timeOfFlightDays: current.metrics.timeOfFlightDays,
        totalDeltaVKmS: current.metrics.totalDeltaVKmS,
        radiationExposureUnits: current.metrics.radiationExposureUnits,
        algorithm: current.metrics.algorithm,
        searchAttempted: current.metrics.attemptedCount,
        searchSolutions: current.metrics.solutionCount,
        claimBoundary: current.claimBoundary,
      });
    }

    function handleAction(actionId) {
      if (actionId === 'scenario.run' || actionId === 'plan.transfer') {
        appendTransferReceipt(actionId);
        sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.plan-recorded`, actionId, result: current });
        return { status: 'settled', metrics: current.metrics };
      }
      if (actionId === 'counterfactual.compare') {
        const baseline = hohmannApi.computeHohmann(1.0, 1.523679, sunGm);
        const deltaDvKmS = current.metrics.totalDeltaVKmS - baseline.totalDvKmS;
        const deltaDays = current.metrics.timeOfFlightDays - baseline.timeOfFlightDays;
        sdk.receipts.append({
          schema: 'simulatte.plugin.orbitalCounterfactualReceipt.v1',
          baselineId: 'earth-mars-circular-hohmann', counterfactualScenarioId: current.scenarioId,
          deltaDvKmS, deltaDays,
          claimBoundary: 'Comparison against a circular coplanar Earth–Mars Hohmann baseline.',
        });
        return { status: 'settled', deltaDvKmS, deltaDays };
      }
      return { status: 'refused', reason: 'unknown_action', actionId };
    }

    function settle() {
      const state = sdk.state.read();
      const result = state.result;
      const hasSolution = Boolean(result.selected || result.fallback);
      const ephemerisIdentity = sdk.datasets.receipt('jpl.horizons.heliocentric-vectors.v1')?.sha256 || null;
      return {
        obligationResults: [
          { obligationId: `${PLUGIN_ID}:solution:${state.scenarioId}`, status: hasSolution ? 'settled' : 'unmet', evidence: { solutionCount: result.metrics.solutionCount, fallback: Boolean(result.fallback) } },
          { obligationId: `${PLUGIN_ID}:ephemeris:${state.scenarioId}`, status: ephemerisIdentity ? 'settled' : 'unmet', evidence: { sha256: ephemerisIdentity } },
          { obligationId: `${PLUGIN_ID}:dv-envelope`, status: result.metrics.totalDeltaVKmS <= 20 ? 'settled' : 'unmet', evidence: { totalDeltaVKmS: result.metrics.totalDeltaVKmS, maximumKmS: 20 } },
        ],
        stateIdentity: `${state.scenarioId}:${result.metrics.algorithm}:${result.metrics.departureEpoch || 'fallback'}`,
        losses: [],
      };
    }

    function view() {
      const result = sdk.state.read().result;
      return [
        {
          slot: 'inspector', title: 'Orbital Transfer Planner',
          rows: [
            { label: 'Scenario', value: result.scenarioId },
            { label: 'Target', value: result.targetBodyId.toUpperCase() },
            { label: 'Search', value: `${result.metrics.solutionCount}/${result.metrics.attemptedCount} converged` },
            { label: 'Departure', value: result.metrics.departureEpoch || 'circular fallback' },
            { label: 'Arrival', value: result.metrics.arrivalEpoch || 'circular fallback' },
            { label: 'Time of flight', value: `${result.metrics.timeOfFlightDays.toFixed(2)} days` },
            { label: 'Total Δv', value: `${result.metrics.totalDeltaVKmS.toFixed(3)} km/s` },
            { label: 'Radiation proxy', value: `${result.metrics.radiationExposureUnits.toFixed(2)} shielded proton units` },
            { label: 'Method', value: result.metrics.algorithm },
          ],
          actions: [
            { id: 'plan.transfer', label: 'Compute transfer' },
            { id: 'counterfactual.compare', label: 'Compare Hohmann baseline' },
          ],
        },
        {
          slot: 'hud', title: 'Orbital claim boundary',
          rows: [
            { label: 'Status', value: result.selected ? 'Lambert solution' : 'Hohmann fallback' },
            { label: 'Boundary', value: result.claimBoundary },
          ], actions: [],
        },
      ];
    }

    function present() {
      const result = sdk.state.read().result;
      const trajectory = result.selected?.trajectory || result.fallback?.trajectory || [];
      return presentationApi.createPresentation(ephemerisData, { trajectory, selectedBodyIds: ['earth', result.targetBodyId] });
    }

    const capabilities = Object.freeze({
      'simulation.orbital-transfer.v1': () => sdk.state.read().result,
      'simulation.orbital-kinetics.v1': () => sdk.state.read().result,
      'field.solar-radiation.v1': () => sdk.state.read().result.radiation,
    });

    return Object.freeze({ id: PLUGIN_ID, contributeRequest, setScenario, handleAction, settle, view, present, reduce, capabilities, dispose() {} });
  }

  function normalizeScenario(value, config) {
    if (typeof value === 'string') return { id: value, seed: value };
    const id = value?.scenarioId || value?.id || config?.defaultScenarioId || 'earth-mars-window';
    return Object.freeze({ id, seed: value?.seed || id, label: value?.label || id });
  }
  function targetForScenario(id) {
    const text = String(id || '').toLowerCase();
    if (text.includes('moon') || text.includes('l1')) return 'moon';
    if (text.includes('venus')) return 'venus';
    if (text.includes('jupiter')) return 'jupiter';
    return 'mars';
  }
  function searchForTarget(target, dataset) {
    const maximumDay = Math.max(0, Number(dataset?.epochCount || 730) - 1);
    if (target === 'moon') return { departureStartDay: 0, departureEndDay: Math.max(0, Math.min(60, maximumDay - 20)), departureStepDays: 1, tofMinDays: 2, tofMaxDays: 18, tofStepDays: 1 };
    if (target === 'venus') return { departureStartDay: 0, departureEndDay: Math.max(0, Math.min(300, maximumDay - 250)), departureStepDays: 5, tofMinDays: 80, tofMaxDays: 240, tofStepDays: 5 };
    if (target === 'jupiter') return { departureStartDay: 0, departureEndDay: Math.max(0, Math.min(200, maximumDay - 500)), departureStepDays: 10, tofMinDays: 350, tofMaxDays: Math.min(700, maximumDay), tofStepDays: 10 };
    return { departureStartDay: 0, departureEndDay: Math.max(0, Math.min(300, maximumDay - 450)), departureStepDays: 5, tofMinDays: 120, tofMaxDays: 420, tofStepDays: 5 };
  }
  function bodyConstants(gmData) {
    const radiiKm = { earth: 6378.137, moon: 1737.4, mars: 3396.19, venus: 6051.8, jupiter: 71492 };
    return Object.fromEntries(Object.entries(gmData.bodies || {}).map(([id, row]) => [id, { ...row, radiusKm: radiiKm[id] || null }]));
  }
  function reduce(state, event) {
    if (event.kind === `${PLUGIN_ID}.scenario-computed`) return { ...state, scenarioId: event.scenarioId, result: event.result, lastAction: 'scenario' };
    if (event.kind === `${PLUGIN_ID}.plan-recorded`) return { ...state, result: event.result, lastAction: event.actionId };
    return state;
  }

  const datasetValidators = Object.freeze({
    'simulatte.jplHorizonsHeliocentricVectors.v1': (value) => { if (!value?.bodies?.earth || !value?.bodies?.mars) throw new Error('ephemeris missing Earth or Mars'); return value; },
    'simulatte.solarSystemGmConstants.v1': (value) => { if (!(value?.bodies?.sun?.gmAuD2 > 0)) throw new Error('solar GM missing'); return value; },
    'simulatte.solarRadiationSnapshot.v1': (value) => { if (!Number.isFinite(value?.baselineFluxPfu)) throw new Error('radiation baseline missing'); return value; },
    'simulatte.orbitalDepots.v1': (value) => { if (!Array.isArray(value?.depots)) throw new Error('depots missing'); return value; },
    'simulatte.spacecraftArchetypes.v1': (value) => { if (!value?.archetypes || typeof value.archetypes !== 'object') throw new Error('spacecraft archetypes missing'); return value; },
  });

  return Object.freeze({ activate, datasetValidators });
});
