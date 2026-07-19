(function attachCableTraderPlugin(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginCableTrader = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCableTraderPlugin() {
  async function activate({ sdk, config }) {
    sdk.state.register(reduce, { inventory: config.inventory, credits: {}, activeRequest: null, delivery: null });
    function contributeRequest({ sourceText }) {
      const cable = config.cableTypes.find((row) => row.labels.some((label) => String(sourceText || '').toLowerCase().includes(label)));
      if (!cable || !/\b(?:need|request|trade|swap|borrow|get)\b/i.test(sourceText || '')) return null;
      const request = { id: `cable-request:${stableId(sourceText)}`, cableTypeId: cable.id, quantity: 1, hubIds: config.hubs.map((row) => row.id) };
      let delivery = null;
      if (sdk.capabilities) delivery = sdk.capabilities.invoke('fulfillment.delivery.v1', { ...request, itemId: cable.id, requesterId: 'cable-trader-user', destinationNodeId: config.hubs[0].nodeId });
      sdk.events.propose({ pluginId: 'cable-trader', kind: 'cable-trader.requested', request, delivery });
      sdk.receipts.append({ schema: 'simulatte.plugin.cableTraderRequestReceipt.v1', request, delivery: delivery || { enabled: false, reason: 'pickup_only' } });
      return { recognized: true, obligations: [{ id: request.id, kind: 'cable_exchange', required: true }], unresolved: [] };
    }
    function exchange({ cableTypeId, hubId, direction, participantId }) {
      const state = sdk.state.read();
      const key = `${hubId}:${cableTypeId}`;
      const available = state.inventory[key] || 0;
      if (direction === 'withdraw' && available < 1) return { status: 'refused', reason: 'inventory_unavailable' };
      const event = { pluginId: 'cable-trader', kind: 'cable-trader.exchanged', cableTypeId, hubId, direction, participantId, creditDelta: direction === 'deposit' ? 1 : -1 };
      sdk.events.propose(event);
      return { status: 'settled', ...event };
    }
    function view() {
      const state = sdk.state.read();
      if (!state.activeRequest) return { slot: 'inspector', title: 'Cable Trader', rows: [{ label: 'Cable types', value: String(config.cableTypes.length) }, { label: 'Exchange hubs', value: String(config.hubs.length) }], actions: [] };
      return { slot: 'inspector', title: 'Cable Trader', rows: [{ label: 'Requested', value: state.activeRequest.cableTypeId }, { label: 'Fulfillment', value: state.delivery?.status || 'Hub pickup' }], actions: [] };
    }
    return Object.freeze({ id: 'cable-trader', contributeRequest, view, capabilities: { 'inventory.exchange.v1': exchange, 'settlement.credit.v1': exchange }, dispose() {} });
  }
  function reduce(state, event) {
    if (event.kind === 'cable-trader.requested') return { ...state, activeRequest: event.request, delivery: event.delivery };
    if (event.kind !== 'cable-trader.exchanged') return state;
    const key = `${event.hubId}:${event.cableTypeId}`;
    const inventory = { ...state.inventory, [key]: (state.inventory[key] || 0) + (event.direction === 'deposit' ? 1 : -1) };
    const credits = { ...state.credits, [event.participantId]: (state.credits[event.participantId] || 0) + event.creditDelta };
    return { ...state, inventory, credits };
  }
  function stableId(value) { let hash = 2166136261; for (const character of String(value)) { hash ^= character.codePointAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16); }
  return Object.freeze({ activate });
});
