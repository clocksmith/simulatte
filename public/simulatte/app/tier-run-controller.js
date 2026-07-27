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
  const RESTORE_ENVELOPE_SCHEMA = 'simulatte.tierRunRestoreEnvelope.v1';

  function createController({
    getRuntime,
    ownerPluginId,
    scenario,
    profileId,
    render,
    resetRuntime,
    buildReceipt,
    getControlValues = () => ({}),
    onState,
    onReceipt,
    onError,
    storage = null,
    stepDelayMs = 500,
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
    let parameterValues = {};
    let playbackRate = 1;
    let seekQueue = Promise.resolve();

    function snapshot() {
      return Object.freeze({
        schema: 'simulatte.tierRunControllerState.v1',
        state,
        stepCount,
        currentStep: Number.isInteger(scenarioResult?.currentStep) ? scenarioResult.currentStep : stepCount,
        totalSteps: Number.isInteger(scenarioResult?.totalSteps) ? scenarioResult.totalSteps : 0,
        playbackRate,
        terminalPreview: state === 'paused' && isTerminalResult(scenarioResult),
        scenarioId: scenario.id,
        seed: scenario.seed,
        hasReceipt: finalReceipt !== null,
      });
    }

    async function start({ restored = false, values = null } = {}) {
      if (['running', 'paused'].includes(state)) return snapshot();
      cancelTimer();
      const generation = ++runGeneration;
      const nextParameterValues = normalizeValues(
        values === null ? getControlValues(ownerPluginId) : values
      );
      if (['settled', 'failed'].includes(state)) await resetRuntime();
      state = 'running';
      stepCount = 0;
      isRestoring = restored;
      scenarioResult = null;
      finalReceipt = null;
      parameterValues = nextParameterValues;
      reflect();
      try {
        let result = await dispatchScenario({ phase: 'start' });
        if (result?.status === 'refused' && ['scenario_phase_invalid', 'unknown_action'].includes(result.reason)) {
          result = await dispatchScenario({});
        }
        if (generation !== runGeneration) return snapshot();
        scenarioResult = result;
        render();
        reflect();
        if (isTerminalResult(result)) await complete(generation);
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

    async function resume() {
      if (state !== 'paused') return snapshot();
      if (isTerminalResult(scenarioResult)) {
        try {
          await complete(runGeneration);
        } catch (error) {
          fail(error);
          throw error;
        }
        return snapshot();
      }
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
      if (isTerminalResult(scenarioResult)) {
        try {
          await complete(runGeneration);
        } catch (error) {
          fail(error);
          throw error;
        }
        return snapshot();
      }
      try {
        await advance(runGeneration);
      } catch (error) {
        fail(error);
        throw error;
      }
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
      const replayValues = normalizeValues(parameterValues);
      cancelTimer();
      runGeneration += 1;
      state = 'idle';
      reflect();
      await resetRuntime();
      return start({ values: replayValues });
    }

    async function reset() {
      cancelTimer();
      runGeneration += 1;
      state = 'idle';
      stepCount = 0;
      isRestoring = false;
      scenarioResult = null;
      finalReceipt = null;
      parameterValues = {};
      clearStoredReceipt(storage, profileId);
      await resetRuntime();
      reflect();
      return snapshot();
    }

    function setPlaybackRate(nextRate) {
      const value = Number(nextRate);
      if (!Number.isFinite(value) || value <= 0 || value > 16) {
        throw controllerError('tier_run_playback_rate_invalid', 'Playback rate expected a number above 0 and at most 16');
      }
      playbackRate = value;
      if (state === 'running') {
        cancelTimer();
        schedule(runGeneration);
      }
      reflect();
      return snapshot();
    }

    function seek(targetStep) {
      if (!Number.isInteger(targetStep) || targetStep < 0) {
        return Promise.reject(controllerError('tier_run_seek_invalid', 'Timeline seek expected a non-negative step'));
      }
      const pending = seekQueue.then(() => reconstructAtStep(targetStep));
      seekQueue = pending.catch(() => {});
      return pending;
    }

    async function reconstructAtStep(requestedStep) {
      cancelTimer();
      const generation = ++runGeneration;
      try {
        await resetRuntime();
        if (generation !== runGeneration) return snapshot();
        state = 'running';
        stepCount = 0;
        scenarioResult = await dispatchScenario({ phase: 'start' });
        if (generation !== runGeneration) return snapshot();
        const totalSteps = Number.isInteger(scenarioResult?.totalSteps) ? scenarioResult.totalSteps : 0;
        const targetStep = Math.min(requestedStep, totalSteps);
        while (stepCount < targetStep && scenarioResult?.status === 'running') {
          stepCount += 1;
          scenarioResult = await dispatchScenario({ phase: 'step' });
          if (generation !== runGeneration) return snapshot();
        }
        render();
        state = 'paused';
        reflect();
        return snapshot();
      } catch (error) {
        if (generation === runGeneration) fail(error);
        throw error;
      }
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
      await start({ restored: true, values: stored.parameterValues || {} });
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
      reflect();
      if (isTerminalResult(result)) await complete(generation);
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
      const comparisonDefinitions = contribution?.controls?.comparisons || [];
      if (!comparisonDefinitions.length) {
        throw controllerError(
          'tier_comparison_definition_missing',
          `${ownerPluginId} did not declare a v4 comparison`
        );
      }
      const comparisons = [];
      const comparisonExecutionReceipts = [];
      for (const definition of comparisonDefinitions) {
        const comparisonResult = await runtime.dispatchAction(
          ownerPluginId,
          'counterfactual.compare',
          { scenario, values: { comparisonId: definition.id } }
        );
        if (comparisonResult?.status !== 'settled' || !comparisonResult.comparisonBranches) {
          throw controllerError(
            'tier_comparison_execution_missing',
            `${ownerPluginId} did not execute comparison ${definition.id}`
          );
        }
        comparisons.push(comparisonResult);
        comparisonExecutionReceipts.push(await comparisonAdapter.createSettledComparison({
          pluginId: ownerPluginId,
          scenario,
          comparisonId: definition.id,
          branches: comparisonResult.comparisonBranches,
          contribution,
        }));
      }
      const comparisonResult = comparisons[0];
      const comparisonExecutionReceipt = comparisonExecutionReceipts[0];
      const actionResult = Object.freeze({
        status: 'settled',
        scenario: scenarioResult,
        comparison: comparisonResult,
        comparisonExecutionReceipt,
        comparisons: Object.freeze(comparisons),
        comparisonExecutionReceipts: Object.freeze(comparisonExecutionReceipts),
      });
      const settlement = await runtime.settle({ scenario, actionResult });
      finalReceipt = Object.freeze(buildReceipt({
        actionResult,
        settlement,
        comparisonExecutionReceipt,
        comparisonExecutionReceipts,
        parameterValues,
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
        { scenario, values: { ...parameterValues, ...values } }
      );
    }

    function isTerminalResult(result) {
      return result?.status === 'settled' || result?.status === 'failed';
    }

    function schedule(generation) {
      if (state !== 'running' || timerId !== null) return;
      timerId = setTimer(async () => {
        timerId = null;
        try {
          await advance(generation);
          if (state === 'running') schedule(generation);
        } catch (error) {
          if (generation === runGeneration) fail(error);
        }
      }, Math.max(16, stepDelayMs / playbackRate));
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
      reset,
      restore,
      resume,
      seek,
      setPlaybackRate,
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
      const serialized = storage.getItem(storageKey(profileId));
      if (!serialized) return null;
      const value = JSON.parse(serialized);
      if (value?.schema === RESTORE_ENVELOPE_SCHEMA) return value;
      clearStoredReceipt(storage, profileId);
      return null;
    } catch (_error) {
      clearStoredReceipt(storage, profileId);
      return null;
    }
  }

  function writeStoredReceipt(storage, profileId, receipt) {
    if (!storage || typeof storage.setItem !== 'function') return false;
    const envelope = createRestoreEnvelope(profileId, receipt);
    const serialized = JSON.stringify(envelope);
    try {
      storage.setItem(storageKey(profileId), serialized);
    } catch (error) {
      throw controllerError(
        'tier_run_restore_storage_failed',
        `Could not persist deterministic reload inputs for ${profileId}`,
        {
          profileId,
          serializedLength: serialized.length,
          storageErrorName: error?.name || null,
        }
      );
    }
    return true;
  }

  function createRestoreEnvelope(profileId, receipt) {
    if (!receipt || receipt.profileId !== profileId) {
      throw controllerError(
        'tier_run_restore_receipt_invalid',
        `Terminal receipt does not belong to ${profileId}`,
        { profileId, receiptProfileId: receipt?.profileId || null }
      );
    }
    if (!receipt.scenario?.id || !receipt.scenario?.seed) {
      throw controllerError(
        'tier_run_restore_scenario_invalid',
        `Terminal receipt for ${profileId} is missing scenario identity`,
        { profileId }
      );
    }
    return Object.freeze({
      schema: RESTORE_ENVELOPE_SCHEMA,
      profileId,
      scenario: Object.freeze({
        id: receipt.scenario.id,
        seed: receipt.scenario.seed,
      }),
      parameterValues: Object.freeze(normalizeValues(receipt.parameterValues)),
      terminal: Object.freeze({
        receiptSchema: receipt.schema || null,
        status: receipt.actionResult?.status || null,
        comparisonId: receipt.actionResult?.comparisonExecutionReceipt?.comparisonId || null,
        comparisonIds: Object.freeze(
          (receipt.actionResult?.comparisonExecutionReceipts || [])
            .map((row) => row.comparisonId || row.id)
        ),
      }),
    });
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

  function normalizeValues(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, Array.isArray(entry) ? [...entry] : entry]));
  }

  return Object.freeze({
    clearStoredReceipt,
    createRestoreEnvelope,
    createController,
    readStoredReceipt,
    RESTORE_ENVELOPE_SCHEMA,
    storageKey,
    writeStoredReceipt,
  });
});
