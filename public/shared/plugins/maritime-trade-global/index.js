(function attachMaritimeTradePlugin(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginMaritimeTradeGlobal = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMaritimeTradePluginApi(root) {
  const PLUGIN_ID = 'maritime-trade-global';
  const DATASET_IDS = Object.freeze([
    'global-port-registry-wpi-v1',
    'global-maritime-corridors-v1',
    'global-canal-service-models-v1',
    'container-port-performance-v1',
    'ibtracs-v04r01-scenario-tracks-v1',
    'maritime-vessel-archetypes-v1',
    'maritime-emissions-model-v1',
    'maritime.calibration.artifacts.v1',
    'maritime.voyage.scenarios.v1',
    'maritime.provenance.registry.v1',
  ]);

  function dep(globalName, path) {
    return typeof module === 'object' && module.exports ? require(path) : root[globalName];
  }

  async function activate({ sdk, config, profile, scenario }) {
    const engine = dep('MaritimeTradeEngine', './maritime-engine.js');
    const metricsApi = dep('MaritimeMetrics', './metrics.js');
    const presentationApi = dep('MaritimeTradePresentation', './presentation.js');
    const v4Api = dep('MaritimeTradeV4', './v4-contribution.js');
    if (![engine, metricsApi, presentationApi].every(Boolean)) throw new Error('maritime_plugin_dependency_missing');
    const datasets = loadDatasets(sdk);
    const routeObjective = profile?.routeObjective || {};
    let activeScenario = normalizeScenario(scenario, config);
    let result = run(activeScenario);
    sdk.state.register(reduce, initialState(result));
    appendActivationReceipts(result);

    function run(nextScenario) {
      return engine.runScenario({
        datasets,
        scenario: nextScenario,
        config,
        random: sdk.random,
        scheduler: sdk.scheduler,
        routeObjective,
      });
    }

    function appendActivationReceipts(value) {
      sdk.receipts.append({
        schema: 'simulatte.plugin.maritimeScenarioReceipt.v2',
        scenarioId: value.scenarioId,
        seed: value.seed,
        routeId: value.route.id,
        routeAlgorithm: value.route.algorithm,
        disruptionId: value.disruption.id,
        eventCount: value.eventTrace.length,
        representativeContainerCount: value.ledger.totalContainers,
        cargoTeu: value.parameters.cargoTeu,
        modelReceiptIds: value.modelReceipts.map((row) => row.id),
        datasetIdentities: Object.fromEntries(value.dataReceipts.map((row) => [row.datasetId, row.sha256])),
        truth: truth('derived', 'forecast', missing('Receipt identity is exact; model outputs retain their own uncertainty.')),
        claimBoundary: value.claimBoundary,
      });
      const coverage = provenanceCoverage(value, datasets.provenance);
      sdk.receipts.append({
        schema: 'simulatte.plugin.maritimeProvenanceCoverageReceipt.v1',
        scenarioId: value.scenarioId,
        ...coverage,
      });
    }

    function setScenario(nextScenario) {
      activeScenario = normalizeScenario(nextScenario, config);
      result = run(activeScenario);
      sdk.events.propose({
        pluginId: PLUGIN_ID,
        kind: `${PLUGIN_ID}.scenario-computed`,
        scenarioId: result.scenarioId,
        result,
      });
      appendActivationReceipts(result);
      return summary(result, 0);
    }

    function contributeRequest({ sourceText, mission = null }) {
      if (!/\b(?:maritime|shipping|container|port|suez|panama|vessel|ocean\s+freight|trade\s+corridor)\b/i.test(sourceText || '')) {
        return null;
      }
      if (!mission) return { recognized: true, obligations: [], unresolved: [] };
      const scenarioId = sdk.state.read().scenarioId;
      return {
        recognized: true,
        obligations: [
          { id: `${PLUGIN_ID}:voyage:${scenarioId}`, kind: 'causal_maritime_voyage', required: true },
          { id: `${PLUGIN_ID}:lineage:${scenarioId}`, kind: 'container_lineage', required: true },
          { id: `${PLUGIN_ID}:provenance:${scenarioId}`, kind: 'evidence_traceability', required: true },
          { id: `${PLUGIN_ID}:queue-uncertainty:${scenarioId}`, kind: 'stochastic_queue_uncertainty', required: true },
          { id: `${PLUGIN_ID}:emissions-sensitivity:${scenarioId}`, kind: 'emissions_parameter_sensitivity', required: true },
        ],
        unresolved: [],
      };
    }

    function handleAction(actionId, context = {}) {
      const values = context.values || {};
      if (actionId === 'scenario.run') {
        if (values.phase === 'start') setScenario(configuredScenario(values));
        return runPlayback(values.phase);
      }
      if (actionId === 'simulate.corridor') {
        setScenario(configuredScenario(values));
        return runPlayback(null);
      }
      if (actionId === 'counterfactual.compare') return compareBaseline();
      return { status: 'refused', reason: 'unknown_action', actionId };
    }

    function configuredScenario(values) {
      const vesselClassId = values.vesselClassId || activeScenario.vesselClassId;
      if (!datasets.vessels.archetypes.some((row) => row.id === vesselClassId)) {
        throw new Error(`maritime_control_invalid: unknown vesselClassId ${vesselClassId}`);
      }
      const speedPolicy = values.speedPolicy || activeScenario.speedPolicy;
      if (!['slow', 'service', 'fast'].includes(speedPolicy)) {
        throw new Error(`maritime_control_invalid: unknown speedPolicy ${speedPolicy}`);
      }
      const cargoTeu = integerControl(values.cargoTeu, activeScenario.cargoTeu, 100, 24000, 'cargoTeu');
      const ensembleReplicates = integerControl(values.ensembleReplicates, activeScenario.ensembleReplicates, 2, 512, 'ensembleReplicates');
      return normalizeScenario({ ...activeScenario, vesselClassId, speedPolicy, cargoTeu, ensembleReplicates }, config);
    }

    function runPlayback(phase) {
      const state = sdk.state.read();
      if (phase === 'start') {
        sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.playback-started` });
        return playbackAction(sdk.state.read());
      }
      if (phase === 'step') {
        if (state.playback.status !== 'running') return { status: 'refused', reason: 'playback_not_running' };
        const cursor = Math.min(state.result.snapshots.length - 1, state.playback.cursor + 1);
        sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.playback-advanced`, cursor });
        const nextState = sdk.state.read();
        if (nextState.playback.status === 'settled') appendCompletionReceipts(nextState.result);
        return playbackAction(nextState);
      }
      const finalCursor = state.result.snapshots.length - 1;
      sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.playback-completed`, cursor: finalCursor });
      appendCompletionReceipts(sdk.state.read().result);
      return playbackAction(sdk.state.read());
    }

    function compareBaseline() {
      const selected = sdk.state.read().result;
      const baselineScenarioId = engine.baselineScenario(selected.scenarioId);
      const baseline = run({
        ...selected.parameters,
        scenarioId: baselineScenarioId,
        id: baselineScenarioId,
        seed: selected.seed,
      });
      const selectedMetrics = metricsApi.values(selected.metrics);
      const baselineMetrics = metricsApi.values(baseline.metrics);
      const comparison = deepFreeze({
        schema: 'simulatte.maritimeComparison.v2',
        id: `${baselineScenarioId}:vs:${selected.scenarioId}`,
        baselineScenarioId,
        interventionScenarioId: selected.scenarioId,
        commonSeed: selected.seed,
        synchronizedClock: true,
        metrics: {
          transitDaysDelta: selectedMetrics.totalTransitDays - baselineMetrics.totalTransitDays,
          queueWaitHoursDelta: selectedMetrics.queueWaitHours - baselineMetrics.queueWaitHours,
          fuelTonsDelta: selectedMetrics.fuelTons - baselineMetrics.fuelTons,
          co2TonsDelta: selectedMetrics.co2Tons - baselineMetrics.co2Tons,
        },
        queueStochastic: {
          kind: 'distribution',
          method: 'common_random_numbers',
          baseline: quantiles(baseline.queueEnsemble),
          intervention: quantiles(selected.queueEnsemble),
          queueReplicates: selected.parameters.ensembleReplicates,
        },
        emissionsParameterSensitivity: {
          kind: 'parameter_sensitivity',
          probability: null,
          baseline: sensitivitySummary(baseline.emissions.parameterSensitivity),
          intervention: sensitivitySummary(selected.emissions.parameterSensitivity),
        },
        baseline,
        intervention: selected,
        truth: truth('derived', 'forecast', missing(
          'Composite comparison has no single uncertainty distribution; inspect queueStochastic and emissionsParameterSensitivity separately.'
        )),
        evidenceRefs: [
          ...selected.dataReceipts.map((row) => `dataset:${row.datasetId}`),
          ...selected.modelReceipts.map((row) => row.id),
        ],
      });
      sdk.events.propose({
        pluginId: PLUGIN_ID,
        kind: `${PLUGIN_ID}.comparison-computed`,
        comparison,
      });
      sdk.receipts.append({
        schema: 'simulatte.plugin.maritimeComparisonReceipt.v2',
        comparisonId: comparison.id,
        baselineScenarioId,
        interventionScenarioId: selected.scenarioId,
        commonSeed: selected.seed,
        synchronizedClock: true,
        metrics: comparison.metrics,
        queueStochastic: comparison.queueStochastic,
        emissionsParameterSensitivity: comparison.emissionsParameterSensitivity,
        truth: comparison.truth,
      });
      return {
        status: 'settled',
        comparison: comparison.metrics,
        comparisonId: comparison.id,
        comparisonBranches: {
          baseline: baselineMetrics,
          intervention: selectedMetrics,
        },
      };
    }

    function appendCompletionReceipts(value) {
      const metricValues = metricsApi.values(value.metrics);
      sdk.receipts.append({
        schema: 'simulatte.plugin.maritimeVoyageReceipt.v2',
        scenarioId: value.scenarioId,
        routeId: value.route.id,
        eventIds: value.eventTrace.map((row) => row.id),
        distanceNm: metricValues.distanceNm,
        transitDays: metricValues.totalTransitDays,
        queueWaitHours: metricValues.queueWaitHours,
        fuelTons: metricValues.fuelTons,
        co2Tons: metricValues.co2Tons,
        truth: value.route.truth,
        evidenceRefs: value.route.evidenceRefs,
        claimBoundary: value.claimBoundary,
      });
      sdk.receipts.append({
        schema: 'simulatte.plugin.maritimeQueueReceipt.v2',
        scenarioId: value.scenarioId,
        portId: value.queueEnsemble.portId,
        replicateCount: value.queueEnsemble.replicateCount,
        p05WaitHours: value.queueEnsemble.p05WaitHours,
        p50WaitHours: value.queueEnsemble.p50WaitHours,
        p95WaitHours: value.queueEnsemble.p95WaitHours,
        uncertaintyClass: value.queueEnsemble.uncertaintyClass,
        calibration: value.queueEnsemble.calibration,
        truth: value.queueEnsemble.truth,
        evidenceRefs: value.queueEnsemble.evidenceRefs,
      });
      sdk.receipts.append({
        schema: 'simulatte.plugin.containerLineageReceipt.v2',
        scenarioId: value.scenarioId,
        representativeContainerCount: value.ledger.totalContainers,
        deliveredCount: metricValues.containersDelivered,
        lineageEventCount: value.ledger.containers.reduce((sum, row) => sum + row.lineage.length, 0),
        eventIds: value.eventTrace.map((row) => row.id),
        truth: value.ledger.truth,
      });
      sdk.receipts.append({
        schema: 'simulatte.plugin.maritimeEmissionsReceipt.v2',
        scenarioId: value.scenarioId,
        fuelTons: value.emissions.fuelTons,
        co2Tons: value.emissions.co2Tons,
        intensityGCo2PerTeuNm: value.emissions.intensityGCo2PerTeuNm,
        method: value.emissions.method,
        equations: value.emissions.equations,
        parameters: value.emissions.parameters,
        truth: value.emissions.truth,
        evidenceRefs: value.emissions.evidenceRefs,
      });
      sdk.receipts.append({
        schema: 'simulatte.plugin.maritimeEmissionsSensitivityReceipt.v1',
        scenarioId: value.scenarioId,
        ...sensitivitySummary(value.emissions.parameterSensitivity),
        cases: value.emissions.parameterSensitivity.cases,
        probability: null,
        confidenceLevel: null,
        samplingDistribution: null,
        truth: truth('scenario', 'forecast', missing(
          'Deterministic parameter cases do not define a probability or confidence interval.'
        )),
        evidenceRefs: value.emissions.parameterSensitivity.evidenceRefs,
      });
    }

    function settle() {
      const state = sdk.state.read();
      const current = snapshot(state);
      const isComplete = state.playback.status === 'settled'
        && current.cursor === state.result.snapshots.length - 1
        && current.status === 'settled';
      const minimumLineage = Math.min(...state.result.ledger.containers.map((row) => row.lineage.length));
      const provenance = provenanceCoverage(state.result, datasets.provenance);
      return {
        obligationResults: [
          {
            obligationId: `${PLUGIN_ID}:voyage:${state.scenarioId}`,
            status: isComplete ? 'settled' : 'unmet',
            evidence: {
              currentEventId: current.currentEventId,
              processedEventCount: current.cursor,
              expectedEventCount: state.result.eventTrace.length,
            },
          },
          {
            obligationId: `${PLUGIN_ID}:lineage:${state.scenarioId}`,
            status: isComplete && minimumLineage >= 4 ? 'settled' : 'unmet',
            evidence: { minimumLineageEvents: minimumLineage },
          },
          {
            obligationId: `${PLUGIN_ID}:provenance:${state.scenarioId}`,
            status: provenance.unresolvedReferenceCount === 0 ? 'settled' : 'unmet',
            evidence: provenance,
          },
          {
            obligationId: `${PLUGIN_ID}:queue-uncertainty:${state.scenarioId}`,
            status: state.result.queueEnsemble.uncertaintyClass === 'stochastic_simulation'
              && state.result.queueEnsemble.truth.uncertainty.kind === 'distribution'
              ? 'settled'
              : 'unmet',
            evidence: {
              uncertaintyClass: state.result.queueEnsemble.uncertaintyClass,
              quantiles: quantiles(state.result.queueEnsemble),
              calibrationStatus: state.result.queueEnsemble.calibration.status,
            },
          },
          {
            obligationId: `${PLUGIN_ID}:emissions-sensitivity:${state.scenarioId}`,
            status: state.result.emissions.truth.uncertainty.kind === 'missing'
              && state.result.emissions.parameterSensitivity.kind === 'parameter_sensitivity'
              ? 'settled'
              : 'unmet',
            evidence: sensitivitySummary(state.result.emissions.parameterSensitivity),
          },
        ],
        stateIdentity: `${state.scenarioId}:event-${current.cursor}:${state.playback.status}`,
        losses: isComplete ? [] : [{
          kind: 'playback_incomplete',
          processedEventCount: current.cursor,
          expectedEventCount: state.result.eventTrace.length,
        }],
      };
    }

    function view() {
      const state = sdk.state.read();
      const current = snapshot(state);
      const values = metricsApi.values(state.result.metrics);
      const comparison = state.comparison;
      return [
        {
          slot: 'inspector',
          title: 'Maritime voyage model',
          rows: [
            { label: 'Scenario', value: state.result.route.name },
            { label: 'Progress', value: `${Math.round(current.progressFraction * 100)}% · ${current.status}` },
            { label: 'Current event', value: current.currentEventId || 'Ready' },
            { label: 'Route model', value: state.result.route.algorithm },
            { label: 'Transit', value: `${values.totalTransitDays.toFixed(2)} modeled days` },
            { label: 'Queue p05 / p50 / p95', value: `${state.result.queueEnsemble.p05WaitHours.toFixed(1)} / ${state.result.queueEnsemble.p50WaitHours.toFixed(1)} / ${state.result.queueEnsemble.p95WaitHours.toFixed(1)} h` },
            { label: 'Queue evidence', value: `Seeded stochastic ensemble · ${state.result.queueEnsemble.calibration.status.replaceAll('_', ' ')}` },
            { label: 'Cargo', value: `${values.cargoTeu.toLocaleString()} scenario TEU` },
            { label: 'Fuel / CO2e', value: `${values.fuelTons.toFixed(0)} / ${values.co2Tons.toFixed(0)} modeled t` },
            { label: 'CO2e sensitivity low / base / high', value: sensitivityLabel(state.result.emissions.parameterSensitivity) },
            { label: 'CO2e intensity', value: `${values.intensityGCo2PerTeuNm.toFixed(2)} g/TEU-NM` },
            ...(comparison ? [{ label: 'Compared transit delta', value: `${comparison.metrics.transitDaysDelta.toFixed(2)} days` }] : []),
          ],
          fields: [
            {
              id: 'vesselClassId',
              label: 'Vessel archetype',
              type: 'select',
              value: state.result.parameters.vesselClassId,
              options: state.result.controls.find((row) => row.id === 'vesselClassId').options,
            },
            {
              id: 'speedPolicy',
              label: 'Speed policy',
              type: 'select',
              value: state.result.parameters.speedPolicy,
              options: state.result.controls.find((row) => row.id === 'speedPolicy').options,
            },
            { id: 'cargoTeu', label: 'Scenario cargo TEU', type: 'number', value: state.result.parameters.cargoTeu },
            { id: 'ensembleReplicates', label: 'Queue ensemble runs', type: 'number', value: state.result.parameters.ensembleReplicates },
          ],
          actions: [],
        },
        {
          slot: 'hud',
          title: 'Truth boundary',
          rows: [
            { label: 'Observed', value: 'Pinned port identities and coordinates' },
            { label: 'Modeled', value: 'Corridors, queue priors, vessel, fuel, emissions' },
            { label: 'Simulated', value: `${state.result.eventTrace.length} causal events · ${state.result.parameters.ensembleReplicates} queue runs` },
            { label: 'Not claimed', value: 'AIS, carrier schedule, booking, navigation, operational ETA' },
          ],
          actions: [],
        },
      ];
    }

    function present() {
      const state = sdk.state.read();
      return presentationApi.createPresentation(datasets.ports, state.result, snapshot(state));
    }

    function semanticPresentation() {
      const state = sdk.state.read();
      return presentationApi.createSemanticPresentation(datasets.ports, state.result, snapshot(state));
    }

    function contributeV4() {
      const state = sdk.state.read();
      return v4Api.createContribution({
        portsData: datasets.ports,
        result: state.result,
        snapshot: snapshot(state),
        dataReceipts: datasets.dataReceipts,
      });
    }

    const capabilities = Object.freeze({
      'simulation.maritime-logistics.v1': (input = {}) => capabilityResult(input),
      'field.ocean-freight.v1': () => {
        const state = sdk.state.read();
        return {
          schema: 'field.ocean-freight.v1',
          value: state.result.metrics.totalTransitDays.value,
          units: 'days',
          providerId: PLUGIN_ID,
          truth: state.result.metrics.totalTransitDays.truth,
          evidenceRefs: state.result.metrics.totalTransitDays.evidenceRefs,
        };
      },
      'simulation.maritime-trade.v1': (input = {}) => capabilityResult(input),
      'field.maritime-emissions.v1': () => sdk.state.read().result.emissions,
    });

    function capabilityResult(input) {
      const state = sdk.state.read();
      if (input?.kind === 'semantic_presentation') return semanticPresentation();
      if (input?.kind === 'events') return state.result.eventTrace;
      if (input?.kind === 'snapshot') {
        const cursor = Math.max(0, Math.min(state.result.snapshots.length - 1, Number(input.cursor || 0)));
        return state.result.snapshots[cursor];
      }
      return {
        result: state.result,
        currentSnapshot: snapshot(state),
        semanticPresentation: semanticPresentation(),
        comparison: state.comparison,
      };
    }

    return Object.freeze({
      id: PLUGIN_ID,
      contributeRequest,
      setScenario,
      handleAction,
      settle,
      view,
      present,
      contributeV4,
      reduce,
      capabilities,
      dispose() {},
    });
  }

  function loadDatasets(sdk) {
    const dataReceipts = DATASET_IDS.map((datasetId) => {
      const receipt = sdk.datasets.receipt(datasetId);
      return Object.freeze({
        datasetId,
        sha256: receipt?.sha256 || null,
        schemaId: receipt?.schemaId || null,
      });
    });
    return Object.freeze({
      ports: sdk.datasets.require('global-port-registry-wpi-v1'),
      corridors: sdk.datasets.require('global-maritime-corridors-v1'),
      canals: sdk.datasets.require('global-canal-service-models-v1'),
      portPerformance: sdk.datasets.require('container-port-performance-v1'),
      cyclones: sdk.datasets.require('ibtracs-v04r01-scenario-tracks-v1'),
      vessels: sdk.datasets.require('maritime-vessel-archetypes-v1'),
      emissionsModel: sdk.datasets.require('maritime-emissions-model-v1'),
      calibration: sdk.datasets.require('maritime.calibration.artifacts.v1'),
      scenarioCatalog: sdk.datasets.require('maritime.voyage.scenarios.v1'),
      provenance: sdk.datasets.require('maritime.provenance.registry.v1'),
      dataReceipts: Object.freeze(dataReceipts),
    });
  }

  function normalizeScenario(value, config) {
    if (typeof value === 'string') return Object.freeze({ id: value, scenarioId: value, seed: value });
    const id = value?.scenarioId || value?.id || config.defaultScenarioId;
    return Object.freeze({
      ...value,
      id,
      scenarioId: id,
      seed: value?.seed || id,
      vesselClassId: value?.vesselClassId || config.defaultVesselClass,
      speedPolicy: value?.speedPolicy || config.defaultSpeedPolicy,
      cargoTeu: numberOr(value?.cargoTeu, config.cargoTeu),
      ensembleReplicates: numberOr(value?.ensembleReplicates, config.ensembleReplicates),
    });
  }

  function initialState(result) {
    return {
      scenarioId: result.scenarioId,
      result,
      playback: { status: 'ready', cursor: 0 },
      comparison: null,
      lastAction: 'activated',
    };
  }

  function reduce(state, event) {
    if (event.kind === `${PLUGIN_ID}.scenario-computed`) {
      return {
        ...state,
        scenarioId: event.scenarioId,
        result: event.result,
        playback: { status: 'ready', cursor: 0 },
        comparison: null,
        lastAction: 'scenario',
      };
    }
    if (event.kind === `${PLUGIN_ID}.playback-started`) {
      return { ...state, playback: { status: 'running', cursor: 0 }, lastAction: 'scenario.run' };
    }
    if (event.kind === `${PLUGIN_ID}.playback-advanced`) {
      const finalCursor = state.result.snapshots.length - 1;
      return {
        ...state,
        playback: {
          status: event.cursor === finalCursor ? 'settled' : 'running',
          cursor: event.cursor,
        },
        lastAction: 'scenario.step',
      };
    }
    if (event.kind === `${PLUGIN_ID}.playback-completed`) {
      return {
        ...state,
        playback: { status: 'settled', cursor: event.cursor },
        lastAction: 'scenario.run.compatibility',
      };
    }
    if (event.kind === `${PLUGIN_ID}.comparison-computed`) {
      return { ...state, comparison: event.comparison, lastAction: 'counterfactual.compare' };
    }
    return state;
  }

  function snapshot(state) {
    return state.result.snapshots[state.playback.cursor];
  }

  function playbackAction(state) {
    const current = snapshot(state);
    return {
      status: state.playback.status === 'settled' ? 'settled' : 'running',
      currentStep: state.playback.cursor,
      totalSteps: state.result.snapshots.length - 1,
      currentEventId: current.currentEventId,
      simulationTimeHours: current.timeHours,
      progressFraction: current.progressFraction,
      viewIntents: state.result
        ? depPresentationViewIntents(state.result, current)
        : [],
    };
  }

  function depPresentationViewIntents(result, current) {
    const mode = current.status === 'configured'
      ? 'overview'
      : ['queued', 'berthing', 'discharged', 'settled'].includes(current.status)
        ? 'pov'
        : 'follow';
    return [{
      schema: 'simulatte.viewIntent.v4',
      mode,
      targetIds: [mode === 'overview' ? 'maritime-network' : mode === 'pov' ? result.route.destinationPort : `voyage:${result.scenarioId}`],
      transitionReason: current.currentEventId ? `simulation_event:${current.currentEventId}` : 'scenario_ready',
      priority: 40,
      expiresAtEventId: result.eventTrace[current.cursor + 1]?.id || null,
      mayInterruptManualOverride: false,
    }];
  }

  function summary(result, cursor) {
    const current = result.snapshots[cursor];
    return {
      scenarioId: result.scenarioId,
      routeId: result.route.id,
      eventCount: result.eventTrace.length,
      state: current.status,
      progressFraction: current.progressFraction,
    };
  }

  function provenanceCoverage(result, registry) {
    const references = [
      ...result.eventTrace.flatMap((row) => row.evidenceRefs),
      ...result.modelReceipts.flatMap((row) => row.calibration.evidenceRefs),
      ...result.dataReceipts.map((row) => `dataset:${row.datasetId}`),
    ];
    const datasetIds = new Set([
      ...(registry?.datasets || []).map((row) => row.id),
      ...result.dataReceipts.map((row) => row.datasetId),
    ]);
    const modelIds = new Set(result.modelReceipts.map((row) => row.id));
    const sourceIds = new Set((registry?.sources || []).map((row) => row.id));
    const eventIds = new Set(result.eventTrace.map((row) => `event:${row.id}`));
    const resolves = (reference) => {
      if (!reference || reference.includes(':null')) return false;
      if (reference.startsWith('dataset:')) return datasetIds.has(reference.slice('dataset:'.length));
      if (reference.startsWith('row:')) {
        return [...datasetIds].some((datasetId) => reference.startsWith(`row:${datasetId}:`));
      }
      if (reference.startsWith('model:')) return modelIds.has(reference);
      if (reference.startsWith('source:')) return sourceIds.has(reference);
      if (reference.startsWith('event:')) return eventIds.has(reference);
      return false;
    };
    const unresolved = references.filter((row) => !resolves(row));
    return {
      referenceCount: references.length,
      uniqueReferenceCount: new Set(references).size,
      unresolvedReferenceCount: unresolved.length,
      datasetHashCount: result.dataReceipts.filter((row) => /^[a-f0-9]{64}$/.test(row.sha256 || '')).length,
      expectedDatasetHashCount: result.dataReceipts.length,
    };
  }

  function quantiles(queue) {
    return deepFreeze({
      p05WaitHours: queue.p05WaitHours,
      p50WaitHours: queue.p50WaitHours,
      p95WaitHours: queue.p95WaitHours,
    });
  }

  function sensitivitySummary(sensitivity) {
    return deepFreeze({
      sensitivityId: sensitivity.id,
      kind: sensitivity.kind,
      method: sensitivity.method,
      baselineCo2Tons: sensitivity.baselineCo2Tons,
      minimumCo2Tons: sensitivity.minimumCo2Tons,
      maximumCo2Tons: sensitivity.maximumCo2Tons,
      interpretation: sensitivity.interpretation,
    });
  }

  function sensitivityLabel(sensitivity) {
    return `${sensitivity.minimumCo2Tons.toFixed(0)} / ${sensitivity.baselineCo2Tons.toFixed(0)} / ${sensitivity.maximumCo2Tons.toFixed(0)} modeled t · not probabilistic`;
  }

  function numberOr(value, fallback) {
    return value === undefined || value === null || value === '' ? fallback : Number(value);
  }

  function integerControl(value, fallback, minimum, maximum, label) {
    const parsed = numberOr(value, fallback);
    if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
      throw new Error(`maritime_control_invalid: ${label} must be an integer from ${minimum} to ${maximum}`);
    }
    return parsed;
  }

  function missing(reason) {
    return { kind: 'missing', value: { reason } };
  }

  function truth(origin, temporalStatus, uncertainty) {
    return deepFreeze({ origin, temporalStatus, uncertainty });
  }

  function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.values(value).forEach((row) => deepFreeze(row, seen));
    return Object.freeze(value);
  }

  const datasetValidators = Object.freeze({
    'simulatte.maritimePortRegistry.v1': (value) => {
      if (!Array.isArray(value?.ports) || value.ports.length < 2) throw new Error('maritime_port_registry_incomplete');
      return value;
    },
    'simulatte.maritimeCorridors.v1': (value) => {
      if (!Array.isArray(value?.corridors) || !value.corridors.length) throw new Error('maritime_corridors_missing');
      return value;
    },
    'simulatte.canalServiceModels.v1': (value) => value,
    'simulatte.containerPortPerformance.v1': (value) => value,
    'simulatte.ibtracsScenarioTracks.v1': (value) => value,
    'simulatte.maritimeVesselArchetypes.v1': (value) => {
      if (!Array.isArray(value?.archetypes) || !value.archetypes.length) throw new Error('maritime_vessel_archetypes_missing');
      return value;
    },
    'simulatte.maritimeEmissionsModel.v1': (value) => value,
    'simulatte.maritimeCalibrationArtifacts.v1': (value) => {
      if (value?.queueCalibration?.status !== 'not_empirically_calibrated'
        || value?.emissionsSensitivity?.interpretation?.kind !== 'parameter_sensitivity') {
        throw new Error('maritime_calibration_artifacts_invalid');
      }
      return value;
    },
    'simulatte.maritimeVoyageScenarios.v1': (value) => {
      if (!Array.isArray(value?.scenarios) || value.scenarios.length < 5) throw new Error('maritime_voyage_scenarios_invalid');
      return value;
    },
    'simulatte.maritimeProvenanceRegistry.v1': (value) => {
      if (!Array.isArray(value?.datasets) || !Array.isArray(value?.sources)) throw new Error('maritime_provenance_registry_invalid');
      return value;
    },
  });

  return Object.freeze({ activate, datasetValidators });
});
