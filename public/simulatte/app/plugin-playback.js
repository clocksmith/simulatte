(function attachPluginPlayback(root, factory) {
  const comparisonAdapter = typeof module === 'object' && module.exports
    ? require('../platform/core/simulation/comparison-result-adapter.js')
    : root.SimulatteComparisonResultAdapter;
  const controlValues = typeof module === 'object' && module.exports
    ? require('./run-control-values.js')
    : root.SimulatteRunControlValues;
  const api = factory(comparisonAdapter, controlValues);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginPlayback = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPluginPlaybackModule(comparisonAdapter, controlValues) {
  if (!controlValues) throw new Error('plugin_playback_control_values_missing');
  const { isRunnableResult, normalizeValues, sameValues } = controlValues;
  function createController({
    runtime,
    ownerPluginId,
    scenario,
    clock,
    render,
    getControlValues = () => ({}),
    setControlValues = () => {},
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
    let activeScenario = freezeClone(scenario);
    let actionResult = null;
    let parameterValues = {};
    let phase = 'ready';
    let actionQueue = Promise.resolve();
    let seekQueue = Promise.resolve();
    let interventionQueue = Promise.resolve();
    let runGeneration = 0;
    let interventionLog = [];
    let hasPreparedStart = false;
    let disposed = false;
    let completion = null;
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
      assertActive();
      if (['running', 'paused'].includes(phase)) return snapshot();
      const nextParameterValues = normalizeValues(
        values === null && hasPreparedStart ? parameterValues : values === null ? getControlValues(ownerPluginId) : values
      );
      const preparedResult = hasPreparedStart
        && phase === 'ready'
        && isRunnableResult(actionResult)
        && sameValues(parameterValues, nextParameterValues);
      if (phase === 'completed' || phase === 'failed') await reset(activeScenario);
      const generation = runGeneration;
      parameterValues = nextParameterValues;
      hasPreparedStart = false;
      setControlValues(ownerPluginId, parameterValues);
      setPhase('running');
      if (!preparedResult) {
        actionResult = await dispatch('start');
        if (generation !== runGeneration) return snapshot();
      }
      if (!isRunnableResult(actionResult)) {
        throw playbackError('plugin_playback_start_refused', `Plugin ${ownerPluginId} refused playback start`, { actionResult });
      }
      if (!preparedResult && actionResult.presentationChanged !== false) render();
      publishPhase();
      await applyInterventionsAtStep(0, runGeneration);
      if (actionResult.status === 'settled') return complete();
      clock.play();
      return snapshot();
    }

    function pause() {
      assertActive();
      clock.pause();
      if (phase === 'running') setPhase('paused');
      return snapshot();
    }

    async function resume() {
      assertActive();
      if (phase !== 'paused') return snapshot();
      if (actionResult?.status === 'settled') {
        setPhase('running');
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
      assertActive();
      if (phase === 'ready') {
        const nextParameterValues = normalizeValues(getControlValues(ownerPluginId));
        const preparedResult = hasPreparedStart
          && isRunnableResult(actionResult)
          && sameValues(parameterValues, nextParameterValues);
        const generation = runGeneration;
        parameterValues = nextParameterValues;
        hasPreparedStart = false;
        setControlValues(ownerPluginId, parameterValues);
        if (!preparedResult) {
          actionResult = await dispatch('start');
          if (generation !== runGeneration) return snapshot();
        }
        if (!isRunnableResult(actionResult)) {
          throw playbackError('plugin_playback_start_refused', `Plugin ${ownerPluginId} refused playback start`, { actionResult });
        }
        if (!preparedResult) render();
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
      assertActive();
      const replayValues = normalizeValues(parameterValues);
      await reset(activeScenario, { preserveInterventions: true });
      return start({ values: replayValues });
    }

    function intervene(actionId, values = {}) {
      assertActive();
      if (typeof actionId !== 'string' || !actionId) {
        throw playbackError('plugin_playback_intervention_id_invalid', 'Playback intervention expected an action ID');
      }
      if (!['running', 'paused'].includes(phase) || !actionResult) {
        throw playbackError('plugin_playback_intervention_phase_invalid', 'Playback intervention requires an active run');
      }
      clock.pause();
      const pending = interventionQueue.then(() => applyIntervention(actionId, values));
      interventionQueue = pending.catch(() => {});
      return pending;
    }

    async function applyIntervention(actionId, values) {
      if (disposed || !['running', 'paused'].includes(phase) || !actionResult) return snapshot();
      const shouldResume = phase === 'running';
      const generation = runGeneration;
      await actionQueue;
      if (generation !== runGeneration) return snapshot();
      const entry = Object.freeze({
        actionId,
        values: normalizeValues(values),
        afterStep: actionResult.currentStep || 0,
      });
      const result = await dispatchIntervention(entry);
      if (generation !== runGeneration) return snapshot();
      if (!['running', 'settled'].includes(result?.status)) {
        throw playbackError(
          'plugin_playback_intervention_refused',
          `Plugin ${ownerPluginId} refused intervention ${actionId}`,
          { result }
        );
      }
      interventionLog = [...interventionLog, entry];
      actionResult = result;
      render();
      if (shouldResume && result.status === 'running') {
        setPhase('running');
        clock.play();
      } else {
        setPhase('paused');
      }
      return snapshot();
    }

    function setPlaybackRate(nextRate) {
      assertActive();
      clock.setPlaybackRate(nextRate);
      return snapshot();
    }

    function seek(targetStep) {
      if (disposed) return Promise.reject(playbackError('plugin_playback_disposed', 'Plugin playback is no longer active'));
      if (!Number.isInteger(targetStep) || targetStep < 0) {
        return Promise.reject(playbackError('plugin_playback_seek_invalid', 'Playback seek expected a non-negative step'));
      }
      const pending = seekQueue.then(() => reconstructAtStep(targetStep));
      seekQueue = pending.catch(() => {});
      return pending;
    }

    function applyControls(values) {
      if (disposed) return Promise.reject(playbackError('plugin_playback_disposed', 'Plugin playback is no longer active'));
      const pending = seekQueue.then(() => applyControlValues(values));
      seekQueue = pending.catch(() => {});
      return pending;
    }

    async function applyControlValues(values) {
      assertActive();
      clock.pause();
      const generation = ++runGeneration;
      try {
        await actionQueue;
        if (generation !== runGeneration) return snapshot();
        parameterValues = normalizeValues(values);
        interventionLog = [];
        hasPreparedStart = false;
        await resetState(activeScenario, generation, { renderReadyState: false });
        if (generation !== runGeneration) return snapshot();
        setControlValues(ownerPluginId, parameterValues);
        actionResult = await dispatch('start');
        if (!['running', 'settled'].includes(actionResult?.status)) {
          throw playbackError(
            'plugin_playback_controls_refused',
            `Plugin ${ownerPluginId} refused the updated controls`,
            { actionResult }
          );
        }
        if (generation !== runGeneration) return snapshot();
        render();
        clock.seek(0);
        hasPreparedStart = true;
        setPhase('ready');
        return snapshot();
      } catch (error) {
        if (generation === runGeneration) fail(error);
        throw error;
      }
    }

    async function reconstructAtStep(requestedStep) {
      assertActive();
      clock.pause();
      const generation = ++runGeneration;
      const reconstructionValues = phase === 'ready'
        ? normalizeValues(getControlValues(ownerPluginId))
        : normalizeValues(parameterValues);
      try {
        await actionQueue;
        if (generation !== runGeneration) return snapshot();
        await resetState(activeScenario, generation, { renderReadyState: false });
        if (generation !== runGeneration) return snapshot();
        parameterValues = reconstructionValues;
        hasPreparedStart = false;
        setPhase('running');
        actionResult = await dispatch('start');
        if (generation !== runGeneration) return snapshot();
        await applyInterventionsAtStep(0, generation);
        await yieldToHost();
        if (generation !== runGeneration) return snapshot();
        const totalSteps = actionResult?.totalSteps || 0;
        const targetStep = Math.min(requestedStep, totalSteps);
        let playbackSliceStartedAt = hostNow();
        for (let stepIndex = 0; stepIndex < targetStep && actionResult.status === 'running'; stepIndex += 1) {
          actionResult = await dispatch('step');
          if (generation !== runGeneration) return snapshot();
          await applyInterventionsAtStep(actionResult.currentStep || 0, generation);
          if (await yieldPlaybackBatch(stepIndex, targetStep, playbackSliceStartedAt)) {
            playbackSliceStartedAt = hostNow();
          }
          if (generation !== runGeneration) return snapshot();
        }
        await yieldToHost();
        if (generation !== runGeneration) return snapshot();
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
      assertActive();
      receipt = freezeClone(receipt);
      validateRestoreReceipt(receipt, ownerPluginId);
      const generation = ++runGeneration;
      clock.pause();
      try {
        await actionQueue;
        if (generation !== runGeneration) return snapshot();
        setPhase('running');
        activeScenario = freezeClone(receipt.scenario);
        parameterValues = normalizeValues(receipt.parameterValues);
        hasPreparedStart = false;
        setControlValues(ownerPluginId, parameterValues);
        interventionLog = normalizedInterventionLog(receipt.interventions);
        await runtime.setScenario(activeScenario);
        if (generation !== runGeneration) return snapshot();
        actionResult = await dispatch('start');
        if (generation !== runGeneration) return snapshot();
        if (!isRunnableResult(actionResult)) {
          throw playbackError('plugin_playback_restore_start_refused', `Plugin ${ownerPluginId} refused restored playback start`, { actionResult });
        }
        await applyInterventionsAtStep(0, generation);
        await yieldToHost();
        if (generation !== runGeneration) return snapshot();
        const targetStep = receipt.actionResult.currentStep;
        let playbackSliceStartedAt = hostNow();
        for (let stepIndex = 0; stepIndex < targetStep && actionResult.status === 'running'; stepIndex += 1) {
          actionResult = await dispatch('step');
          if (generation !== runGeneration) return snapshot();
          await applyInterventionsAtStep(actionResult.currentStep || 0, generation);
          if (await yieldPlaybackBatch(stepIndex, targetStep, playbackSliceStartedAt)) {
            playbackSliceStartedAt = hostNow();
          }
          if (generation !== runGeneration) return snapshot();
        }
        if (JSON.stringify(actionResult) !== JSON.stringify(receipt.actionResult)) {
          throw playbackError('plugin_playback_restore_diverged', 'Reconstructed action result differs from the stored receipt', {
            expected: receipt.actionResult,
            actual: actionResult,
          });
        }
        await yieldToHost();
        if (generation !== runGeneration) return snapshot();
        render();
        clock.seek(receipt.clock.state.currentMs);
        const settlements = await runtime.settle({ scenario: activeScenario, actionResult });
        if (generation !== runGeneration) return snapshot();
        if (JSON.stringify(settlements) !== JSON.stringify(receipt.settlements)) {
          throw playbackError('plugin_playback_restore_settlement_diverged', 'Reconstructed settlement differs from the stored receipt', {
            expected: receipt.settlements,
            actual: settlements,
          });
        }
        const comparisonExecutionReceipts = await executeComparisons();
        if (generation !== runGeneration) return snapshot();
        const expectedComparisonReceipts = receipt.comparisonExecutionReceipts
          || (receipt.comparisonExecutionReceipt ? [receipt.comparisonExecutionReceipt] : []);
        if (JSON.stringify(comparisonExecutionReceipts) !== JSON.stringify(expectedComparisonReceipts)) {
          throw playbackError('plugin_playback_restore_comparison_diverged', 'Reconstructed comparison differs from the stored receipt', {
            expected: expectedComparisonReceipts,
            actual: comparisonExecutionReceipts,
          });
        }
        return publishSettlement(settlements, comparisonExecutionReceipts);
      } catch (error) {
        if (generation === runGeneration) fail(error);
        throw error;
      }
    }

    async function reset(nextScenario = activeScenario, { preserveInterventions = false } = {}) {
      assertActive();
      clock.pause();
      const generation = ++runGeneration;
      await actionQueue;
      if (!preserveInterventions) interventionLog = [];
      return resetState(nextScenario, generation);
    }

    async function resetState(nextScenario, generation, { renderReadyState = true } = {}) {
      if (generation !== runGeneration) return snapshot();
      activeScenario = freezeClone(nextScenario);
      await runtime.setScenario(activeScenario);
      if (generation !== runGeneration) return snapshot();
      actionResult = null;
      hasPreparedStart = false;
      if (renderReadyState) render();
      clock.seek(0);
      setPhase('ready');
      return snapshot();
    }

    async function advance(generation = runGeneration) {
      if (generation !== runGeneration) return snapshot();
      if (!['running', 'paused'].includes(phase)) return snapshot();
      actionResult = await dispatch('step');
      if (generation !== runGeneration) return snapshot();
      await applyInterventionsAtStep(actionResult.currentStep || 0, generation);
      if (generation !== runGeneration) return snapshot();
      render();
      if (actionResult.status === 'settled') return complete(generation);
      if (actionResult.status !== 'running') {
        throw playbackError('plugin_playback_step_refused', `Plugin ${ownerPluginId} refused playback step`, { actionResult });
      }
      publishPhase();
      return snapshot();
    }

    async function complete(generation = runGeneration) {
      if (generation !== runGeneration) return snapshot();
      if (completion?.generation === generation) return completion.promise;
      const promise = completeRun(generation);
      completion = Object.freeze({ generation, promise });
      try {
        return await promise;
      } finally {
        if (completion?.promise === promise && phase !== 'completed') completion = null;
      }
    }

    async function completeRun(generation) {
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
      const frozenComparisons = freezeClone(comparisonExecutionReceipts);
      // Comparison actions may add branch-specific semantic evidence. Recompile
      // the presentation after they execute so the terminal map and receipts
      // describe the same settled run.
      render();
      const receipt = freezeClone({
        schema: 'simulatte.pluginPlaybackRunReceipt.v1',
        ownerPluginId,
        scenario: activeScenario,
        parameterValues,
        interventions: interventionLog.map((row) => ({
          actionId: row.actionId,
          values: normalizeValues(row.values),
          afterStep: row.afterStep,
        })),
        actionResult,
        settlements,
        comparisonExecutionReceipt: frozenComparisons[0] || null,
        comparisonExecutionReceipts: frozenComparisons,
        clock: clock.receipt(),
        runtime: runtime.runtimeReceipt(),
      });
      onSettled?.(receipt);
      setPhase('completed');
      return snapshot();
    }

    function dispatch(nextPhase) {
      return runtime.dispatchAction(ownerPluginId, 'scenario.run', {
        scenario: activeScenario,
        values: { ...parameterValues, phase: nextPhase },
      });
    }

    function dispatchIntervention(entry) {
      return runtime.dispatchAction(ownerPluginId, entry.actionId, {
        scenario: activeScenario,
        values: entry.values,
      });
    }

    async function yieldPlaybackBatch(stepIndex, targetStep, sliceStartedAt) {
      const completed = stepIndex + 1;
      if (completed >= targetStep) return false;
      const boundedHistory = targetStep <= 64;
      if (!boundedHistory && hostNow() - sliceStartedAt < 16) return false;
      await yieldToHost();
      return true;
    }

    function hostNow() {
      return typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();
    }

    function yieldToHost() {
      if (typeof requestAnimationFrame === 'function') {
        return new Promise((resolve) => requestAnimationFrame(() => resolve()));
      }
      return new Promise((resolve) => setTimeout(resolve, 0));
    }

    async function applyInterventionsAtStep(step, generation) {
      for (const entry of interventionLog.filter((row) => row.afterStep === step)) {
        if (generation !== runGeneration) return;
        const result = await dispatchIntervention(entry);
        if (!['running', 'settled'].includes(result?.status)) {
          throw playbackError(
            'plugin_playback_intervention_replay_refused',
            `Plugin ${ownerPluginId} refused replayed intervention ${entry.actionId}`,
            { entry, result }
          );
        }
        actionResult = result;
      }
    }

    function setPhase(nextPhase) {
      phase = nextPhase;
      publishPhase();
    }

    function publishPhase() {
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
      if (disposed) return;
      disposed = true;
      runGeneration += 1;
      clock.pause();
      unsubscribe();
    }

    function assertActive() {
      if (!disposed) return;
      throw playbackError('plugin_playback_disposed', 'Plugin playback is no longer active');
    }

    function freezeClone(value) {
      return deepFreeze(structuredClone(value));
    }

    function deepFreeze(value) {
      if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
      Object.values(value).forEach(deepFreeze);
      return Object.freeze(value);
    }

    return Object.freeze({ applyControls, dispose, intervene, pause, replay, reset, restore, resume, seek, setPlaybackRate, snapshot, start, step });
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
    normalizedInterventionLog(value.interventions);
  }

  function normalizedInterventionLog(value) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
      throw playbackError('plugin_playback_restore_interventions_invalid', 'Stored playback receipt has invalid interventions');
    }
    return value.map((row) => {
      if (!row
        || typeof row.actionId !== 'string'
        || !row.actionId
        || !Number.isInteger(row.afterStep)
        || row.afterStep < 0) {
        throw playbackError('plugin_playback_restore_intervention_invalid', 'Stored playback intervention is incomplete');
      }
      return Object.freeze({
        actionId: row.actionId,
        values: normalizeValues(row.values),
        afterStep: row.afterStep,
      });
    });
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
    if (!storage || typeof storage.setItem !== 'function') return false;
    const storedReceipt = {
      ...receipt,
      // The runtime receipt is retained by the in-memory/export evidence path. It
      // can contain complete event payloads and is not needed to reconstruct a run.
      runtime: undefined,
      // The array is canonical; do not store its legacy first-item alias twice.
      comparisonExecutionReceipt: undefined,
    };
    try {
      storage.setItem(storageKey(profileId), JSON.stringify(storedReceipt));
      return true;
    } catch (_error) {
      try { storage.removeItem?.(storageKey(profileId)); } catch (_clearError) { /* best effort */ }
      return false;
    }
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
