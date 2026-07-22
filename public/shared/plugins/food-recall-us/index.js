(function attachFoodRecallPlugin(root, factory) {
  const engine = typeof module === 'object' && module.exports ? require('./food-engine.js') : root.SimulatteFoodRecallEngine;
  const presentation = typeof module === 'object' && module.exports ? require('./food-presentation.js') : root.SimulatteFoodRecallPresentation;
  const api = factory(engine, presentation);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginFoodRecallUs = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createFoodRecallPlugin(engine, presentation) {
  const PLUGIN_ID = 'food-recall-us';
  const SCENARIO_DATE = Date.parse('2026-07-01T12:00:00Z');

  async function activate({ sdk, config, scenario = null }) {
    // 1. Require + compile governed datasets.
    const facilities = sdk.datasets.require('us.food.facilities.synthetic.v1').facilities;
    const corridors = sdk.datasets.require('us.food.freight-corridors.v1').corridors;
    const products = sdk.datasets.require('us.food.commodity-profiles.v1').products;
    const hazards = sdk.datasets.require('us.food.hazard-model-registry.v1');
    const consumerZones = sdk.datasets.require('us.food.consumer-zones.v1');
    const datasetReceipts = ['us.food.facilities.synthetic.v1', 'us.food.freight-corridors.v1', 'us.food.commodity-profiles.v1', 'us.food.hazard-model-registry.v1', 'us.food.consumer-zones.v1']
      .map((id) => ({ id, sha256: sdk.datasets.receipt(id)?.sha256 || null }));
    const model = engine.compileModel({ facilities, corridors, products, hazards, consumerZones });
    const scenariosById = new Map(config.scenarios.map((row) => [row.id, row]));

    function resolveScenario(seedRow) {
      const scenarioId = seedRow?.scenarioId || config.defaultScenarioId;
      const spec = scenariosById.get(scenarioId);
      if (!spec) throw new Error(`food-recall-us has no scenario ${scenarioId}`);
      return seedRow?.seed ? { ...spec, seed: seedRow.seed } : spec;
    }

    // 2. Sample the pinned environment at the origin region (exercises environment.read).
    function ambientForScenario(spec) {
      const origin = (model.facilitiesByKind.get(spec.originFacilityKind) || [])[0];
      if (!origin || !sdk.environment) return null;
      const sample = sdk.environment.sample({ instant: SCENARIO_DATE, longitude: origin.location.longitude, latitude: origin.location.latitude, fields: ['airTemperatureC'] });
      return sample.values.airTemperatureC;
    }

    // 3. Run a scenario, using sdk.random + sdk.scheduler for a deterministic timeline.
    function run(spec, intervention) {
      const result = engine.runScenario({ model, scenario: spec, random: sdk.random, scheduler: sdk.scheduler, intervention });
      // Order the run's events through the shared scheduler so the event-chain hash is
      // reproducible (stable (time, priority, sequence) ordering).
      const timeline = sdk.scheduler.create();
      result.lineage.forEach((event, index) => timeline.schedule({ time: index, kind: `${PLUGIN_ID}.${event.cte}`, payload: { tlcId: event.tlcId } }));
      if (result.detectionDay) timeline.schedule({ time: result.lineage.length + result.detectionDay, kind: `${PLUGIN_ID}.cluster_detected`, priority: 1 });
      const ordered = [];
      timeline.drain((event) => ordered.push(event.kind));
      return { result, ambientC: ambientForScenario(spec), schedulerReceipt: timeline.receipt(), orderedEventCount: ordered.length };
    }

    let activeSpec = resolveScenario(scenario);
    let activeIntervention = null;
    let baseline = run(activeSpec, null);
    appendScenarioReceipt(activeSpec, baseline);

    sdk.state.register(reduce, { scenarioId: activeSpec.id, run: baseline.result, intervention: null, ensemble: null, ambientC: baseline.ambientC });

    function appendScenarioReceipt(spec, ran) {
      sdk.receipts.append({
        schema: 'simulatte.plugin.foodRecallScenarioReceipt.v2',
        scenarioId: spec.id, scenarioKind: spec.kind, seed: spec.seed,
        engineVersion: ran.result.engineVersion,
        datasetIdentities: Object.fromEntries(datasetReceipts.map((row) => [row.id, row.sha256])),
        eventCount: ran.result.eventCount, lotCount: ran.result.lotCount,
        trueIllnesses: ran.result.trueIllnesses, observedCases: ran.result.observedCases,
        environmentAmbientC: ran.ambientC,
        schedulerProcessed: ran.schedulerReceipt.processedCount,
        claimBoundary: 'This simulation estimates outcomes inside a declared synthetic scenario. It is not a live recall alert, regulatory classification, medical recommendation, epidemiological forecast, or a representation of a complete commercial supply chain.',
      });
    }

    function appendInterventionReceipt(spec, ran, baselineIllnesses) {
      if (!ran.result.recall) return;
      sdk.receipts.append({
        schema: 'simulatte.plugin.foodRecallInterventionReceipt.v1',
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
        },
      });
    }

    // ---- Lifecycle hooks ----------------------------------------------------------
    function setScenario(nextScenario) {
      activeSpec = resolveScenario(nextScenario);
      activeIntervention = null;
      baseline = run(activeSpec, null);
      appendScenarioReceipt(activeSpec, baseline);
      sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.scenario-run`, scenarioId: activeSpec.id, run: baseline.result, ambientC: baseline.ambientC });
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
        const state = sdk.state.read();
        sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.scenario-run`, scenarioId: activeSpec.id, run: state.run, ambientC: state.ambientC });
        return { status: 'settled', scenarioId: activeSpec.id, run: state.run };
      }
      if (actionId === 'recall.issue') {
        const intervention = {
          dayOffset: Number(values.recallDay ?? activeSpec.defaultIntervention.dayOffset),
          depth: values.recallDepth || activeSpec.defaultIntervention.depth,
          scope: activeSpec.defaultIntervention.scope,
        };
        activeIntervention = intervention;
        const ran = run(activeSpec, intervention);
        appendInterventionReceipt(activeSpec, ran, baseline.result.trueIllnesses);
        sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.recall-issued`, run: ran.result, intervention });
        return { status: 'settled', recall: ran.result.recall };
      }
      if (actionId === 'counterfactual.compare') {
        // Common random numbers: baseline and intervention share the same seed/streams.
        const ran = run(activeSpec, activeIntervention || activeSpec.defaultIntervention);
        appendInterventionReceipt(activeSpec, ran, baseline.result.trueIllnesses);
        sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.recall-issued`, run: ran.result, intervention: activeIntervention || activeSpec.defaultIntervention });
        return { status: 'settled', casesAverted: ran.result.recall?.casesAverted ?? null, baseline: baseline.result.trueIllnesses };
      }
      if (actionId === 'ensemble.run') {
        // Off-thread replicate ensemble via sdk.compute, each replicate keyed by index.
        return sdk.compute.runEnsemble({
          replicates: config.ensembleReplicates || 24,
          simulate: (index) => {
            const replicateSpec = { ...activeSpec, seed: `${activeSpec.seed}:rep${index}` };
            const result = engine.runScenario({ model, scenario: replicateSpec, random: sdk.random, scheduler: sdk.scheduler, intervention: activeSpec.defaultIntervention });
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

    function settle() {
      const state = sdk.state.read();
      const run_ = state.run;
      const results = [];
      // Source identified within the declared rank.
      results.push({ obligationId: `${PLUGIN_ID}:source-rank`, status: run_.trueSourceRank && run_.trueSourceRank <= 5 ? 'settled' : 'unmet', evidence: { trueSourceRank: run_.trueSourceRank, targetRank: 5 } });
      // No false claim when traceability evidence is incomplete: if unranked, report honestly.
      if (!run_.trueSourceRank) results.push({ obligationId: `${PLUGIN_ID}:honest-uncertainty`, status: 'settled', evidence: { note: 'Source not identified; no substitute claim made.' } });
      // Lineage preserved.
      results.push({ obligationId: `${PLUGIN_ID}:lineage`, status: run_.eventCount > 0 ? 'settled' : 'unmet', evidence: { eventCount: run_.eventCount, lotCount: run_.lotCount } });
      // Containment: recall sensitivity above target with bounded safe-food waste.
      if (run_.recall) {
        const ok = (run_.recall.recallSensitivity ?? 0) >= 0.8;
        results.push({ obligationId: `${PLUGIN_ID}:containment:${state.scenarioId}`, status: ok ? 'settled' : 'unmet', evidence: { recallSensitivity: run_.recall.recallSensitivity, target: 0.8, safeFoodWasteUnits: run_.recall.safeFoodWasteUnits } });
      }
      return { obligationResults: results, stateIdentity: `${state.scenarioId}:${run_.seed}`, losses: [] };
    }

    function view() {
      const state = sdk.state.read();
      return presentation.buildViews({ run: state.run, scenario: activeSpec, datasetReceipts, activeIntervention });
    }

    function present() {
      const state = sdk.state.read();
      return presentation.buildPresentation({ run: state.run, facilities, corridors, consumerZones: consumerZones.zones });
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

    return Object.freeze({ id: PLUGIN_ID, contributeRequest, setScenario, handleAction, settle, view, present, reduce, capabilities, dispose() {} });
  }

  function reduce(state, event) {
    if (event.kind === `${PLUGIN_ID}.scenario-run`) return { ...state, scenarioId: event.scenarioId, run: event.run, intervention: null, ambientC: event.ambientC };
    if (event.kind === `${PLUGIN_ID}.recall-issued`) return { ...state, run: event.run, intervention: event.intervention };
    if (event.kind === `${PLUGIN_ID}.ensemble-run`) return { ...state, ensemble: event.ensemble };
    return state;
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
