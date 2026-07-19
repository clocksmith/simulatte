(function attachCounterfactualLabPlugin(root, factory) {
  const comparison = typeof module === 'object' && module.exports
    ? require('./comparison-runner.js')
    : root.SimulatteCounterfactualRunner;
  const api = factory(comparison);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginCounterfactualLab = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCounterfactualLabPlugin(comparisonApi) {
  async function activate({ sdk }) {
    sdk.state.register(reduce, { comparison: null });
    async function compare(intervention) {
      let snapshot = null;
      if (intervention.kind === 'world_snapshot') snapshot = sdk.capabilities.invoke('world.snapshot.v1', { date: intervention.snapshotDate });
      if (snapshot?.enabled === false) return snapshot;
      const result = await comparisonApi.compareCounterfactual({ sdk, mission: intervention.mission, routeObjective: intervention.routeObjective, intervention: intervention.change });
      sdk.events.propose({ pluginId: 'counterfactual-lab', kind: 'counterfactual-lab.compared', comparison: result });
      sdk.receipts.append({ schema: 'simulatte.plugin.counterfactualLabReceipt.v1', comparison: result });
      return result;
    }
    function view() {
      const comparison = sdk.state.read().comparison;
      const inspector = {
        slot: 'inspector',
        title: 'What if',
        rows: comparison ? [
          { label: 'Intervention', value: comparison.intervention?.kind || 'Unknown' },
          { label: 'Completion changed', value: comparison.diff?.completionChanged ? 'Yes' : 'No' },
          { label: 'Route overlap', value: comparison.diff?.routeJaccard === null ? 'Unavailable' : `${Math.round(comparison.diff.routeJaccard * 100)}%` },
        ] : [{ label: 'Comparison', value: 'Choose one declared change' }],
        fields: [
          { id: 'kind', label: 'Change', type: 'select', value: 'close_street', options: [{ value: 'close_street', label: 'Close a street' }, { value: 'historical_crash_weighting', label: 'Weight reported crashes' }, { value: 'world_snapshot', label: 'Replay a dated world' }] },
          { id: 'value', label: 'Street, weight, or date', type: 'text', value: 'Bedford Avenue' },
        ],
        actions: [{ id: 'compare', label: 'Compare' }],
      };
      if (!comparison) return inspector;
      return [inspector, {
        slot: 'map', title: 'Route comparison',
        rows: [{ label: 'Overlap', value: comparison.diff?.routeJaccard === null ? 'Unavailable' : `${Math.round(comparison.diff.routeJaccard * 100)}%` }, { label: 'Outcome', value: comparison.diff?.completionChanged ? 'Changed' : 'Stable' }],
        actions: [
          { id: 'focus-baseline', label: 'Baseline', command: { kind: 'camera.focus', targetId: 'baseline' } },
          ...(comparison.challenger?.route?.segmentIds?.length ? [{ id: 'focus-challenger', label: 'Changed', command: { kind: 'camera.focus', targetId: 'challenger' } }] : []),
        ],
      }];
    }
    function present() {
      const value = sdk.state.read().comparison;
      const baseline = value?.baseline?.route?.segmentIds || [];
      const challenger = value?.challenger?.route?.segmentIds || [];
      if (!baseline.length) return null;
      return {
        schema: 'simulatte.pluginPresentation.v1', markers: [], actors: [],
        paths: [
          { id: 'baseline', label: 'Baseline route', segmentIds: baseline, tone: 'blue', widthM: 5, intensity: 0.9 },
          ...(challenger.length ? [{ id: 'challenger', label: 'Changed route', segmentIds: challenger, tone: 'magenta', widthM: 7, intensity: 1.3 }] : []),
        ],
        cameraTargets: [
          { id: 'baseline', label: 'Baseline route', nodeIds: [], segmentIds: baseline, distanceM: 1200 },
          ...(challenger.length ? [{ id: 'challenger', label: 'Changed route', nodeIds: [], segmentIds: challenger, distanceM: 1200 }] : []),
        ],
      };
    }
    async function handleAction(actionId, context) {
      if (actionId !== 'compare') throw new Error(`counterfactual_action_unknown: ${actionId}`);
      if (!context.mission) throw new Error('counterfactual_mission_missing: complete or prepare a mission before comparison');
      const kind = context.values?.kind || 'close_street';
      const value = context.values?.value || '';
      const change = kind === 'close_street'
        ? { id: `close-${hash32(value).toString(16)}`, kind, streetName: value }
        : kind === 'world_snapshot'
          ? { id: `world-${value}`, kind, snapshotDate: value }
          : { id: `historical-${value}`, kind, historicalObservationWeight: Number(value) };
      return compare({ mission: context.mission, routeObjective: context.routeObjective || {}, change });
    }
    return Object.freeze({ id: 'counterfactual-lab', capabilities: { 'analysis.counterfactual.v1': compare }, view, present, handleAction, dispose() {} });
  }
  function reduce(state, event) { return event.kind === 'counterfactual-lab.compared' ? { ...state, comparison: event.comparison } : state; }
  function hash32(value) { let hash = 2166136261; for (const character of String(value)) { hash ^= character.codePointAt(0); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
  return Object.freeze({ activate });
});
