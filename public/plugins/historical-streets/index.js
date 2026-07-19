(function attachHistoricalStreetsPlugin(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginHistoricalStreets = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createHistoricalStreetsPlugin() {
  async function activate({ sdk }) {
    const registry = sdk.datasets.require('nyc-world-snapshot-registry-v1');
    sdk.state.register(reduce, { selected: registry.snapshots.at(-1) || null });
    function selectSnapshot({ date }) {
      const row = registry.snapshots.find((snapshot) => snapshot.date === date || snapshot.snapshotDate === date) || null;
      return row ? { enabled: true, snapshot: row } : { enabled: false, reason: 'snapshot_not_loaded', requestedDate: date, availableDates: registry.snapshots.map((snapshot) => snapshot.date || snapshot.snapshotDate).sort() };
    }
    function view() {
      const state = sdk.state.read();
      const options = registry.snapshots.map((row) => row.date || row.snapshotDate).sort().map((date) => ({ value: date, label: date }));
      return [
        { slot: 'inspector', title: 'World history', rows: [{ label: 'Available snapshots', value: String(registry.snapshots.length) }, { label: 'Selected world', value: state.selected?.worldContentVersion || 'None' }], fields: [{ id: 'date', label: 'Snapshot', type: 'select', value: state.selected?.snapshotDate || options.at(-1)?.value || '', options }], actions: [{ id: 'select', label: 'Load snapshot identity' }] },
        { slot: 'hud', title: 'Historical streets', rows: [{ label: 'Snapshot', value: state.selected?.snapshotDate || 'Unavailable' }, { label: 'State', value: state.selected?.status || 'Unavailable' }], actions: [] },
      ];
    }
    function handleAction(actionId, context) {
      if (actionId !== 'select') throw new Error(`historical_streets_action_unknown: ${actionId}`);
      const result = selectSnapshot({ date: context.values?.date });
      if (result.enabled) sdk.events.propose({ pluginId: 'historical-streets', kind: 'historical-streets.selected', snapshot: result.snapshot });
      return result;
    }
    return Object.freeze({ id: 'historical-streets', capabilities: { 'world.snapshot.v1': selectSnapshot }, view, handleAction, dispose() {} });
  }
  function reduce(state, event) { return event.kind === 'historical-streets.selected' ? { ...state, selected: event.snapshot } : state; }
  return Object.freeze({ activate });
});
