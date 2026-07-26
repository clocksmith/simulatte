(function attachTierRunController(root, factory) {
  const comparisonAdapter = typeof module === 'object' && module.exports
    ? require('../platform/core/simulation/comparison-result-adapter.js')
    : root.SimulatteComparisonResultAdapter;
  const api = factory(comparisonAdapter);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteTierRunController = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createTierRunControllerApi(
  comparisonAdapter
) {
  const STORAGE_PREFIX = 'simulatte:tier-run:v1:';

  function createController({
    getRuntime,
    ownerPluginId,
    scenario,
    profileId,
    render,
    resetRuntime,
    buildReceipt,
    onState,
    onReceipt,
    onError,
    storage = null,
    stepDelayMs = 60,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  }) {
    if (typeof getRuntime !== 'function' || typeof resetRuntime !== 'function') {
      throw controllerError('tier_run_runtime_invalid', 'Tier run controller requires runtime access and reset');
    }
    if (typeof render !== 'function' || typeof buildReceipt !== 'function') {
      throw controllerError('tier_run_callbacks_invalid', 'Tier run controller requires render and receipt callbacks');
    }
    let state = 'idle';
    let timerId = null;
    let stepCount = 0;
    let runGeneration = 0;
    let isRestoring = false;
    let scenarioResult = null;
    let finalReceipt = null;

    function snapshot() {
      return Object.freeze({
        schema: 'simulatte.tierRunControllerState.v1',
        state,
        stepCount,
        scenarioId: scenario.id,
        seed: scenario.seed,
        hasReceipt: finalReceipt !== null,
      });
    }

    async function start({ restored = false } = {}) {
      if (['running', 'paused'].includes(state)) return snapshot();
      cancelTimer();
      const generation = ++runGeneration;
      state = 'running';
      stepCount = 0;
      isRestoring = restored;
      scenarioResult = null;
      finalReceipt = null;
      reflect();
      try {
        let result = await dispatchScenario({ phase: 'start' });
        if (result?.status === 'refused' && ['scenario_phase_invalid', 'unknown_action'].includes(result.reason)) {
          result = await dispatchScenario({});
        }
        if (generation !== runGeneration) return snapshot();
        scenarioResult = result;
        render();
        if (result?.status === 'settled') await complete(generation);
        else if (result?.status === 'running') schedule(generation);
        else throw controllerError(
          'tier_scenario_action_refused',
          `${ownerPluginId} returned ${result?.status || 'missing'}: ${result?.reason || 'no reason'}`
        );
        return snapshot();
      } catch (error) {
        fail(error);
        throw error;
      }
    }

    function pause() {
      if (state !== 'running') return snapshot();
      cancelTimer();
      state = 'paused';
      reflect();
      return snapshot();
    }

    function resume() {
      if (state !== 'paused') return snapshot();
      state = 'running';
      reflect();
      schedule(runGeneration);
      return snapshot();
    }

    async function step() {
      if (!['running', 'paused'].includes(state)) return snapshot();
      const shouldResume = state === 'running';
      cancelTimer();
      state = 'paused';
      reflect();
      await advance(runGeneration);
      if (shouldResume && state === 'paused') {
        state = 'running';
        reflect();
        schedule(runGeneration);
      } else if (state === 'paused') {
        reflect();
      }
      return snapshot();
    }

    async function replay() {
      cancelTimer();
      runGeneration += 1;
      state = 'idle';
      reflect();
      await resetRuntime();
      return start();
    }

    async function restore() {
      const stored = readStoredReceipt(storage, profileId);
      if (!stored) return false;
      if (stored.profileId !== profileId
        || stored.scenario?.id !== scenario.id
        || stored.scenario?.seed !== scenario.seed) {
        clearStoredReceipt(storage, profileId);
        return false;
      }
      await start({ restored: true });
      cancelTimer();
      while (['running', 'paused'].includes(state)) {
        state = 'running';
        await advance(runGeneration);
      }
      return state === 'settled';
    }

    function dispose() {
      runGeneration += 1;
      cancelTimer();
    }

    async function advance(generation) {
      if (generation !== runGeneration || !['running', 'paused'].includes(state)) return;
      stepCount += 1;
      if (stepCount > 10000) {
        throw controllerError('tier_run_step_limit', 'Tier run exceeded 10000 deterministic steps');
      }
      const result = await dispatchScenario({ phase: 'step' });
      if (generation !== runGeneration) return;
      scenarioResult = result;
      render();
      if (result?.status === 'settled') await complete(generation);
      else if (result?.status !== 'running') {
        throw controllerError(
          'tier_scenario_step_refused',
          `${ownerPluginId} returned ${result?.status || 'missing'}: ${result?.reason || 'no reason'}`
        );
      }
    }

    async function complete(generation) {
      if (generation !== runGeneration) return;
      cancelTimer();
      const runtime = requiredRuntime(getRuntime());
      const platform = runtime.platformV4({ scenario, compositionSize: runtime.activePluginIds.length });
      const contribution = platform.contributions.find((row) => row.pluginId === ownerPluginId);
      const comparisonDefinition = contribution?.controls?.comparisons?.[0] || null;
      if (!comparisonDefinition) {
        throw controllerError(
          'tier_comparison_definition_missing',
          `${ownerPluginId} did not declare a v4 comparison`
        );
      }
      const comparisonResult = await runtime.dispatchAction(
        ownerPluginId,
        'counterfactual.compare',
        { scenario, values: {} }
      );
      if (comparisonResult?.status !== 'settled' || !comparisonResult.comparisonBranches) {
        throw controllerError(
          'tier_comparison_execution_missing',
          `${ownerPluginId} did not return executable baseline and intervention branches`
        );
      }
      const comparisonExecutionReceipt = await comparisonAdapter.createSettledComparison({
        pluginId: ownerPluginId,
        scenario,
        comparisonId: comparisonResult.comparisonId || comparisonDefinition.id,
        branches: comparisonResult.comparisonBranches,
        contribution,
      });
      const actionResult = Object.freeze({
        status: 'settled',
        scenario: scenarioResult,
        comparison: comparisonResult,
        comparisonExecutionReceipt,
      });
      const settlement = await runtime.settle({ scenario, actionResult });
      finalReceipt = Object.freeze(buildReceipt({
        actionResult,
        settlement,
        comparisonExecutionReceipt,
        restored: isRestoring,
      }));
      writeStoredReceipt(storage, profileId, finalReceipt);
      state = 'settled';
      render();
      reflect();
      onReceipt?.(finalReceipt, { restored: isRestoring });
    }

    async function dispatchScenario(values) {
      return requiredRuntime(getRuntime()).dispatchAction(
        ownerPluginId,
        'scenario.run',
        { scenario, values }
      );
    }

    function schedule(generation) {
      if (state !== 'running' || timerId !== null) return;
      timerId = setTimer(async () => {
        timerId = null;
        try {
          await advance(generation);
          if (state === 'running') schedule(generation);
        } catch (error) {
          fail(error);
        }
      }, stepDelayMs);
    }

    function cancelTimer() {
      if (timerId === null) return;
      clearTimer(timerId);
      timerId = null;
    }

    function fail(error) {
      cancelTimer();
      state = 'failed';
      reflect();
      onError?.(error);
    }

    function reflect() {
      onState?.(snapshot());
    }

    return Object.freeze({
      dispose,
      pause,
      receipt: () => finalReceipt,
      replay,
      restore,
      resume,
      snapshot,
      start,
      step,
    });
  }

  function requiredRuntime(runtime) {
    if (!runtime || typeof runtime.dispatchAction !== 'function') {
      throw controllerError('tier_run_runtime_missing', 'Tier plugin runtime is unavailable');
    }
    return runtime;
  }

  function storageKey(profileId) {
    return `${STORAGE_PREFIX}${profileId}`;
  }

  function readStoredReceipt(storage, profileId) {
    if (!storage || typeof storage.getItem !== 'function') return null;
    try {
      const value = JSON.parse(storage.getItem(storageKey(profileId)) || 'null');
      return value?.schema === 'simulatte.tierRunReceipt.v1' ? value : null;
    } catch (_error) {
      clearStoredReceipt(storage, profileId);
      return null;
    }
  }

  function writeStoredReceipt(storage, profileId, receipt) {
    if (!storage || typeof storage.setItem !== 'function') return false;
    storage.setItem(storageKey(profileId), JSON.stringify(receipt));
    return true;
  }

  function clearStoredReceipt(storage, profileId) {
    if (!storage || typeof storage.removeItem !== 'function') return;
    storage.removeItem(storageKey(profileId));
  }

  function controllerError(code, message, evidence = null) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteTierRunControllerError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return Object.freeze({
    clearStoredReceipt,
    createController,
    readStoredReceipt,
    storageKey,
    writeStoredReceipt,
  });
});
