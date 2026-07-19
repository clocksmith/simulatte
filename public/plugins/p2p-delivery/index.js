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
    const worldModel = sdk.worldQuery.model();
    const candidateRoutes = scenario.intents.map((intent) => ({
      participantId: intent.participantId,
      segmentIds: sdk.routing.plan({
        worldModel,
        originNodeId: intent.baselineJourney.originNodeId,
        destinationNodeId: intent.baselineJourney.destinationNodeId,
        mode: intent.mode,
        tick: 0,
        mission: { constraints: { avoidStreetNames: [], maximumBikeRackDistanceM: null, lanePreference: intent.mode === 'delivery_bike' ? 'protected' : 'any' }, task: { type: 'point_to_point' } },
        policy: sdk.routing.policy(),
      }).segmentIds,
    }));
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
      if (!snapshot) return {
        slot: 'map', title: 'Nearby journeys',
        rows: [{ label: 'Available carriers', value: String(candidateRoutes.length) }, { label: 'Need', value: `${scenario.need.quantity} × ${scenario.need.itemId}` }],
        actions: [{ id: 'focus-network', label: 'View network', command: { kind: 'camera.focus', targetId: 'delivery-network' } }],
      };
      const burden = snapshot.plan.marginalBurden;
      const inspector = {
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
      return [inspector, {
        slot: 'map', title: 'Matched journey',
        rows: [{ label: 'Carrier', value: snapshot.plan.carrierId }, { label: 'Detour', value: `${Math.round(burden.addedDistanceM)} m` }],
        actions: [{ id: 'focus-match', label: 'Follow match', command: { kind: 'camera.focus', targetId: 'selected-delivery' } }],
      }];
    }

    function present() {
      const snapshot = sdk.state.read().snapshot;
      const selectedCarrierId = snapshot?.plan?.carrierId || null;
      const selectedSegments = snapshot?.plan?.routes?.cooperative?.segmentIds || [];
      const offer = scenario.offers.find((row) => row.id === snapshot?.plan?.offerId);
      const markers = [
        { id: 'delivery-destination', label: 'Delivery destination', nodeId: scenario.need.destinationNodeId, tone: 'magenta', heightM: 48, radiusM: 3.6, intensity: 1.45 },
        ...(offer ? [{ id: 'pickup', label: 'Pickup', nodeId: offer.availableNodeId, tone: 'amber', heightM: 38, radiusM: 3.2, intensity: 1.35 }] : []),
      ];
      const paths = candidateRoutes.map((row, index) => ({ id: `candidate-${index + 1}`, label: `${row.participantId} baseline`, segmentIds: row.segmentIds, tone: row.participantId === selectedCarrierId ? 'green' : 'muted', widthM: row.participantId === selectedCarrierId ? 5 : 2.2, intensity: row.participantId === selectedCarrierId ? 1.1 : 0.38 }));
      if (selectedSegments.length) paths.push({ id: 'selected-delivery', label: 'Cooperative delivery', segmentIds: selectedSegments, tone: 'cyan', widthM: 8, intensity: 1.4 });
      const allSegments = [...new Set(candidateRoutes.flatMap((row) => row.segmentIds))];
      return {
        schema: 'simulatte.pluginPresentation.v1', markers, paths,
        actors: candidateRoutes.map((row, index) => ({ id: `carrier-${index + 1}`, label: row.participantId, kind: 'bicycle', segmentIds: row.segmentIds, tone: row.participantId === selectedCarrierId ? 'green' : 'blue', speedMps: 5.4 + index * 0.35, phaseOffsetM: index * 180, isSelected: row.participantId === selectedCarrierId })),
        cameraTargets: [
          { id: 'delivery-network', label: 'Delivery network', nodeIds: [scenario.need.destinationNodeId], segmentIds: allSegments, distanceM: 2400 },
          ...(selectedSegments.length ? [{ id: 'selected-delivery', label: 'Selected delivery', nodeIds: [scenario.need.destinationNodeId], segmentIds: selectedSegments, distanceM: 1400 }] : []),
        ],
      };
    }

    return Object.freeze({ id: 'p2p-delivery', contributeRequest, settle, view, present, capabilities: { 'fulfillment.delivery.v1': fulfill, 'settlement.delivery.v1': settle }, dispose() { session = null; } });
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
