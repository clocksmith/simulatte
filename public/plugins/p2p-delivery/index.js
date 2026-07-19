(function attachP2pDeliveryPlugin(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginP2pDelivery = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createP2pDeliveryPlugin() {
  const REQUEST_PATTERN = /\b(?:need|bring|deliver|drop off|pick up|carry)\b/i;
  async function activate({ sdk }) {
    sdk.state.register(reduce, { request: null, plan: null, settlement: null });
    const scenario = sdk.datasets.require('battery-office-east-village-v1');

    function contributeRequest({ sourceText, mission = null }) {
      if (!REQUEST_PATTERN.test(sourceText || '')) return null;
      const item = scenario.itemTaxonomy.items.find((row) => (row.labels || [row.label, row.name]).filter(Boolean).some((label) => String(sourceText).toLowerCase().includes(String(label).toLowerCase()))) || null;
      if (!item && !/batter/i.test(sourceText || '')) return null;
      if (!mission) return { recognized: true, executableSourceText: scenario.carrierMissionText, obligations: [], unresolved: [] };
      const request = { ...scenario.need, sourceText };
      const plan = match(request);
      sdk.events.propose({ pluginId: 'p2p-delivery', kind: 'p2p-delivery.plan-created', request, plan });
      sdk.receipts.append({ schema: 'simulatte.plugin.p2pDeliveryMatchReceipt.v1', requestId: request.id, plan });
      return { recognized: true, obligations: [{ id: `p2p-delivery:${request.id}`, kind: 'delivery_fulfillment', required: true }], unresolved: [], delivery: plan };
    }

    function match(request) {
      const offers = scenario.offers.filter((offer) => offer.itemId === request.itemId && offer.quantity >= request.quantity && offer.consentState === 'available');
      const candidates = offers.map((offer) => {
        const intent = scenario.intents.find((row) => row.id === offer.intentId);
        return { offer, intent, compensationCents: Math.max(offer.minimumCompensationCents, scenario.policy.minimumCompensationCents || 0) };
      }).filter((row) => row.intent).sort((left, right) => left.compensationCents - right.compensationCents || left.intent.participantId.localeCompare(right.intent.participantId));
      if (!candidates.length) return { status: 'unmatched', requestId: request.id, candidateCount: 0 };
      const selected = candidates[0];
      return {
        status: 'matched', requestId: request.id, offerId: selected.offer.id, carrierId: selected.intent.participantId,
        participantIds: [request.requesterId, selected.intent.participantId], compensationCents: selected.compensationCents,
        carrierMissionText: scenario.carrierMissionText, reliability: selected.intent.reliability,
        pickupNodeId: selected.offer.availableNodeId, destinationNodeId: request.destinationNodeId,
        candidateCount: candidates.length, claimBoundary: scenario.claimBoundary,
      };
    }

    function fulfill(request) { return match(request); }
    function settle({ journey }) {
      const state = sdk.state.read();
      if (!state.plan || state.plan.status !== 'matched') return null;
      const settlement = { schema: 'simulatte.plugin.p2pDeliverySettlement.v1', requestId: state.request.id, carrierId: state.plan.carrierId, compensationCents: state.plan.compensationCents, status: journey?.finalState?.status === 'completed' ? 'settled' : 'not_settled' };
      sdk.events.propose({ pluginId: 'p2p-delivery', kind: 'p2p-delivery.settled', settlement });
      sdk.receipts.append(settlement);
      return { obligationResults: [{ obligationId: `p2p-delivery:${state.request.id}`, status: settlement.status }], stateIdentity: state.request.id, losses: settlement.status === 'settled' ? [] : ['journey_not_completed'], settlement };
    }
    function deliverySettlement(input) { return settle(input); }
    function view() {
      const { plan, settlement } = sdk.state.read();
      if (!plan) return null;
      return { slot: 'inspector', title: 'Cooperative delivery', rows: [{ label: 'Match', value: plan.status === 'matched' ? plan.carrierId : 'No eligible carrier' }, { label: 'Compensation', value: plan.compensationCents === undefined ? 'Not settled' : `$${(plan.compensationCents / 100).toFixed(2)}` }, { label: 'Settlement', value: settlement?.status || 'Pending' }], actions: [] };
    }
    return Object.freeze({ id: 'p2p-delivery', contributeRequest, settle, view, capabilities: { 'fulfillment.delivery.v1': fulfill, 'settlement.delivery.v1': deliverySettlement }, dispose() {} });
  }
  function reduce(state, event) {
    if (event.kind === 'p2p-delivery.plan-created') return { ...state, request: event.request, plan: event.plan };
    if (event.kind === 'p2p-delivery.settled') return { ...state, settlement: event.settlement };
    return state;
  }
  return Object.freeze({ activate });
});
