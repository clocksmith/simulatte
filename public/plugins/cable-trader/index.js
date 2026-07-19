(function attachCableTraderPlugin(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginCableTrader = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCableTraderPlugin() {
  async function activate({ sdk, config }) {
    sdk.state.register(reduce, { inventory: config.inventory, credits: {}, activeRequest: null, delivery: null, lastExchange: null });
    const worldModel = sdk.worldQuery.model();
    const candidateRoutes = config.candidateJourneys.map((journey) => ({
      ...journey,
      segmentIds: sdk.routing.plan({
        worldModel,
        originNodeId: journey.originNodeId,
        destinationNodeId: journey.destinationNodeId,
        mode: 'delivery_bike',
        tick: 0,
        mission: { constraints: { avoidStreetNames: [], lanePreference: journey.kind === 'bicycle' ? 'protected' : 'any' }, task: { type: 'point_to_point' } },
        policy: sdk.routing.policy(),
      }).segmentIds,
    }));

    function contributeRequest({ sourceText, mission = null }) {
      const normalized = String(sourceText || '').toLowerCase();
      const cable = config.cableTypes.find((row) => row.labels.some((label) => normalized.includes(label)));
      if (!cable || !/\b(?:need|request|trade|swap|borrow|get)\b/i.test(normalized)) return null;
      const availableHub = config.hubs
        .map((hub) => ({ ...hub, available: sdk.state.read().inventory[`${hub.id}:${cable.id}`] || 0 }))
        .sort((left, right) => right.available - left.available || left.id.localeCompare(right.id))[0];
      if (!mission) return { recognized: true, executableSourceText: `Bike from Washington Square to ${availableHub.label}. Prefer protected lanes.`, obligations: [], unresolved: [] };
      const request = { id: `cable-request:${stableId(sourceText)}`, cableTypeId: cable.id, quantity: 1, hubIds: config.hubs.map((row) => row.id), selectedHubId: availableHub?.available ? availableHub.id : null };
      let delivery = null;
      if (sdk.capabilities && availableHub?.available) delivery = sdk.capabilities.invoke('fulfillment.delivery.v1', { ...request, itemId: cable.id, requesterId: 'cable-trader-user', destinationNodeId: availableHub.nodeId });
      sdk.events.propose({ pluginId: 'cable-trader', kind: 'cable-trader.requested', request, delivery });
      sdk.receipts.append({ schema: 'simulatte.plugin.cableTraderRequestReceipt.v1', request, delivery: delivery || { enabled: false, reason: availableHub?.available ? 'pickup_only' : 'inventory_unavailable' } });
      return { recognized: true, obligations: [{ id: request.id, kind: 'cable_exchange', required: true }], unresolved: availableHub?.available ? [] : [`inventory:${cable.id}`] };
    }

    function exchange({ cableTypeId, hubId, direction, participantId }) {
      const state = sdk.state.read();
      const key = `${hubId}:${cableTypeId}`;
      const available = state.inventory[key] || 0;
      if (!config.hubs.some((row) => row.id === hubId) || !config.cableTypes.some((row) => row.id === cableTypeId)) return { status: 'refused', reason: 'exchange_selection_invalid' };
      if (!['deposit', 'withdraw'].includes(direction)) return { status: 'refused', reason: 'exchange_direction_invalid' };
      if (direction === 'withdraw' && available < 1) return { status: 'refused', reason: 'inventory_unavailable' };
      const event = { pluginId: 'cable-trader', kind: 'cable-trader.exchanged', cableTypeId, hubId, direction, participantId, creditDelta: direction === 'deposit' ? 1 : -1 };
      sdk.events.propose(event);
      return { status: 'settled', ...event };
    }

    function view() {
      const state = sdk.state.read();
      const cable = config.cableTypes.find((row) => row.id === state.activeRequest?.cableTypeId) || config.cableTypes[0];
      const available = config.hubs.reduce((total, hub) => total + (state.inventory[`${hub.id}:${cable.id}`] || 0), 0);
      const inspector = {
        slot: 'inspector', title: 'Cable exchange',
        rows: [
          { label: 'Catalog', value: `${config.cableTypes.length} cable families` },
          { label: 'Requested', value: state.activeRequest ? cable.label : 'No active request' },
          { label: 'Network inventory', value: `${available} available` },
          ...(state.lastExchange ? [{ label: 'Last exchange', value: `${state.lastExchange.direction} · ${state.lastExchange.hubId}` }] : []),
        ],
        fields: [
          { id: 'cableTypeId', label: 'Cable', type: 'select', value: cable.id, options: config.cableTypes.map((row) => ({ value: row.id, label: row.label })) },
          { id: 'hubId', label: 'Exchange hub', type: 'select', value: state.activeRequest?.selectedHubId || config.hubs[0].id, options: config.hubs.map((row) => ({ value: row.id, label: row.label })) },
        ],
        actions: [{ id: 'withdraw', label: 'Take for 1 credit' }, { id: 'deposit', label: 'Drop off +1 credit' }],
      };
      return [inspector, {
        slot: 'map', title: state.activeRequest ? `${cable.label} exchange` : 'Cable exchange network',
        rows: [{ label: 'Hubs', value: String(config.hubs.length) }, { label: 'Nearby journeys', value: String(candidateRoutes.length) }, { label: 'Available', value: String(available) }],
        actions: [
          { id: 'focus-network', label: 'All hubs', command: { kind: 'camera.focus', targetId: 'cable-network' } },
          ...config.hubs.map((hub) => ({ id: `focus-${hub.id}`, label: hub.label, command: { kind: 'camera.focus', targetId: hub.id } })),
        ],
      }];
    }

    function present() {
      const state = sdk.state.read();
      const requestedType = state.activeRequest?.cableTypeId || null;
      const selectedHubId = state.activeRequest?.selectedHubId || null;
      return {
        schema: 'simulatte.pluginPresentation.v1',
        markers: config.hubs.map((hub) => {
          const stock = requestedType ? state.inventory[`${hub.id}:${requestedType}`] || 0 : inventoryAtHub(state.inventory, hub.id);
          return { id: hub.id, label: `${hub.label}: ${stock} available`, nodeId: hub.nodeId, tone: requestedType && !stock ? 'red' : hub.id === selectedHubId ? 'green' : 'amber', heightM: hub.id === selectedHubId ? 72 : 48, radiusM: hub.id === selectedHubId ? 5 : 3.5, intensity: hub.id === selectedHubId ? 1.7 : 1.2 };
        }),
        paths: candidateRoutes.map((row) => ({ id: `${row.id}-path`, label: `${row.label} journey`, segmentIds: row.segmentIds, tone: 'muted', widthM: 2.2, intensity: 0.42 })),
        actors: candidateRoutes.map((row) => ({ id: row.id, label: row.label, kind: row.kind, segmentIds: row.segmentIds, tone: 'cyan', speedMps: row.speedMps, phaseOffsetM: row.phaseOffsetM, isSelected: false })),
        cameraTargets: [
          { id: 'cable-network', label: 'Cable exchange network', nodeIds: config.hubs.map((row) => row.nodeId), segmentIds: [...new Set(candidateRoutes.flatMap((row) => row.segmentIds))], distanceM: 2600 },
          ...config.hubs.map((hub) => ({ id: hub.id, label: hub.label, nodeIds: [hub.nodeId], segmentIds: [], distanceM: 620 })),
        ],
      };
    }

    function handleAction(actionId, context) {
      if (!['deposit', 'withdraw'].includes(actionId)) throw new Error(`cable_trader_action_unknown: ${actionId}`);
      return exchange({ cableTypeId: context.values?.cableTypeId, hubId: context.values?.hubId, direction: actionId, participantId: 'local-participant' });
    }

    return Object.freeze({ id: 'cable-trader', contributeRequest, view, present, handleAction, capabilities: { 'inventory.exchange.v1': exchange, 'settlement.credit.v1': exchange }, dispose() {} });
  }

  function reduce(state, event) {
    if (event.kind === 'cable-trader.requested') return { ...state, activeRequest: event.request, delivery: event.delivery };
    if (event.kind !== 'cable-trader.exchanged') return state;
    const key = `${event.hubId}:${event.cableTypeId}`;
    const inventory = { ...state.inventory, [key]: (state.inventory[key] || 0) + (event.direction === 'deposit' ? 1 : -1) };
    const credits = { ...state.credits, [event.participantId]: (state.credits[event.participantId] || 0) + event.creditDelta };
    return { ...state, inventory, credits, lastExchange: { cableTypeId: event.cableTypeId, hubId: event.hubId, direction: event.direction } };
  }

  function inventoryAtHub(inventory, hubId) { return Object.entries(inventory).reduce((total, [key, count]) => total + (key.startsWith(`${hubId}:`) ? count : 0), 0); }
  function stableId(value) { let hash = 2166136261; for (const character of String(value)) { hash ^= character.codePointAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16); }
  return Object.freeze({ activate });
});
