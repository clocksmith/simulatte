(function attachCounterfactualLabPlugin(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginCounterfactualLab = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCounterfactualLabPlugin() {
  async function activate({ sdk }) {
    sdk.state.register(reduce, { comparison: null });
    async function compare(intervention) {
      let snapshot = null;
      if (intervention.kind === 'world_snapshot') snapshot = sdk.capabilities.invoke('world.snapshot.v1', { date: intervention.snapshotDate });
      if (snapshot?.enabled === false) return snapshot;
      const comparison = await sdk.simulation.compare(intervention);
      sdk.events.propose({ pluginId: 'counterfactual-lab', kind: 'counterfactual-lab.compared', comparison });
      sdk.receipts.append({ schema: 'simulatte.plugin.counterfactualLabReceipt.v1', comparison });
      return comparison;
    }
    function view() {
      const comparison = sdk.state.read().comparison;
      if (!comparison) return null;
      return { slot: 'inspector', title: 'Counterfactual', rows: [{ label: 'Intervention', value: comparison.intervention?.kind || 'Unknown' }, { label: 'Completion changed', value: comparison.diff?.completionChanged ? 'Yes' : 'No' }, { label: 'Route overlap', value: comparison.diff?.routeJaccard === null ? 'Unavailable' : `${Math.round(comparison.diff.routeJaccard * 100)}%` }], actions: [] };
    }
    return Object.freeze({ id: 'counterfactual-lab', capabilities: { 'analysis.counterfactual.v1': compare }, view, dispose() {} });
  }
  function reduce(state, event) { return event.kind === 'counterfactual-lab.compared' ? { ...state, comparison: event.comparison } : state; }
  return Object.freeze({ activate });
});
