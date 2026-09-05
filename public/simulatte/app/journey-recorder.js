(function attachJourneyRecorder(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteJourneyRecorder = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createJourneyRecorderModule() {
  function create({ getContext, isCurrent, ledger, onReceipt, refreshLedger }) {
    const attempts = new WeakMap();
    const retained = new Set();
    function record(controller) {
      const context = getContext();
      if (!isCurrent(context)) return Promise.resolve(null);
      const previous = attempts.get(controller);
      if (previous?.revision === context.revision) return previous.promise;
      const entry = { revision: context.revision, promise: null };
      entry.promise = (async () => {
        const receipt = structuredClone(await controller.journeyReceipt());
        if (!isCurrent(context)) return null;
        receipt.pluginSettlement = structuredClone(await context.runtime.settle({ journey: receipt }));
        if (!isCurrent(context)) return null;
        receipt.pluginRuntime = structuredClone(context.runtime.runtimeReceipt());
        const identity = `${receipt.mission.id}:${receipt.integrity.terminalHash}:${receipt.finalState.status}`;
        if (!retained.has(identity)) {
          await ledger.append(receipt);
          retained.add(identity);
        }
        if (!isCurrent(context)) return null;
        await onReceipt(receipt, context.mission);
        if (isCurrent(context)) await refreshLedger();
        return receipt;
      })().catch((error) => {
        if (attempts.get(controller) === entry) attempts.delete(controller);
        throw error;
      });
      attempts.set(controller, entry);
      return entry.promise;
    }
    return Object.freeze({ record });
  }
  return Object.freeze({ create });
});
