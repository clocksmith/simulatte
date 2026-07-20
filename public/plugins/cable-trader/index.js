(function attachCableTraderPlugin(root, factory) {
  const network = typeof module === 'object' && module.exports
    ? require('./network-simulation.js')
    : root.SimulatteCableTraderNetwork;
  const api = factory(network);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginCableTrader = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCableTraderPlugin(network) {
  async function activate({ sdk, config }) {
    const worldModel = sdk.worldQuery.model();
    const transferRoutes = config.hubs.flatMap((sourceHub) => config.hubs
      .filter((destinationHub) => destinationHub.id !== sourceHub.id)
      .map((destinationHub) => {
        const route = sdk.routing.plan({
          worldModel,
          originNodeId: sourceHub.nodeId,
          destinationNodeId: destinationHub.nodeId,
          mode: 'delivery_bike',
          tick: 0,
          mission: { constraints: { avoidStreetNames: [], lanePreference: 'protected' }, task: { type: 'point_to_point' } },
          policy: sdk.routing.policy(),
        });
        return Object.freeze({
          id: `transfer-${sourceHub.id}-${destinationHub.id}`,
          sourceHubId: sourceHub.id,
          destinationHubId: destinationHub.id,
          segmentIds: route.segmentIds,
          costUnits: Math.max(1, route.segmentIds.length),
        });
      }));
    const simulation = network.simulateNetwork(config, transferRoutes);
    sdk.state.register(reduce, { simulation, inventory: simulation.endingInventory, credits: {}, lastExchange: null });
    sdk.receipts.append({
      schema: 'simulatte.plugin.cableTraderNetworkReceipt.v1',
      simulationId: simulation.id,
      seed: simulation.seed,
      durationDays: simulation.durationDays,
      summary: simulation.summary,
      solver: simulation.solver,
      claimBoundary: simulation.claimBoundary,
    });

    function contributeRequest({ sourceText, mission = null }) {
      if (!/\b(?:cable|hub|inventory|allocation|monte\s+carlo|exchange\s+network)\b/i.test(sourceText || '')) return null;
      if (!mission) {
        return {
          recognized: true,
          executableSourceText: `Bike from ${config.hubs[0].label} to ${config.hubs.at(-1).label}. Prefer protected lanes.`,
          obligations: [],
          unresolved: [],
        };
      }
      return {
        recognized: true,
        obligations: [{ id: simulation.id, kind: 'optimal_cable_network', required: true }],
        unresolved: [],
      };
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
      const result = state.simulation;
      const busiestHub = [...result.hubStats].sort((left, right) => right.needs - left.needs || left.id.localeCompare(right.id))[0];
      const busiestCable = [...result.typeStats].sort((left, right) => right.needs - left.needs || left.id.localeCompare(right.id))[0];
      const crossHubTransfers = result.flows.filter((flow) => flow.sourceHubId !== flow.destinationHubId).reduce((total, flow) => total + flow.quantity, 0);
      return [{
        slot: 'inspector',
        title: 'Optimal cable network',
        rows: [
          { label: 'Seeded month', value: `${result.durationDays} days · ${result.seed}` },
          { label: 'Needs served', value: `${format(result.summary.fulfilledNeeds)} / ${format(result.summary.needs)} (${result.summary.fulfillmentPercent}%)` },
          { label: 'Monte Carlo events', value: format(result.summary.randomEvents) },
          { label: 'Exact allocations', value: `${result.summary.optimalAllocations} / ${result.summary.allocations} (${result.summary.optimalityPercent}%)` },
          { label: 'Inventory', value: `${format(result.summary.startingInventory)} → ${format(result.summary.endingInventory)}` },
          { label: 'Busiest hub', value: `${busiestHub.label} · ${format(busiestHub.needs)} needs` },
          { label: 'Top cable', value: `${busiestCable.label} · ${format(busiestCable.needs)} needs` },
          ...(state.lastExchange ? [{ label: 'Last live exchange', value: `${state.lastExchange.direction} · ${state.lastExchange.hubId}` }] : []),
        ],
        actions: [],
      }, {
        slot: 'map',
        title: '30-day cable city',
        rows: [
          { label: 'Synthetic participants', value: format(result.summary.participants) },
          { label: 'Rendered sample', value: String(config.simulation.renderedActorCount) },
          { label: 'Cross-hub transfers', value: format(crossHubTransfers) },
          { label: 'Solver', value: 'Exact min-cost maximum-flow' },
        ],
        actions: [
          { id: 'focus-network', label: 'Whole network', command: { kind: 'camera.focus', targetId: 'cable-network' } },
          ...config.hubs.map((hub) => ({ id: `focus-${hub.id}`, label: hub.label, command: { kind: 'camera.focus', targetId: hub.id } })),
        ],
      }];
    }

    function present() {
      const result = sdk.state.read().simulation;
      const routeByPair = new Map(transferRoutes.map((route) => [`${route.sourceHubId}:${route.destinationHubId}`, route]));
      const activeFlows = result.flows.filter((flow) => flow.sourceHubId !== flow.destinationHubId && flow.quantity > 0);
      const maximumFlow = Math.max(...activeFlows.map((flow) => flow.quantity), 1);
      const maximumNeeds = Math.max(...result.hubStats.map((hub) => hub.needs), 1);
      const paths = activeFlows.map((flow, index) => {
        const route = routeByPair.get(`${flow.sourceHubId}:${flow.destinationHubId}`);
        return {
          id: route.id,
          label: `${format(flow.quantity)} optimal transfers`,
          segmentIds: route.segmentIds,
          tone: flowTone(index),
          widthM: 2.5 + ((flow.quantity / maximumFlow) * 8),
          intensity: 0.45 + ((flow.quantity / maximumFlow) * 1.25),
        };
      });
      const actors = Array.from({ length: config.simulation.renderedActorCount }, (_, index) => {
        const flow = selectFlow(activeFlows, index, config.simulation.renderedActorCount);
        const route = routeByPair.get(`${flow.sourceHubId}:${flow.destinationHubId}`);
        return {
          id: `cable-participant-${index + 1}`,
          label: `Participant ${index + 1}`,
          kind: index % 5 === 0 ? 'scooter' : 'bicycle',
          segmentIds: route.segmentIds,
          tone: flowTone(activeFlows.indexOf(flow)),
          speedMps: 4.4 + ((index % 7) * 0.24),
          phaseOffsetM: (index * 173) % 2400,
          isSelected: false,
        };
      });
      const allSegments = [...new Set(transferRoutes.flatMap((route) => route.segmentIds))];
      return {
        schema: 'simulatte.pluginPresentation.v1',
        markers: result.hubStats.map((hub) => ({
          id: hub.id,
          label: `${hub.label}: ${format(hub.fulfilled)} served · ${format(hub.endingInventory)} stock`,
          nodeId: config.hubs.find((row) => row.id === hub.id).nodeId,
          tone: hub.needs === maximumNeeds ? 'green' : 'amber',
          heightM: 100 + ((hub.needs / maximumNeeds) * 120),
          radiusM: 20 + ((hub.needs / maximumNeeds) * 20),
          intensity: 0.8 + ((hub.needs / maximumNeeds) * 1.2),
        })),
        paths,
        actors,
        cameraTargets: [
          { id: 'cable-network', label: 'Cable exchange network', nodeIds: config.hubs.map((hub) => hub.nodeId), segmentIds: allSegments, distanceM: 3000 },
          ...config.hubs.map((hub) => ({ id: hub.id, label: hub.label, nodeIds: [hub.nodeId], segmentIds: [], distanceM: 620 })),
        ],
      };
    }

    return Object.freeze({
      id: 'cable-trader',
      contributeRequest,
      view,
      present,
      capabilities: { 'inventory.exchange.v1': exchange, 'settlement.credit.v1': exchange },
      dispose() {},
    });
  }

  function reduce(state, event) {
    if (event.kind !== 'cable-trader.exchanged') return state;
    const key = `${event.hubId}:${event.cableTypeId}`;
    const inventory = { ...state.inventory, [key]: (state.inventory[key] || 0) + (event.direction === 'deposit' ? 1 : -1) };
    const credits = { ...state.credits, [event.participantId]: (state.credits[event.participantId] || 0) + event.creditDelta };
    return { ...state, inventory, credits, lastExchange: { cableTypeId: event.cableTypeId, hubId: event.hubId, direction: event.direction } };
  }

  function selectFlow(flows, index, count) {
    const total = flows.reduce((sum, flow) => sum + flow.quantity, 0);
    let target = ((index + 0.5) / count) * total;
    for (const flow of flows) { target -= flow.quantity; if (target <= 0) return flow; }
    return flows.at(-1);
  }

  function flowTone(index) { return ['cyan', 'blue', 'magenta', 'violet', 'green', 'amber'][index % 6]; }
  function format(value) { return Number(value).toLocaleString('en-US'); }
  return Object.freeze({ activate });
});
