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
    let seekQueue = Promise.resolve();
    let runGeneration = 0;
    const unsubscribe = clock.subscribe((message) => {
      if (message.type !== 'event') return;
      const generation = runGeneration;
      actionQueue = actionQueue
        .then(() => advance(generation))
        .catch((error) => {
          if (generation === runGeneration) fail(error);
        });
    });

    async function start({ values = null } = {}) {
      if (phase === 'running') return snapshot();
      const nextParameterValues = normalizedValues(
        values === null ? getControlValues(ownerPluginId) : values
      );
      if (phase === 'completed' || phase === 'failed') await reset(activeScenario);
      parameterValues = nextParameterValues;
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

    async function resume() {
      if (phase !== 'paused') return snapshot();
      if (actionResult?.status === 'settled') {
        try {
          return await complete(runGeneration);
        } catch (error) {
          fail(error);
          throw error;
        }
      }
      setPhase('running');
      clock.play();
      return snapshot();
    }

    async function step() {
      if (phase === 'ready') {
        parameterValues = normalizedValues(getControlValues(ownerPluginId));
        actionResult = await dispatch('start');
        render();
      }
      if (!['running', 'paused', 'ready'].includes(phase)) return snapshot();
      setPhase('paused');
      clock.pause();
      if (actionResult?.status === 'settled') {
        try {
          return await complete(runGeneration);
        } catch (error) {
          fail(error);
          throw error;
        }
      }
      clock.step(1);
      await actionQueue;
      return snapshot();
    }

    async function replay() {
      const replayValues = normalizedValues(parameterValues);
      await reset(activeScenario);
      return start({ values: replayValues });
    }

    function setPlaybackRate(nextRate) {
      clock.setPlaybackRate(nextRate);
      return snapshot();
    }

    function seek(targetStep) {
      if (!Number.isInteger(targetStep) || targetStep < 0) {
        return Promise.reject(playbackError('plugin_playback_seek_invalid', 'Playback seek expected a non-negative step'));
      }
      const pending = seekQueue.then(() => reconstructAtStep(targetStep));
      seekQueue = pending.catch(() => {});
      return pending;
    }

    async function reconstructAtStep(requestedStep) {
      clock.pause();
      const generation = ++runGeneration;
      const reconstructionValues = phase === 'ready'
        ? normalizedValues(getControlValues(ownerPluginId))
        : normalizedValues(parameterValues);
      try {
        await actionQueue;
        if (generation !== runGeneration) return snapshot();
        await resetState(activeScenario, generation);
        if (generation !== runGeneration) return snapshot();
        parameterValues = reconstructionValues;
        setPhase('running');
        actionResult = await dispatch('start');
        if (generation !== runGeneration) return snapshot();
        const totalSteps = actionResult?.totalSteps || 0;
        const targetStep = Math.min(requestedStep, totalSteps);
        for (let stepIndex = 0; stepIndex < targetStep && actionResult.status === 'running'; stepIndex += 1) {
          actionResult = await dispatch('step');
          if (generation !== runGeneration) return snapshot();
        }
        render();
        clock.seek(currentSimulationTimeMs());
        setPhase('paused');
        return snapshot();
      } catch (error) {
        if (generation === runGeneration) fail(error);
        throw error;
      }
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
      const comparisonExecutionReceipts = await executeComparisons();
      const expectedComparisonReceipts = receipt.comparisonExecutionReceipts
        || (receipt.comparisonExecutionReceipt ? [receipt.comparisonExecutionReceipt] : []);
      if (expectedComparisonReceipts.length
        && JSON.stringify(comparisonExecutionReceipts) !== JSON.stringify(expectedComparisonReceipts)) {
        throw playbackError('plugin_playback_restore_comparison_diverged', 'Reconstructed comparison differs from the stored receipt', {
          expected: expectedComparisonReceipts,
          actual: comparisonExecutionReceipts,
        });
      }
      return publishSettlement(settlements, comparisonExecutionReceipts);
    }

    async function reset(nextScenario = activeScenario) {
      clock.pause();
      const generation = ++runGeneration;
      await actionQueue;
      return resetState(nextScenario, generation);
    }

    async function resetState(nextScenario, generation) {
      if (generation !== runGeneration) return snapshot();
      activeScenario = nextScenario;
      await runtime.setScenario(activeScenario);
      if (generation !== runGeneration) return snapshot();
      actionResult = null;
      render();
      clock.seek(0);
      setPhase('ready');
      return snapshot();
    }

    async function advance(generation = runGeneration) {
      if (generation !== runGeneration) return snapshot();
      if (!['running', 'paused'].includes(phase)) return snapshot();
      actionResult = await dispatch('step');
      if (generation !== runGeneration) return snapshot();
      render();
      if (actionResult.status === 'settled') return complete(generation);
      if (actionResult.status !== 'running') {
        throw playbackError('plugin_playback_step_refused', `Plugin ${ownerPluginId} refused playback step`, { actionResult });
      }
      return snapshot();
    }

    async function complete(generation = runGeneration) {
      if (generation !== runGeneration) return snapshot();
      clock.pause();
      const settlements = await runtime.settle({ scenario: activeScenario, actionResult });
      if (generation !== runGeneration) return snapshot();
      if (!settlements.length || settlements.some((row) => row.obligationResults.some((result) => result.status !== 'settled'))) {
        throw playbackError('plugin_playback_settlement_incomplete', `Plugin ${ownerPluginId} did not settle every obligation`, { settlements });
      }
      const comparisonExecutionReceipts = await executeComparisons();
      if (generation !== runGeneration) return snapshot();
      return publishSettlement(settlements, comparisonExecutionReceipts);
    }

    async function executeComparisons() {
      if (typeof runtime.platformV4 !== 'function') return [];
      const platform = runtime.platformV4({ scenario: activeScenario, compositionSize: runtime.activePluginIds?.length || 1 });
      const contribution = platform.contributions.find((row) => row.pluginId === ownerPluginId);
      const definitions = contribution?.controls?.comparisons || [];
      if (!definitions.length) return [];
      if (!comparisonAdapter?.createSettledComparison) {
        throw playbackError('plugin_playback_comparison_adapter_missing', 'Shared comparison execution is unavailable');
      }
      const receipts = [];
      for (const definition of definitions) {
        const comparison = await runtime.dispatchAction(ownerPluginId, 'counterfactual.compare', {
          scenario: activeScenario,
          values: { comparisonId: definition.id },
        });
        if (comparison?.status !== 'settled' || !comparison.comparisonBranches) {
          throw playbackError('plugin_playback_comparison_missing', `Plugin ${ownerPluginId} did not execute comparison ${definition.id}`, { comparison });
        }
        receipts.push(await comparisonAdapter.createSettledComparison({
          pluginId: ownerPluginId,
          scenario: activeScenario,
          comparisonId: definition.id,
          branches: comparison.comparisonBranches,
          contribution,
        }));
      }
      return receipts;
    }

    function publishSettlement(settlements, comparisonExecutionReceipts = []) {
      setPhase('completed');
      const frozenComparisons = Object.freeze([...comparisonExecutionReceipts]);
      const receipt = Object.freeze({
        schema: 'simulatte.pluginPlaybackRunReceipt.v1',
        ownerPluginId,
        scenario: activeScenario,
        parameterValues,
        actionResult,
        settlements,
        comparisonExecutionReceipt: frozenComparisons[0] || null,
        comparisonExecutionReceipts: frozenComparisons,
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
        terminalPreview: phase === 'paused' && actionResult?.status === 'settled',
        currentStep: actionResult?.currentStep || 0,
        totalSteps: actionResult?.totalSteps || 0,
        clock: clock.snapshot(),
      });
    }

    function currentSimulationTimeMs() {
      const direct = Number(actionResult?.simulationTimeMs);
      if (Number.isFinite(direct) && direct >= 0) return direct;
      if (typeof runtime.platformV4 === 'function') {
        const platform = runtime.platformV4({
          scenario: activeScenario,
          compositionSize: runtime.activePluginIds?.length || 1,
        });
        const contribution = platform.contributions.find((row) => row.pluginId === ownerPluginId);
        const contributed = Number(contribution?.state?.simulationTimeMs);
        if (Number.isFinite(contributed) && contributed >= 0) return contributed;
      }
      throw playbackError(
        'plugin_playback_simulation_time_missing',
        `Plugin ${ownerPluginId} did not expose simulationTimeMs for deterministic seeking`
      );
    }

    function dispose() {
      runGeneration += 1;
      clock.pause();
      unsubscribe();
    }

    return Object.freeze({ dispose, pause, replay, reset, restore, resume, seek, setPlaybackRate, snapshot, start, step });
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
