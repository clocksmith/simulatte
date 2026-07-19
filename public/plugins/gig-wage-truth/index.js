(function attachGigWageTruthPlugin(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginGigWageTruth = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createGigWageTruthPlugin() {
  async function activate({ sdk, config }) {
    sdk.state.register(reduce, { analysis: null });
    function analyze(input) {
      const delivery = sdk.capabilities.invoke('settlement.delivery.v1', input);
      if (!delivery?.settlement || delivery.settlement.status !== 'settled') return { enabled: false, reason: 'delivery_not_settled' };
      const activeSeconds = Number(input.journey?.settlement?.actualDurationSeconds || 0);
      const excludedSeconds = Number(input.waitSeconds || 0) + Number(input.returnSeconds || 0);
      const grossCents = delivery.settlement.compensationCents;
      const countedHours = Math.max(1 / 3600, (activeSeconds + (config.includeWaiting ? excludedSeconds : 0)) / 3600);
      const analysis = {
        schema: 'simulatte.plugin.gigWageTruthReceipt.v1', grossCents, activeSeconds, excludedSeconds,
        grossRateCentsPerHour: Math.round(grossCents / countedHours), includedWaiting: config.includeWaiting,
        claimBoundary: 'Gross modeled compensation divided by declared counted time. This is not net income, an employment classification, or a wage-law determination.',
      };
      sdk.events.propose({ pluginId: 'gig-wage-truth', kind: 'gig-wage-truth.analyzed', analysis });
      sdk.receipts.append(analysis);
      return analysis;
    }
    function settle(input) { const analysis = analyze(input); return analysis.enabled === false ? null : { obligationResults: [], stateIdentity: `${analysis.grossCents}:${analysis.activeSeconds}`, losses: [], analysis }; }
    function view() {
      const analysis = sdk.state.read().analysis;
      if (!analysis) return null;
      return { slot: 'inspector', title: 'Gross work rate', rows: [{ label: 'Gross compensation', value: `$${(analysis.grossCents / 100).toFixed(2)}` }, { label: 'Modeled gross rate', value: `$${(analysis.grossRateCentsPerHour / 100).toFixed(2)}/h` }, { label: 'Excluded time', value: `${analysis.excludedSeconds} s` }], actions: [] };
    }
    return Object.freeze({ id: 'gig-wage-truth', settle, view, capabilities: { 'analysis.gross-work-rate.v1': analyze }, dispose() {} });
  }
  function reduce(state, event) { return event.kind === 'gig-wage-truth.analyzed' ? { ...state, analysis: event.analysis } : state; }
  return Object.freeze({ activate });
});
