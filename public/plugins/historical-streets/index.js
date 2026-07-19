(function attachHistoricalStreetsPlugin(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginHistoricalStreets = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createHistoricalStreetsPlugin() {
  async function activate({ sdk }) {
    const registry = sdk.datasets.require('nyc-world-snapshot-registry-v1');
    function selectSnapshot({ date }) {
      const row = registry.snapshots.find((snapshot) => snapshot.date === date || snapshot.snapshotDate === date) || null;
      return row ? { enabled: true, snapshot: row } : { enabled: false, reason: 'snapshot_not_loaded', requestedDate: date, availableDates: registry.snapshots.map((snapshot) => snapshot.date || snapshot.snapshotDate).sort() };
    }
    function view() {
      return { slot: 'inspector', title: 'World history', rows: [{ label: 'Available snapshots', value: String(registry.snapshots.length) }], actions: [] };
    }
    return Object.freeze({ id: 'historical-streets', capabilities: { 'world.snapshot.v1': selectSnapshot }, view, dispose() {} });
  }
  return Object.freeze({ activate });
});
