(function attachPluginPlayback(root, factory) {
  const comparisonAdapter = typeof module === 'object' && module.exports
    ? require('../platform/core/simulation/comparison-result-adapter.js')
    : root.SimulatteComparisonResultAdapter;
  const api = factory(comparisonAdapter);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginPlayback = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPluginPlaybackModule(comparisonAdapter) {
  function createController({
    runtime,
    ownerPluginId,
    scenario,
    clock,
    render,
    getControlValues = () => ({}),
    onPhase,
    onSettled,
    onError,
  }) {
    if (!runtime || typeof runtime.dispatchAction !== 'function' || typeof runtime.settle !== 'function') {
      throw playbackError('plugin_playback_runtime_invalid', 'Plugin playback expected a runtime with actions and settlement');
    }
    if (typeof ownerPluginId !== 'string' || !ownerPluginId) {
      throw playbackError('plugin_playback_owner_invalid', 'Plugin playback expected an owner plugin ID');
    }
    if (!clock || typeof clock.subscribe !== 'function') {
      throw playbackError('plugin_playback_clock_invalid', 'Plugin playback expected a shared simulation clock');
    }
    let activeScenario = scenario;
    let actionResult = null;
    let parameterValues = {};
    let phase = 'ready';
    let actionQueue = Promise.resolve();
    const unsubscribe = clock.subscribe((message) => {
      if (message.type !== 'event') return;
      actionQueue = actionQueue.then(advance).catch(fail);
    });

    async function start() {
      if (phase === 'running') return snapshot();
      if (phase === 'completed' || phase === 'failed') await reset(activeScenario);
      parameterValues = normalizedValues(getControlValues(ownerPluginId));
      setPhase('running');
      actionResult = await dispatch('start');
      if (actionResult.status !== 'running' && actionResult.status !== 'settled') {
        throw playbackError('plugin_playback_start_refused', `Plugin ${ownerPluginId} refused playback start`, { actionResult });
      }
      render();
      if (actionResult.status === 'settled') return complete();
      clock.play();
      return snapshot();
    }

    function pause() {
      clock.pause();
      if (phase === 'running') setPhase('paused');
      return snapshot();
    }

    function resume() {
      if (phase !== 'paused') return snapshot();
      setPhase('running');
      clock.play();
      return snapshot();
    }

    async function step() {
      if (phase === 'ready') {
        actionResult = await dispatch('start');
        render();
      }
      if (!['running', 'paused', 'ready'].includes(phase)) return snapshot();
      setPhase('paused');
      clock.pause();
      clock.step(1);
      await actionQueue;
      return snapshot();
    }

    async function replay() {
      await reset(activeScenario);
      return start();
    }

    async function restore(receipt) {
      validateRestoreReceipt(receipt, ownerPluginId);
      clock.pause();
      setPhase('running');
      activeScenario = receipt.scenario;
      parameterValues = normalizedValues(receipt.parameterValues);
      await runtime.setScenario(activeScenario);
      actionResult = await dispatch('start');
      const targetStep = receipt.actionResult.currentStep;
      for (let stepIndex = 0; stepIndex < targetStep; stepIndex += 1) {
        actionResult = await dispatch('step');
      }
      if (JSON.stringify(actionResult) !== JSON.stringify(receipt.actionResult)) {
        throw playbackError('plugin_playback_restore_diverged', 'Reconstructed action result differs from the stored receipt', {
          expected: receipt.actionResult,
          actual: actionResult,
        });
      }
      render();
      clock.seek(receipt.clock.state.currentMs);
      const settlements = await runtime.settle({ scenario: activeScenario, actionResult });
      if (JSON.stringify(settlements) !== JSON.stringify(receipt.settlements)) {
        throw playbackError('plugin_playback_restore_settlement_diverged', 'Reconstructed settlement differs from the stored receipt', {
          expected: receipt.settlements,
          actual: settlements,
        });
      }
      const comparisonExecutionReceipt = await executeComparison();
      if (receipt.comparisonExecutionReceipt
        && JSON.stringify(comparisonExecutionReceipt) !== JSON.stringify(receipt.comparisonExecutionReceipt)) {
        throw playbackError('plugin_playback_restore_comparison_diverged', 'Reconstructed comparison differs from the stored receipt', {
          expected: receipt.comparisonExecutionReceipt,
          actual: comparisonExecutionReceipt,
        });
      }
      return publishSettlement(settlements, comparisonExecutionReceipt);
    }

    async function reset(nextScenario = activeScenario) {
      clock.pause();
      activeScenario = nextScenario;
      await runtime.setScenario(activeScenario);
      actionResult = null;
      render();
      clock.seek(0);
      setPhase('ready');
      return snapshot();
    }

    async function advance() {
      if (!['running', 'paused'].includes(phase)) return snapshot();
      actionResult = await dispatch('step');
      render();
      if (actionResult.status === 'settled') return complete();
      if (actionResult.status !== 'running') {
        throw playbackError('plugin_playback_step_refused', `Plugin ${ownerPluginId} refused playback step`, { actionResult });
      }
      return snapshot();
    }

    async function complete() {
      clock.pause();
      const settlements = await runtime.settle({ scenario: activeScenario, actionResult });
      if (!settlements.length || settlements.some((row) => row.obligationResults.some((result) => result.status !== 'settled'))) {
        throw playbackError('plugin_playback_settlement_incomplete', `Plugin ${ownerPluginId} did not settle every obligation`, { settlements });
      }
      return publishSettlement(settlements, await executeComparison());
    }

    async function executeComparison() {
      if (typeof runtime.platformV4 !== 'function') return null;
      const platform = runtime.platformV4({ scenario: activeScenario, compositionSize: runtime.activePluginIds?.length || 1 });
      const contribution = platform.contributions.find((row) => row.pluginId === ownerPluginId);
      const definition = contribution?.controls?.comparisons?.[0] || null;
      if (!definition) return null;
      if (!comparisonAdapter?.createSettledComparison) {
        throw playbackError('plugin_playback_comparison_adapter_missing', 'Shared comparison execution is unavailable');
      }
      const comparison = await runtime.dispatchAction(ownerPluginId, 'counterfactual.compare', {
        scenario: activeScenario,
        values: {},
      });
      if (comparison?.status !== 'settled' || !comparison.comparisonBranches) {
        throw playbackError('plugin_playback_comparison_missing', `Plugin ${ownerPluginId} did not execute both comparison branches`, { comparison });
      }
      return comparisonAdapter.createSettledComparison({
        pluginId: ownerPluginId,
        scenario: activeScenario,
        comparisonId: comparison.comparisonId || definition.id,
        branches: comparison.comparisonBranches,
        contribution,
      });
    }

    function publishSettlement(settlements, comparisonExecutionReceipt = null) {
      setPhase('completed');
      const receipt = Object.freeze({
        schema: 'simulatte.pluginPlaybackRunReceipt.v1',
        ownerPluginId,
        scenario: activeScenario,
        parameterValues,
        actionResult,
        settlements,
        comparisonExecutionReceipt,
        clock: clock.receipt(),
        runtime: runtime.runtimeReceipt(),
      });
      onSettled?.(receipt);
      return snapshot();
    }

    function dispatch(nextPhase) {
      return runtime.dispatchAction(ownerPluginId, 'scenario.run', {
        scenario: activeScenario,
        values: { ...parameterValues, phase: nextPhase },
      });
    }

    function setPhase(nextPhase) {
      phase = nextPhase;
      onPhase?.(phase, snapshot());
    }

    function fail(error) {
      clock.pause();
      phase = 'failed';
      onError?.(error);
      return snapshot();
    }

    function snapshot() {
      return Object.freeze({
        schema: 'simulatte.pluginPlaybackState.v1',
        ownerPluginId,
        scenarioId: activeScenario?.id || null,
        phase,
        actionStatus: actionResult?.status || null,
        currentStep: actionResult?.currentStep || 0,
        totalSteps: actionResult?.totalSteps || 0,
        clock: clock.snapshot(),
      });
    }

    function dispose() {
      clock.pause();
      unsubscribe();
    }

    return Object.freeze({ dispose, pause, replay, reset, restore, resume, snapshot, start, step });
  }

  function validateRestoreReceipt(value, ownerPluginId) {
    if (!value || value.schema !== 'simulatte.pluginPlaybackRunReceipt.v1') {
      throw playbackError('plugin_playback_restore_schema_invalid', 'Stored playback receipt has the wrong schema');
    }
    if (value.ownerPluginId !== ownerPluginId) {
      throw playbackError('plugin_playback_restore_owner_mismatch', `Stored receipt belongs to ${value.ownerPluginId || 'missing'}, expected ${ownerPluginId}`);
    }
    if (!value.scenario?.id || !value.scenario?.seed || value.actionResult?.status !== 'settled') {
      throw playbackError('plugin_playback_restore_receipt_incomplete', 'Stored playback receipt is missing a settled scenario result');
    }
    if (!Number.isInteger(value.actionResult.currentStep) || value.actionResult.currentStep < 0) {
      throw playbackError('plugin_playback_restore_step_invalid', 'Stored playback receipt has an invalid step');
    }
    if (!Number.isFinite(value.clock?.state?.currentMs) || !Array.isArray(value.settlements)) {
      throw playbackError('plugin_playback_restore_evidence_invalid', 'Stored playback receipt is missing clock or settlement evidence');
    }
    if (value.parameterValues !== undefined && (!value.parameterValues || typeof value.parameterValues !== 'object' || Array.isArray(value.parameterValues))) {
      throw playbackError('plugin_playback_restore_parameters_invalid', 'Stored playback receipt has invalid parameter values');
    }
  }

  function normalizedValues(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, Array.isArray(entry) ? [...entry] : entry]));
  }

  function storageKey(profileId) {
    return `simulatte.pluginPlaybackRunReceipt.v1:${profileId}`;
  }

  function loadStoredReceipt(storage, profileId) {
    if (!storage || typeof storage.getItem !== 'function') return null;
    const source = storage.getItem(storageKey(profileId));
    if (!source) return null;
    try {
      const receipt = JSON.parse(source);
      if (receipt?.schema !== 'simulatte.pluginPlaybackRunReceipt.v1') return null;
      return receipt;
    } catch {
      return null;
    }
  }

  function saveStoredReceipt(storage, profileId, receipt) {
    if (!storage || typeof storage.setItem !== 'function') return;
    storage.setItem(storageKey(profileId), JSON.stringify(receipt));
  }

  function clearStoredReceipt(storage, profileId) {
    if (storage && typeof storage.removeItem === 'function') storage.removeItem(storageKey(profileId));
  }

  function browserStorage(host) {
    try {
      return host?.sessionStorage || null;
    } catch {
      return null;
    }
  }

  function playbackError(code, message, evidence = null) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulattePluginPlaybackError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return Object.freeze({ browserStorage, clearStoredReceipt, createController, loadStoredReceipt, saveStoredReceipt, storageKey });
});
