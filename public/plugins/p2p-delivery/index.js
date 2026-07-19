(function attachP2pDeliveryPlugin(root, factory) {
  const contracts = typeof module === 'object' && module.exports ? require('./contracts.js') : root.SimulatteCooperativeContracts;
  const language = typeof module === 'object' && module.exports ? require('./language-compiler.js') : root.SimulatteCooperativeLanguage;
  const engine = typeof module === 'object' && module.exports ? require('./cooperative-engine.js') : root.SimulatteCooperativeEngine;
  const api = factory(contracts, language, engine);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginP2pDelivery = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createP2pDeliveryPlugin(contracts, language, engine) {
  async function activate({ sdk, config }) {
    language.configure({ parser: sdk.language });
    engine.configure({
      contracts,
      language,
      worldApi: { createWorldModel: () => sdk.worldQuery.model() },
      routePlanner: { planRoute: (options) => sdk.routing.plan(options) },
      receipts: sdk.receipts,
      routeCostModel: config.routeCostModel,
    });
    sdk.state.register(reduce, { snapshot: null });
    const scenario = sdk.datasets.require('battery-office-east-village-v1');
    let session = null;

    async function contributeRequest({ sourceText, mission = null }) {
      if (!engine.recognizesCooperativeRequest(sourceText)) {
        if (mission) sdk.events.propose({ pluginId: 'p2p-delivery', kind: 'p2p-delivery.cleared' });
        return null;
      }
      if (!mission) return { recognized: true, executableSourceText: scenario.carrierMissionText, obligations: [], unresolved: [] };
      session = await engine.createCooperativeSession({ world: sdk.worldQuery.snapshot(), routingPolicy: sdk.routing.policy(), scenario, sourceText });
      await session.reserve();
      for (const participantId of session.snapshot().plan.participantIds) await session.authorize(participantId);
      await session.startExecution();
      const snapshot = session.snapshot();
      const route = snapshot.plan.routes.cooperative;
      sdk.events.propose({ pluginId: 'p2p-delivery', kind: 'p2p-delivery.session-updated', snapshot });
      sdk.receipts.append({ schema: 'simulatte.plugin.p2pDeliveryMatchReceipt.v1', requestId: snapshot.request.needId, plan: snapshot.plan, matching: snapshot.matching });
      return {
        recognized: true,
        obligations: [{ id: `p2p-delivery:${snapshot.request.needId}`, kind: 'delivery_fulfillment', required: true }],
        unresolved: [],
        missionPatch: { routeOverride: { segmentIds: [...route.segmentIds], selectionId: snapshot.plan.id, objective: snapshot.plan.utilityScore, algorithm: 'p2p_delivery_cooperative_route_v1' } },
      };
    }

    function fulfill(request) {
      if (request.itemId !== scenario.need.itemId) return { enabled: false, reason: 'item_not_in_delivery_scenario', itemId: request.itemId };
      return { enabled: true, scenarioId: scenario.id, carrierMissionText: scenario.carrierMissionText };
    }

    async function settle({ journey }) {
      if (!session) return null;
      if (journey?.finalState?.status === 'completed' && !session.snapshot().settlement) await session.settle();
      const snapshot = session.snapshot();
      sdk.events.propose({ pluginId: 'p2p-delivery', kind: 'p2p-delivery.session-updated', snapshot });
      const settlement = snapshot.settlement || { schema: 'simulatte.plugin.p2pDeliverySettlement.v1', status: 'not_settled', compensationCents: snapshot.plan.marginalBurden.compensationCents };
      sdk.receipts.append({ schema: 'simulatte.plugin.p2pDeliverySettlement.v1', settlement });
      return { obligationResults: [{ obligationId: `p2p-delivery:${snapshot.request.needId}`, status: snapshot.settlement ? 'settled' : 'not_settled' }], stateIdentity: snapshot.plan.id, losses: snapshot.settlement ? [] : ['journey_not_completed'], settlement };
    }

    function view() {
      const snapshot = sdk.state.read().snapshot;
      if (!snapshot) return null;
      const burden = snapshot.plan.marginalBurden;
      return {
        slot: 'inspector', title: 'Cooperative delivery',
        rows: [
          { label: 'Match', value: `${snapshot.plan.carrierId} · ${snapshot.matching.counts.feasibleCandidates} eligible` },
          { label: 'Marginal burden', value: `${Math.round(burden.addedDistanceM)} m · ${Math.round(burden.addedDurationSeconds)} s` },
          { label: 'Compensation', value: `$${(burden.compensationCents / 100).toFixed(2)}` },
          { label: 'Reliability', value: `${Math.round(snapshot.plan.reliability.onTimeProbability * 100)}% modeled on time` },
          { label: 'Settlement', value: snapshot.settlement ? 'Fulfilled' : snapshot.custodyState.replaceAll('_', ' ') },
        ],
        actions: [],
      };
    }

    return Object.freeze({ id: 'p2p-delivery', contributeRequest, settle, view, capabilities: { 'fulfillment.delivery.v1': fulfill, 'settlement.delivery.v1': settle }, dispose() { session = null; } });
  }

  function reduce(state, event) {
    if (event.kind === 'p2p-delivery.cleared') return { snapshot: null };
    return event.kind === 'p2p-delivery.session-updated' ? { ...state, snapshot: event.snapshot } : state;
  }

  return Object.freeze({
    activate,
    datasetValidators: Object.freeze({
      'simulatte.cooperativeScenario.v1': (value) => contracts.validateScenario(value),
    }),
  });
});
