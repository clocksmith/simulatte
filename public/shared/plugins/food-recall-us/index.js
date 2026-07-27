(function attachFoodRecallPlugin(root, factory) {
  const engine = typeof module === 'object' && module.exports ? require('./food-engine.js') : root.SimulatteFoodRecallEngine;
  const presentation = typeof module === 'object' && module.exports ? require('./food-presentation.js') : root.SimulatteFoodRecallPresentation;
  const v4 = typeof module === 'object' && module.exports ? require('./v4-contribution.js') : root.SimulatteFoodRecallV4;
  const inputContext = typeof module === 'object' && module.exports ? require('./input-context.js') : root.SimulatteFoodRecallInputContext;
  const api = factory(engine, presentation, v4, inputContext);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginFoodRecallUs = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createFoodRecallPlugin(engine, presentation, v4, inputContextApi) {
  const PLUGIN_ID = 'food-recall-us';

  async function activate({ sdk, config, scenario = null }) {
    // 1. Require + compile governed datasets.
    const facilities = sdk.datasets.require('us.food.facilities.synthetic.v1').facilities;
    const corridors = sdk.datasets.require('us.food.freight-corridors.v1').corridors;
    const products = sdk.datasets.require('us.food.commodity-profiles.v1').products;
    const hazards = sdk.datasets.require('us.food.hazard-model-registry.v1');
    const consumerZones = sdk.datasets.require('us.food.consumer-zones.v1');
    const environmentDataset = sdk.datasets.require('us.environment.snapshot.v1');
    const datasetReceipts = ['us.food.facilities.synthetic.v1', 'us.food.freight-corridors.v1', 'us.food.commodity-profiles.v1', 'us.food.hazard-model-registry.v1', 'us.food.consumer-zones.v1', 'us.environment.snapshot.v1']
      .map((id) => ({ id, sha256: sdk.datasets.receipt(id)?.sha256 || null }));
    const model = engine.compileModel({ facilities, corridors, products, hazards, consumerZones });
    const scenariosById = new Map(config.scenarios.map((row) => [row.id, row]));

    function resolveScenario(seedRow) {
      const scenarioId = seedRow?.scenarioId || config.defaultScenarioId;
      const spec = scenariosById.get(scenarioId);
      if (!spec) throw new Error(`food-recall-us has no scenario ${scenarioId}`);
      return seedRow?.seed ? { ...spec, seed: seedRow.seed } : spec;
    }

    // 2. Resolve immutable host fields before running. Optional capability failures
    // are classified inside the plugin-local adapter and never silently ignored.
    function run(spec, intervention) {
      const inputs = inputContextApi.resolve({ sdk, model, scenario: spec, environmentDataset });
      const result = engine.runScenario({
        model,
        scenario: spec,
        random: sdk.random,
        scheduler: sdk.scheduler,
        intervention,
        inputContext: inputs,
      });
      // Order the run's events through the shared scheduler so the event-chain hash is
      // reproducible (stable (time, priority, sequence) ordering).
      const timeline = sdk.scheduler.create();
      result.lineage.forEach((event, index) => timeline.schedule({ time: index, kind: `${PLUGIN_ID}.${event.cte}`, payload: { tlcId: event.tlcId } }));
      if (result.detectionDay) timeline.schedule({ time: result.lineage.length + result.detectionDay, kind: `${PLUGIN_ID}.cluster_detected`, priority: 1 });
      const ordered = [];
      timeline.drain((event) => ordered.push(event.kind));
      return { result, inputs, schedulerReceipt: timeline.receipt(), orderedEventCount: ordered.length };
    }

    let activeSpec = resolveScenario(scenario);
    let activeIntervention = null;
    let baseline = run(activeSpec, null);
    appendScenarioReceipt(activeSpec, baseline);

    sdk.state.register(reduce, {
      scenarioId: activeSpec.id,
      run: baseline.result,
      finalRun: baseline.result,
      visibleRun: projectRun(baseline.result, baseline.result, 0, foodTimeline(baseline.result)),
      intervention: null,
      ensemble: null,
      inputContext: baseline.inputs,
      playback: playbackState('ready', 0, foodTimeline(baseline.result)),
    });

    function appendScenarioReceipt(spec, ran) {
      sdk.receipts.append({
        schema: 'simulatte.plugin.foodRecallScenarioReceipt.v3',
        scenarioId: spec.id, scenarioKind: spec.kind, seed: spec.seed,
        engineVersion: ran.result.engineVersion,
        datasetIdentities: Object.fromEntries(datasetReceipts.map((row) => [row.id, row.sha256])),
        eventCount: ran.result.eventCount, lotCount: ran.result.lotCount,
        trueIllnesses: ran.result.trueIllnesses, observedCases: ran.result.observedCases,
        appliedInputs: {
          weather: ran.inputs.weather,
          logistics: ran.inputs.logistics,
          refrigeration: ran.inputs.refrigeration,
        },
        causalOutcomes: {
          shipmentDurationHours: ran.result.shipmentDurationHours,
          refrigerationFailures: ran.result.refrigerationFailures,
          exposureDelayDays: ran.result.exposureDelayDays,
          detectionDay: ran.result.detectionDay,
          trueIllnesses: ran.result.trueIllnesses,
        },
        schedulerProcessed: ran.schedulerReceipt.processedCount,
        claimBoundary: 'This simulation estimates outcomes inside a declared synthetic scenario. It is not a live recall alert, regulatory classification, medical recommendation, epidemiological forecast, or a representation of a complete commercial supply chain.',
      });
    }

    function appendInterventionReceipt(spec, ran, baselineIllnesses) {
      if (!ran.result.recall) return;
      sdk.receipts.append({
        schema: 'simulatte.plugin.foodRecallInterventionReceipt.v2',
        interventionId: `recall:${spec.id}:day-${ran.result.recall.dayOffset}`,
        targetTlcIds: ran.result.recall.targetTlcIds,
        recallDepth: ran.result.recall.depth,
        metrics: {
          contaminatedUnitsRemoved: ran.result.recall.contaminatedUnitsRemoved,
          cleanUnitsRemoved: ran.result.recall.cleanUnitsRemoved,
          recallSensitivity: ran.result.recall.recallSensitivity,
          recallPrecision: ran.result.recall.recallPrecision,
          casesAverted: ran.result.recall.casesAverted,
          baselineIllnesses,
          interventionIllnesses: ran.result.trueIllnesses,
          detectionDay: ran.result.detectionDay,
          shipmentDurationHours: ran.result.shipmentDurationHours,
        },
        appliedInputFieldIdentities: ran.result.inputContext.fieldIdentities,
      });
    }

    // ---- Lifecycle hooks ----------------------------------------------------------
    function setScenario(nextScenario) {
      activeSpec = resolveScenario(nextScenario);
      activeIntervention = null;
      baseline = run(activeSpec, null);
      appendScenarioReceipt(activeSpec, baseline);
      const timeline = foodTimeline(baseline.result);
      sdk.events.propose({
        pluginId: PLUGIN_ID,
        kind: `${PLUGIN_ID}.scenario-run`,
        scenarioId: activeSpec.id,
        run: baseline.result,
        visibleRun: projectRun(baseline.result, baseline.result, 0, timeline),
        playback: playbackState('ready', 0, timeline),
        inputContext: baseline.inputs,
      });
      return baseline.result;
    }

    function contributeRequest({ sourceText, mission = null }) {
      if (!/\b(?:recall|outbreak|contamination|traceback|listeria|salmonella|e\.?\s?coli|allergen|foodborne|food\s+safety)\b/i.test(sourceText || '')) return null;
      // Preflight is idempotent: recognize only, never run the simulation or emit events.
      if (!mission) return { recognized: true, obligations: [], unresolved: [] };
      return {
        recognized: true,
        obligations: [{ id: `${PLUGIN_ID}:containment:${activeSpec.id}`, kind: 'recall_containment', required: true }],
        unresolved: [],
      };
    }

    function handleAction(actionId, context = {}) {
      const values = context.values || {};
      if (actionId === 'scenario.run') {
        if (values.phase === 'start') {
          activeIntervention = interventionFrom(values);
          const ran = run(activeSpec, activeIntervention);
          const timeline = foodTimeline(ran.result);
          appendInterventionReceipt(activeSpec, ran, baseline.result.trueIllnesses);
          sdk.events.propose({
            pluginId: PLUGIN_ID,
            kind: `${PLUGIN_ID}.playback-started`,
            run: ran.result,
            visibleRun: projectRun(ran.result, baseline.result, 0, timeline),
            intervention: activeIntervention,
            inputContext: ran.inputs,
            playback: playbackState('running', 0, timeline),
          });
          return {
            status: 'running',
            scenarioId: activeSpec.id,
            intervention: activeIntervention,
            currentStep: 0,
            totalSteps: timeline.length - 1,
            stage: timeline[0],
          };
        }
        const state = sdk.state.read();
        if (values.phase === 'step') {
          if (state.playback?.status !== 'running') {
            return {
              status: state.playback?.status === 'settled' ? 'settled' : 'refused',
              reason: state.playback?.status === 'settled' ? null : 'food_recall_playback_not_started',
              currentStep: state.playback?.currentStep || 0,
              totalSteps: state.playback?.totalSteps || 0,
            };
          }
          const nextStep = Math.min(state.playback.currentStep + 1, state.playback.totalSteps);
          const status = nextStep >= state.playback.totalSteps ? 'settled' : 'running';
          const playback = playbackState(status, nextStep, state.playback.timeline);
          sdk.events.propose({
            pluginId: PLUGIN_ID,
            kind: `${PLUGIN_ID}.playback-advanced`,
            visibleRun: projectRun(state.finalRun, baseline.result, nextStep, state.playback.timeline),
            playback,
          });
          return {
            status,
            scenarioId: activeSpec.id,
            intervention: state.intervention,
            currentStep: nextStep,
            totalSteps: state.playback.totalSteps,
            stage: state.playback.timeline[nextStep],
          };
        }
        sdk.events.propose({
          pluginId: PLUGIN_ID,
          kind: `${PLUGIN_ID}.scenario-run`,
          scenarioId: activeSpec.id,
          run: state.finalRun,
          visibleRun: state.visibleRun,
          playback: state.playback,
          inputContext: state.inputContext,
        });
        return {
          status: state.playback?.status || 'settled',
          scenarioId: activeSpec.id,
          currentStep: state.playback?.currentStep || 0,
          totalSteps: state.playback?.totalSteps || 0,
          stage: state.playback?.stage || null,
        };
      }
      if (actionId === 'recall.issue') {
        const intervention = interventionFrom(values);
        activeIntervention = intervention;
        const ran = run(activeSpec, intervention);
        appendInterventionReceipt(activeSpec, ran, baseline.result.trueIllnesses);
        sdk.events.propose({
          pluginId: PLUGIN_ID,
          kind: `${PLUGIN_ID}.recall-issued`,
          run: ran.result,
          intervention,
          inputContext: ran.inputs,
        });
        return { status: 'settled', recall: ran.result.recall };
      }
      if (actionId === 'counterfactual.compare') {
        // Common random numbers: baseline and intervention share the same seed/streams.
        const ran = run(activeSpec, activeIntervention || activeSpec.defaultIntervention);
        appendInterventionReceipt(activeSpec, ran, baseline.result.trueIllnesses);
        sdk.events.propose({
          pluginId: PLUGIN_ID,
          kind: `${PLUGIN_ID}.recall-issued`,
          run: ran.result,
          intervention: activeIntervention || activeSpec.defaultIntervention,
          inputContext: ran.inputs,
        });
        const comparisonBranches = {
          baseline: {
            trueIllnesses: baseline.result.trueIllnesses,
            observedCases: baseline.result.observedCases,
            detectionDay: baseline.result.detectionDay,
            casesAverted: 0,
          },
          intervention: {
            trueIllnesses: ran.result.trueIllnesses,
            observedCases: ran.result.observedCases,
            detectionDay: ran.result.detectionDay,
            casesAverted: ran.result.recall?.casesAverted ?? 0,
          },
        };
        return {
          status: 'settled',
          comparisonId: `${activeSpec.id}:recall-vs-baseline`,
          comparisonBranches,
          comparison: {
            schema: 'simulatte.foodRecallComparison.v1',
            commonSeed: activeSpec.seed,
            baseline: {
              trueIllnesses: baseline.result.trueIllnesses,
              observedCases: baseline.result.observedCases,
              detectionDay: baseline.result.detectionDay,
              inputContext: baseline.result.inputContext,
            },
            intervention: {
              trueIllnesses: ran.result.trueIllnesses,
              observedCases: ran.result.observedCases,
              detectionDay: ran.result.detectionDay,
              casesAverted: ran.result.recall?.casesAverted ?? null,
              inputContext: ran.result.inputContext,
            },
          },
        };
      }
      if (actionId === 'ensemble.run') {
        // Off-thread replicate ensemble via sdk.compute, each replicate keyed by index.
        return sdk.compute.runEnsemble({
          replicates: config.ensembleReplicates || 24,
          simulate: (index) => {
            const replicateSpec = { ...activeSpec, seed: `${activeSpec.seed}:rep${index}` };
            const inputs = inputContextApi.resolve({ sdk, model, scenario: replicateSpec, environmentDataset });
            const result = engine.runScenario({
              model,
              scenario: replicateSpec,
              random: sdk.random,
              scheduler: sdk.scheduler,
              intervention: activeSpec.defaultIntervention,
              inputContext: inputs,
            });
            return {
              trueIllnesses: result.trueIllnesses,
              observedCases: result.observedCases,
              casesAverted: result.recall?.casesAverted ?? 0,
              recallSensitivity: result.recall?.recallSensitivity ?? 0,
            };
          },
        }).then((summary) => {
          sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.ensemble-run`, ensemble: summary });
          return { status: 'settled', ensemble: summary.metrics };
        });
      }
      return { status: 'refused', reason: 'unknown_action' };
    }

    function interventionFrom(values) {
      const dayOffset = Number(values.recallDay ?? activeSpec.defaultIntervention.dayOffset);
      if (!Number.isInteger(dayOffset) || dayOffset < 0 || dayOffset > activeSpec.durationDays) {
        throw new Error(`food_recall_control_invalid: recallDay must be an integer from 0 to ${activeSpec.durationDays}`);
      }
      const depth = values.recallDepth || activeSpec.defaultIntervention.depth;
      if (!['retail', 'consumer'].includes(depth)) {
        throw new Error(`food_recall_control_invalid: unsupported recallDepth ${depth}`);
      }
      return { dayOffset, depth, scope: activeSpec.defaultIntervention.scope };
    }

    function settle() {
      const state = sdk.state.read();
      const run_ = state.finalRun || state.run;
      const terminal = state.playback?.status === 'settled';
      const results = [];
      // Source identified within the declared rank.
      results.push({
        obligationId: `${PLUGIN_ID}:source-rank`,
        status: terminal && Number.isInteger(run_.trueSourceRank) ? 'settled' : 'unmet',
        evidence: {
          trueSourceRank: run_.trueSourceRank,
          targetRank: 5,
          targetMet: Boolean(run_.trueSourceRank && run_.trueSourceRank <= 5),
        },
      });
      // No false claim when traceability evidence is incomplete: if unranked, report honestly.
      if (terminal && !run_.trueSourceRank) results.push({ obligationId: `${PLUGIN_ID}:honest-uncertainty`, status: 'settled', evidence: { note: 'Source not identified; no substitute claim made.' } });
      // Lineage preserved.
      results.push({ obligationId: `${PLUGIN_ID}:lineage`, status: terminal && run_.eventCount > 0 ? 'settled' : 'unmet', evidence: { eventCount: run_.eventCount, lotCount: run_.lotCount } });
      results.push({
        obligationId: `${PLUGIN_ID}:causal-inputs`,
        status: terminal && run_.inputContext?.fieldIdentities?.length === 3 ? 'settled' : 'unmet',
        evidence: {
          fieldIdentities: run_.inputContext?.fieldIdentities || [],
          shipmentDurationHours: run_.shipmentDurationHours,
          refrigerationFailures: run_.refrigerationFailures,
          exposureDelayDays: run_.exposureDelayDays,
        },
      });
      // Containment: recall sensitivity above target with bounded safe-food waste.
      if (run_.recall) {
        const ok = (run_.recall.recallSensitivity ?? 0) >= 0.8;
        results.push({
          obligationId: `${PLUGIN_ID}:containment:${state.scenarioId}`,
          status: terminal && Number.isFinite(run_.recall.recallSensitivity) ? 'settled' : 'unmet',
          evidence: {
            recallSensitivity: run_.recall.recallSensitivity,
            target: 0.8,
            targetMet: ok,
            safeFoodWasteUnits: run_.recall.safeFoodWasteUnits,
          },
        });
      }
      return { obligationResults: results, stateIdentity: `${state.scenarioId}:${run_.seed}`, losses: [] };
    }

    function view() {
      const state = sdk.state.read();
      return presentation.buildViews({
        run: state.visibleRun || state.run,
        scenario: activeSpec,
        datasetReceipts,
        activeIntervention,
        inputContext: state.inputContext,
        playback: state.playback,
      });
    }

    function present() {
      const state = sdk.state.read();
      return presentation.buildPresentation({ run: state.visibleRun || state.run, facilities, corridors, consumerZones: consumerZones.zones });
    }

    function contributeV4() {
      const state = sdk.state.read();
      return v4.createContribution({
        run: state.visibleRun || state.run,
        scenario: activeSpec,
        facilities,
        corridors,
        consumerZones: consumerZones.zones,
        datasetReceipts,
        activeIntervention,
        inputContext: state.inputContext,
        playback: state.playback,
      });
    }

    // ---- Capabilities (cross-plugin fields, §17/§18) ------------------------------
    const capabilities = {
      'simulation.food-recall.v2': (input) => ({ scenarioId: activeSpec.id, run: sdk.state.read().run, requested: input }),
      'traceability.lookup.v1': (input) => {
        const run_ = sdk.state.read().run;
        const lot = run_.lots.find((row) => row.tlcId === input?.tlcId) || null;
        return { tlcId: input?.tlcId || null, lot, lineage: run_.lineage.filter((event) => event.tlcId === input?.tlcId) };
      },
      // field.food-contamination.v1: contamination near a coordinate. Uses geography.project
      // to find the nearest facility to the query point.
      'field.food-contamination.v1': (input) => {
        if (!input || !Number.isFinite(input.longitude) || !Number.isFinite(input.latitude)) return { value: null, reason: 'coordinate_required' };
        let nearest = null;
        let nearestM = Infinity;
        facilities.forEach((facility) => {
          const distance = sdk.geography.distanceMeters(input, facility.location);
          if (distance < nearestM) { nearestM = distance; nearest = facility; }
        });
        const run_ = sdk.state.read().run;
        const contaminated = nearest ? run_.lots.some((lot) => lot.contaminated && lot.tlcId.includes(`:${nearest.id}:`)) : false;
        return {
          schema: 'field.food-contamination.v1', value: contaminated ? 1 : 0, units: 'contaminated_boolean',
          nearestFacilityId: nearest?.id || null, distanceM: Number.isFinite(nearestM) ? Math.round(nearestM) : null,
          providerId: PLUGIN_ID, claimBoundary: 'Synthetic scenario contamination state, not observed food safety data.',
        };
      },
    };

    return Object.freeze({ id: PLUGIN_ID, contributeRequest, contributeV4, setScenario, handleAction, settle, view, present, reduce, capabilities, dispose() {} });
  }

  function reduce(state, event) {
    if (event.kind === `${PLUGIN_ID}.scenario-run`) {
      return {
        ...state,
        scenarioId: event.scenarioId,
        run: event.run,
        finalRun: event.run,
        visibleRun: event.visibleRun || event.run,
        intervention: null,
        inputContext: event.inputContext,
        playback: event.playback || state.playback,
      };
    }
    if (event.kind === `${PLUGIN_ID}.playback-started`) {
      return {
        ...state,
        run: event.run,
        finalRun: event.run,
        visibleRun: event.visibleRun,
        intervention: event.intervention,
        inputContext: event.inputContext,
        playback: event.playback,
      };
    }
    if (event.kind === `${PLUGIN_ID}.playback-advanced`) {
      return {
        ...state,
        visibleRun: event.visibleRun,
        playback: event.playback,
      };
    }
    if (event.kind === `${PLUGIN_ID}.recall-issued`) {
      return {
        ...state,
        run: event.run,
        finalRun: event.run,
        visibleRun: event.run,
        intervention: event.intervention,
        inputContext: event.inputContext,
        playback: playbackState('settled', foodTimeline(event.run).length, foodTimeline(event.run)),
      };
    }
    if (event.kind === `${PLUGIN_ID}.ensemble-run`) return { ...state, ensemble: event.ensemble };
    return state;
  }

  function foodTimeline(run) {
    const lineage = Array.isArray(run?.lineage) ? run.lineage : [];
    const shippingCount = lineage.filter((row) => row.cte === 'shipping').length;
    return Object.freeze([
      Object.freeze({ id: 'ready', label: 'Incident prepared', lineageCount: 0, narrative: 'The governed scenario is ready; no modeled outcome is revealed.' }),
      Object.freeze({ id: 'origin', label: 'Lots enter custody', lineageCount: Math.max(1, lineage.filter((row) => row.cte === 'harvesting').length), narrative: 'Synthetic origin lots receive stable traceability identities.' }),
      Object.freeze({ id: 'shipping', label: 'Cold-chain shipments move', lineageCount: Math.max(1, Math.ceil(lineage.length * 0.45)), narrative: `${shippingCount} modeled shipments carry temperature and service-state receipts.` }),
      Object.freeze({ id: 'distribution', label: 'Lots reach consumers', lineageCount: lineage.length, narrative: 'Custody paths and transformations determine which synthetic lots are exposed.' }),
      Object.freeze({ id: 'exposure', label: 'Illnesses emerge', lineageCount: lineage.length, narrative: 'Dose-response and reporting assumptions generate the modeled exposure outcome.' }),
      Object.freeze({ id: 'detection', label: 'Cluster is detected', lineageCount: lineage.length, narrative: 'Only reported cases become available to the traceback policy.' }),
      Object.freeze({ id: 'recall', label: 'Recall propagates', lineageCount: lineage.length, narrative: 'The selected recall day and depth remove reachable descendant lots.' }),
      Object.freeze({ id: 'settled', label: 'Incident settled', lineageCount: lineage.length, narrative: 'The intervention and no-recall branches can now be compared.' }),
    ]);
  }

  function playbackState(status, currentStep, timeline) {
    return Object.freeze({
      status,
      currentStep,
      totalSteps: Math.max(0, timeline.length - 1),
      stage: timeline[currentStep] || timeline.at(-1),
      timeline,
    });
  }

  function projectRun(finalRun, baselineRun, step, timeline) {
    const stage = timeline[Math.max(0, Math.min(step, timeline.length - 1))];
    const lineage = (finalRun.lineage || []).slice(0, stage.lineageCount);
    const visibleLotIds = new Set(lineage.flatMap((row) => [row.tlcId, ...(row.parents || [])]).filter(Boolean));
    const showExposure = step >= 4;
    const showDetection = step >= 5;
    const showRecall = step >= 6;
    const settled = step >= timeline.length - 1;
    const illnesses = showExposure
      ? (showRecall ? finalRun.trueIllnesses : baselineRun.trueIllnesses)
      : 0;
    const lots = (finalRun.lots || []).filter((row) => visibleLotIds.has(row.tlcId));
    return {
      ...finalRun,
      lineage,
      lots,
      lotCount: lots.length,
      eventCount: lineage.length,
      trueIllnesses: illnesses,
      observedCases: showDetection ? finalRun.observedCases : 0,
      detectionDay: showDetection ? finalRun.detectionDay : null,
      traceback: showDetection ? finalRun.traceback : [],
      recall: showRecall ? finalRun.recall : null,
      playbackStage: stage,
      playbackSettled: settled,
    };
  }

  // ---- Dataset validators (structural; declared schema ids) -----------------------
  const datasetValidators = {
    'simulatte.usFoodFacilityCatalog.v1': (value) => { if (!Array.isArray(value.facilities) || !value.facilities.length) throw new Error('facility catalog empty'); return value; },
    'simulatte.usFoodFreightCorridors.v1': (value) => { if (!Array.isArray(value.corridors)) throw new Error('corridors missing'); return value; },
    'simulatte.usFoodCommodityProfiles.v1': (value) => { if (!Array.isArray(value.products) || !value.products.length) throw new Error('products empty'); return value; },
    'simulatte.usFoodHazardRegistry.v1': (value) => { if (!Array.isArray(value.hazards) || !value.surveillanceStages) throw new Error('hazard registry incomplete'); return value; },
    'simulatte.usFoodConsumerZones.v1': (value) => { if (!Array.isArray(value.zones) || !value.zones.length) throw new Error('consumer zones empty'); return value; },
    'simulatte.usFoodHistoricalRecalls.v1': (value) => { if (!Array.isArray(value.records)) throw new Error('historical recalls missing'); return value; },
    'simulatte.usEnvironmentSnapshot.v1': (value) => { if (!Array.isArray(value.sourceSnapshotIds)) throw new Error('environment snapshot missing sources'); return value; },
  };

  return Object.freeze({ activate, datasetValidators });
});
