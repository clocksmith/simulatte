(function attachSafetyExplorerPlugin(root, factory) {
  const v4 = typeof module === 'object' && module.exports
    ? require('./v4-contribution.js')
    : root.SimulatteSafetyExplorerV4;
  const shrinkage = typeof module === 'object' && module.exports
    ? require('./fixed-sparse-count-shrinkage.js')
    : root.SimulatteFixedSparseCountShrinkage;
  const api = factory(v4, shrinkage);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginSafetyExplorer = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSafetyExplorerPlugin(v4, shrinkage) {
  const PLUGIN_ID = 'safety-explorer';

  async function activate({ sdk, config, scenario = null }) {
    let activeParameters = shrinkage.parameters(config?.fixedSparseCountShrinkage);
    let activeScenario = scenario;
    sdk.state.register(reduce, {
      audit: null,
      parameters: activeParameters,
      playback: { status: 'ready', step: 0 },
    });
    const index = sdk.datasets.require('nyc-crash-history-2025-07-to-2026-07-v1');
    const rows = new Map(index.segmentRows.map((row) => [row.segmentId, row]));

    function currentMethod() {
      return shrinkage.methodReceipt(index.segmentRows, activeParameters);
    }

    function segmentReceipt(segmentId) {
      const row = rows.get(segmentId) || null;
      const method = currentMethod();
      const observation = shrinkage.observation(row, index);
      return Object.freeze({
        schema: 'simulatte.safetyExplorerSegmentEvidence.v1',
        segmentId,
        physicalKey: row?.physicalKey || null,
        sourceRowId: row ? `${index.id}:segment:${row.segmentId}` : null,
        ...observation,
        historicalObservationScore: row?.historicalObservationScore ?? null,
        fixedSparseCountEstimate: row
          ? number(shrinkage.estimate(row, { ...activeParameters, corpusMean: method.corpusMean }))
          : null,
        evidenceCoverage: number(shrinkage.evidenceCoverage(row, activeParameters.k)),
        sensitivity: shrinkage.sensitivity(row, index.segmentRows, activeParameters),
      });
    }

    function createRouteContributor() {
      return {
        id: 'safety-explorer:historical-observation',
        costDimensionIds: Object.freeze(['historicalObservation', 'severityWeightedObservation']),
        canRejectSegments: false,
        evaluateSegment({ segment }) {
          const row = rows.get(segment.id);
          const receipt = segmentReceipt(segment.id);
          return {
            eligible: true,
            costDimensions: {
              historicalObservation: row?.historicalObservationScore || 0,
              // No joined observations is neutral. It is not substituted with the
              // corpus mean because missing evidence is not evidence of either safety
              // or danger.
              severityWeightedObservation: receipt.fixedSparseCountEstimate || 0,
            },
            rejectionReasons: [],
            receipt,
          };
        },
        evaluateRoute({ route }) {
          return auditRoute(route.segmentIds);
        },
      };
    }

    function auditRoute(segmentIds) {
      const physical = new Map();
      segmentIds.forEach((id) => { const row = rows.get(id); if (row && !physical.has(row.physicalKey)) physical.set(row.physicalKey, row); });
      const values = [...physical.values()];
      const segmentEvidence = segmentIds.map(segmentReceipt);
      const method = currentMethod();
      const audit = {
        schema: 'simulatte.plugin.safetyExplorerRouteAudit.v2',
        crashCount: sum(values, 'crashCount'), injuryCount: sum(values, 'injuryCount'), fatalityCount: sum(values, 'fatalityCount'),
        historicalObservationScore: sum(values, 'historicalObservationScore'), physicalSegmentsWithHistory: values.length,
        fixedSparseCountEstimate: number(values.reduce((total, row) => total + shrinkage.estimate(row, { ...activeParameters, corpusMean: method.corpusMean }), 0)),
        segmentIds: [...segmentIds],
        segmentEvidence,
        sourcePeriod: {
          start: index.source.periodStart,
          endExclusive: index.source.periodEndExclusive,
        },
        joinMethod: {
          id: index.method.id,
          maximumJoinDistanceM: index.method.maximumJoinDistanceM,
          routeMaximumJoinDistanceM: values.length ? Math.max(...values.map((row) => row.maximumJoinDistanceM || 0)) : null,
        },
        unmatchedSourceCollisionIds: index.unjoinedCollisionIds.slice(),
        method,
        exposureStatus: 'unknown',
        unknownSegmentCount: segmentEvidence.filter((row) => row.observationStatus !== 'reported_history').length,
        indexId: index.id,
        claimBoundary: index.claimBoundary,
      };
      sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.route-audited`, audit });
      sdk.receipts.append(audit);
      return audit;
    }

    function view() {
      const audit = sdk.state.read().audit;
      if (!audit) return null;
      return [
        {
          slot: 'inspector',
          title: 'Historical street observations',
          rows: [
            { label: 'Recorded crashes', value: String(audit.crashCount) },
            { label: 'Recorded injuries', value: String(audit.injuryCount) },
            { label: 'Recorded fatalities', value: String(audit.fatalityCount) },
            { label: 'Observation period', value: `${audit.sourcePeriod.start} to ${audit.sourcePeriod.endExclusive} (exclusive)` },
            { label: 'Fixed sparse-count estimate', value: audit.fixedSparseCountEstimate.toFixed(4) },
            { label: 'Method', value: `K=${audit.method.k}; mean=${audit.method.corpusMean}; weights ${weightsText(audit.method.severityWeights)}` },
            { label: 'Unknown exposure', value: `${audit.unknownSegmentCount} route segments lack joined observations; no segment has an exposure denominator.` },
            { label: 'Join evidence', value: `${audit.unmatchedSourceCollisionIds.length} source crashes unmatched; route max ${audit.joinMethod.routeMaximumJoinDistanceM ?? 'n/a'} m.` },
            { label: 'Claim warning', value: 'Reported history and fixed shrinkage do not identify a safest route.' },
          ],
          fields: sensitivityFields(audit.method),
          actions: [],
        },
      ];
    }
    function present() {
      const audit = sdk.state.read().audit;
      if (!audit?.segmentIds?.length) return null;
      const observedIds = audit.segmentEvidence.filter((row) => row.observationStatus === 'reported_history').map((row) => row.segmentId);
      const unknownIds = audit.segmentEvidence.filter((row) => row.observationStatus !== 'reported_history').map((row) => row.segmentId);
      const paths = [];
      if (observedIds.length) {
        paths.push({
          id: 'observed-route',
          label: 'Route segments with reported crash history',
          segmentIds: observedIds,
          tone: audit.fatalityCount ? 'red' : 'amber',
          widthM: 4,
          intensity: 1,
        });
      }
      if (unknownIds.length) {
        paths.push({
          id: 'unknown-observation-route',
          label: 'Unknown exposure and no joined crash observation',
          segmentIds: unknownIds,
          tone: 'gray',
          widthM: 3,
          intensity: 0.45,
        });
      }
      return {
        schema: 'simulatte.pluginPresentation.v1',
        markers: [],
        actors: [],
        paths,
        cameraTargets: [{
          id: 'observed-route',
          label: 'Historical observation route',
          nodeIds: [],
          segmentIds: audit.segmentIds,
          distanceM: 1100,
        }],
      };
    }
    function contributeV4() {
      return v4.createContribution({
        audit: sdk.state.read().audit,
        playback: sdk.state.read().playback,
        index,
        datasetReceipt: sdk.datasets.receipt('nyc-crash-history-2025-07-to-2026-07-v1'),
        parameters: activeParameters,
      });
    }

    function handleAction(actionId, context = {}) {
      if (actionId === 'scenario.run') {
        if (context.values?.phase === 'start') applySensitivity(context.values || {});
        let audit = sdk.state.read().audit;
        const hadAudit = Boolean(audit);
        if (!audit && context.values?.phase === 'start') {
          activeScenario = context.scenario || activeScenario;
          const mission = sdk.routing.resolveMission(activeScenario?.missionText || '');
          const [route] = sdk.routing.alternatives(mission, 1);
          if (route) createRouteContributor().evaluateRoute({ route });
          audit = sdk.state.read().audit;
        }
        if (!audit) return { status: 'refused', reason: 'route_audit_missing' };
        if (hadAudit && context.values?.phase === 'start' && audit.segmentIds?.length) audit = auditRoute(audit.segmentIds);
        const phase = context.values?.phase;
        if (phase === 'start') {
          sdk.events.propose({
            pluginId: PLUGIN_ID,
            kind: `${PLUGIN_ID}.analysis-started`,
            auditId: audit.indexId,
          });
          return playbackAction(sdk.state.read());
        }
        if (phase === 'step') {
          const playback = sdk.state.read().playback;
          if (playback.status !== 'running') {
            return { status: 'refused', reason: 'analysis_not_running' };
          }
          const nextStep = Math.min(3, playback.step + 1);
          const stage = ['route-resolved', 'observations-joined', 'estimate-derived'][nextStep - 1];
          sdk.events.propose({
            pluginId: PLUGIN_ID,
            kind: `${PLUGIN_ID}.${stage}`,
            step: nextStep,
            auditId: audit.indexId,
          });
          return playbackAction(sdk.state.read());
        }
        sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.analysis-started`, auditId: audit.indexId });
        for (let step = 1; step <= 3; step += 1) {
          const stage = ['route-resolved', 'observations-joined', 'estimate-derived'][step - 1];
          sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.${stage}`, step, auditId: audit.indexId });
        }
        return { ...playbackAction(sdk.state.read()), compatibilityAdapter: 'eager-analysis-playback' };
      }
      if (actionId === 'counterfactual.compare') {
        const audit = sdk.state.read().audit;
        if (!audit) return { status: 'refused', reason: 'route_audit_missing' };
        const routeRows = audit.segmentIds.map((id) => rows.get(id)).filter(Boolean);
        const baselineParameters = activeParameters;
        const interventionParameters = shrinkage.parameters({
          ...baselineParameters,
          k: Math.min(64, Math.max(1, baselineParameters.k * 2)),
        });
        const score = (parameters) => {
          const method = shrinkage.methodReceipt(index.segmentRows, parameters);
          return routeRows.reduce((total, row) => (
            total + shrinkage.estimate(row, { ...parameters, corpusMean: method.corpusMean })
          ), 0);
        };
        return {
          status: 'settled',
          comparisonId: `${PLUGIN_ID}:fixed-shrinkage-k-sensitivity`,
          comparisonBranches: {
            baseline: {
              fixedSparseCountEstimate: score(baselineParameters),
              shrinkageK: baselineParameters.k,
            },
            intervention: {
              fixedSparseCountEstimate: score(interventionParameters),
              shrinkageK: interventionParameters.k,
            },
          },
        };
      }
      if (actionId !== 'sensitivity.apply') return { status: 'refused', reason: 'unknown_action' };
      applySensitivity(context.values || {});
      const audit = sdk.state.read().audit;
      if (audit?.segmentIds?.length) auditRoute(audit.segmentIds);
      return {
        status: 'settled',
        parameters: activeParameters,
        audit: sdk.state.read().audit,
      };
    }

    function applySensitivity(values) {
      activeParameters = shrinkage.parameters({
        k: values.shrinkageK ?? activeParameters.k,
        weights: {
          crash: values.crashWeight ?? activeParameters.weights.crash,
          injury: values.injuryWeight ?? activeParameters.weights.injury,
          fatality: values.fatalityWeight ?? activeParameters.weights.fatality,
        },
      });
      sdk.events.propose({
        pluginId: PLUGIN_ID,
        kind: `${PLUGIN_ID}.sensitivity-updated`,
        parameters: activeParameters,
      });
    }

    // Legacy capability name is preserved for compatibility. Its value is explicitly a
    // derived fixed sparse-count observation, never an observed or predictive risk.
    const capabilities = {
      'field.mobility-risk.v1': (input) => {
        const row = input?.segmentId ? rows.get(input.segmentId) : null;
        const method = currentMethod();
        const evidence = segmentReceipt(input?.segmentId || 'unknown');
        return {
          schema: 'field.mobility-risk.v1',
          value: row ? number(shrinkage.estimate(row, { ...activeParameters, corpusMean: method.corpusMean })) : null,
          units: 'fixed_sparse_count_observation',
          method: method.name,
          methodReceipt: method,
          observation: evidence,
          evidenceCoverage: evidence.evidenceCoverage,
          observed: false,
          truth: {
            origin: row ? 'derived' : 'scenario',
            temporalStatus: 'historical',
            uncertainty: {
              kind: 'missing',
              value: { exposureDenominator: 'missing', observationStatus: evidence.observationStatus },
            },
          },
          providerId: PLUGIN_ID,
          claimBoundary: index.claimBoundary,
        };
      },
    };
    function setScenario(nextScenario) {
      activeScenario = nextScenario;
      sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.scenario-selected`, scenario: nextScenario });
      return { status: 'ready', seed: nextScenario?.seed || null };
    }
    function settle() {
      const audit = sdk.state.read().audit;
      if (!audit) return null;
      return {
        obligationResults: [
          {
            obligationId: `${PLUGIN_ID}:observations-preserved`,
            status: audit.segmentEvidence?.length === audit.segmentIds?.length ? 'settled' : 'unmet',
            evidence: {
              routeSegmentCount: audit.segmentIds?.length || 0,
              segmentEvidenceCount: audit.segmentEvidence?.length || 0,
            },
          },
          {
            obligationId: `${PLUGIN_ID}:unknown-exposure-disclosed`,
            status: audit.exposureStatus === 'unknown' ? 'settled' : 'unmet',
            evidence: {
              exposureStatus: audit.exposureStatus,
              unknownSegmentCount: audit.unknownSegmentCount,
              unmatchedSourceCollisionCount: audit.unmatchedSourceCollisionIds?.length || 0,
            },
          },
        ],
        stateIdentity: `${activeScenario?.id || 'scenario'}:${activeScenario?.seed || 'seed'}:${audit.indexId}`,
        losses: [],
      };
    }
    return Object.freeze({
      id: PLUGIN_ID,
      contributeV4,
      createRouteContributor,
      view,
      present,
      handleAction,
      setScenario,
      settle,
      capabilities,
      dispose() {},
    });
  }
  function reduce(state, event) {
    if (event.kind === `${PLUGIN_ID}.scenario-selected`) {
      return { ...state, audit: null, playback: { status: 'ready', step: 0 } };
    }
    if (event.kind === `${PLUGIN_ID}.route-audited`) return { ...state, audit: event.audit };
    if (event.kind === `${PLUGIN_ID}.sensitivity-updated`) return { ...state, parameters: event.parameters };
    if (event.kind === `${PLUGIN_ID}.analysis-started`) {
      return { ...state, playback: { status: 'running', step: 0 } };
    }
    if ([
      `${PLUGIN_ID}.route-resolved`,
      `${PLUGIN_ID}.observations-joined`,
      `${PLUGIN_ID}.estimate-derived`,
    ].includes(event.kind)) {
      return {
        ...state,
        playback: {
          status: event.step >= 3 ? 'settled' : 'running',
          step: event.step,
        },
      };
    }
    return state;
  }
  function playbackAction(state) {
    return {
      status: state.playback.status === 'settled' ? 'settled' : 'running',
      currentStep: state.playback.step,
      totalSteps: 3,
      simulationTimeMs: state.playback.step * 1000,
      audit: state.audit,
      interactionKind: 'historical-evidence-analysis',
    };
  }
  function sum(rows, key) { return Number(rows.reduce((total, row) => total + (row[key] || 0), 0).toFixed(6)); }
  function number(value) { return value === null ? null : Number(value.toFixed(6)); }
  function weightsText(weights) { return `crash ${weights.crash}, injury ${weights.injury}, fatality ${weights.fatality}`; }
  function sensitivityFields(method) {
    return [
      { id: 'shrinkageK', label: 'Shrinkage K', type: 'number', value: String(method.k) },
      { id: 'crashWeight', label: 'Crash weight', type: 'number', value: String(method.severityWeights.crash) },
      { id: 'injuryWeight', label: 'Injury weight', type: 'number', value: String(method.severityWeights.injury) },
      { id: 'fatalityWeight', label: 'Fatality weight', type: 'number', value: String(method.severityWeights.fatality) },
    ];
  }
  return Object.freeze({ activate });
});
