(function attachComparisonExecution(root, factory) {
  const timelineModule = typeof module === 'object' && module.exports
    ? require('../../runtime/simulation-timeline.js')
    : root.SimulatteSimulationTimeline;
  const contracts = typeof module === 'object' && module.exports
    ? require('../../contracts/plugin-v4-contracts.js')
    : root.SimulattePluginV4Contracts;
  const comparisonContracts = typeof module === 'object' && module.exports
    ? require('./comparison-contracts.js')
    : root.SimulatteComparisonContracts;
  const api = factory(timelineModule, contracts, comparisonContracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteComparisonExecution = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createComparisonExecutionModule(
  timelineModule,
  contracts,
  comparisonContracts
) {
  const {
    BRANCH_ROLES,
    BRANCH_STATUSES,
    SYNCHRONIZATION_POLICIES,
    assertPolicySafe,
    canonical,
    cloneFreeze,
    collectEventEvidence,
    collectMetricEvidence,
    compareMetrics,
    deepFreeze,
    exactKeys,
    fail,
    faultError,
    isBranchTerminal,
    nonNegative,
    object,
    oneOf,
    operationTime,
    positive,
    readObservation,
    rejectPromise,
    text,
    validateBranchDefinition,
    validateBranchSettlement,
    validateDriver,
    validateEvidenceCatalog,
    validateExecutionReceipt,
    validateHiddenTruth,
    validateMetric,
    validatePolicy,
    validateStartingIdentity,
    validateTextArray,
    validateTransition,
  } = comparisonContracts;

  function createComparisonExecution({
    id,
    synchronizationPolicy,
    startingIdentity,
    observableInput,
    hiddenTruth,
    branches,
    evidenceCatalog,
    requiredEvidenceIds = [],
    playbackRate = 1,
    wallIntervalMs = 50,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    restoreReceipt = null,
  } = {}) {
    text(id, 'comparison_id_invalid', 'Comparison ID');
    oneOf(
      synchronizationPolicy,
      SYNCHRONIZATION_POLICIES,
      'comparison_synchronization_policy_invalid',
      'Comparison synchronization policy'
    );
    validateStartingIdentity(startingIdentity);
    validateHiddenTruth(hiddenTruth, startingIdentity.hiddenTruth);
    object(branches, 'comparison_branches_invalid', 'Comparison branches');
    exactKeys(branches, BRANCH_ROLES, 'Comparison branches');
    const evidenceIds = validateEvidenceCatalog(evidenceCatalog);
    validateTextArray(requiredEvidenceIds, 'comparison_required_evidence_invalid', 'Required evidence IDs');
    requiredEvidenceIds.forEach((evidenceId) => {
      if (!evidenceIds.has(evidenceId)) {
        fail('comparison_required_evidence_unknown', `Required evidence ${evidenceId} is not in the evidence catalog`);
      }
    });
    positive(playbackRate, 'comparison_playback_rate_invalid', 'Comparison playback rate');
    positive(wallIntervalMs, 'comparison_wall_interval_invalid', 'Comparison wall interval');
    if (typeof setTimer !== 'function' || typeof clearTimer !== 'function') {
      fail('comparison_timer_invalid', 'Comparison timers expected functions');
    }

    const branchDefinitions = Object.freeze(Object.fromEntries(BRANCH_ROLES.map((role) => {
      const definition = branches[role];
      validateBranchDefinition(definition, role);
      return [role, deepFreeze({
        id: definition.id,
        role,
        configurationHash: definition.configurationHash,
      })];
    })));
    if (branchDefinitions.baseline.id === branchDefinitions.intervention.id) {
      fail('comparison_branch_id_duplicate', 'Comparison branch IDs must be unique');
    }
    const frozenStartingIdentity = cloneFreeze(startingIdentity, 'comparison_starting_identity_clone_failed');
    const frozenObservableInput = cloneFreeze(observableInput, 'comparison_observable_input_clone_failed');
    const frozenHiddenTruth = cloneFreeze(hiddenTruth.value, 'comparison_hidden_truth_clone_failed');
    assertPolicySafe(frozenObservableInput, 'Comparison observable input');
    BRANCH_ROLES.forEach((role) => {
      assertPolicySafe(branches[role].configuration, `${role} configuration`);
    });
    const listeners = new Set();
    let activeBranches = null;
    let history = [];
    let cursor = 0;
    let positionMs = 0;
    let state = 'paused';
    let configuredRate = playbackRate;
    let timerId = null;
    let settlement = null;
    let fault = null;
    let cancellation = null;

    function initializeBranches() {
      activeBranches = Object.fromEntries(BRANCH_ROLES.map((role) => {
        const definition = branches[role];
        const publicContext = createPolicyContext(role, definition);
        const policy = definition.createPolicy(cloneFreeze(
          publicContext,
          'comparison_policy_context_clone_failed'
        ));
        validatePolicy(policy, role);
        const driver = definition.createSimulation(cloneFreeze({
          schema: 'simulatte.comparisonSimulationContext.v4',
          comparisonId: id,
          branchId: definition.id,
          role,
          startingIdentity: frozenStartingIdentity,
          configuration: definition.configuration,
          configurationHash: definition.configurationHash,
          observableInput: frozenObservableInput,
          hiddenTruth: frozenHiddenTruth,
        }, 'comparison_simulation_context_clone_failed'));
        validateDriver(driver, role, synchronizationPolicy);
        const actualIdentity = driver.startingIdentity();
        validateStartingIdentity(actualIdentity);
        if (canonical(actualIdentity) !== canonical(frozenStartingIdentity)) {
          fail('comparison_branch_identity_mismatch', `${role} branch starting identity does not match`, {
            expected: frozenStartingIdentity,
            actual: actualIdentity,
          });
        }
        const observation = readObservation(driver, role);
        return [role, {
          definition,
          driver,
          policy,
          status: 'ready',
          simulationTimeMs: 0,
          stepCount: 0,
          events: [],
          metrics: [],
          evidenceIds: new Set(),
          observation,
        }];
      }));
    }

    function createPolicyContext(role, definition) {
      return {
        schema: 'simulatte.comparisonPolicyContext.v4',
        comparisonId: id,
        branchId: definition.id,
        role,
        startingIdentity: frozenStartingIdentity,
        configuration: definition.configuration,
        configurationHash: definition.configurationHash,
        observableInput: frozenObservableInput,
      };
    }

    function play() {
      assertRunnable();
      if (state === 'playing') return snapshot();
      if (isComplete()) return snapshot();
      state = 'playing';
      emitState();
      schedule();
      return snapshot();
    }

    function resume() {
      return play();
    }

    function pause() {
      cancelTimer();
      if (!['cancelled', 'failed', 'settled'].includes(state)) state = 'paused';
      emitState();
      return snapshot();
    }

    function step(count = 1) {
      assertRunnable();
      if (!Number.isInteger(count) || count < 1) {
        fail('comparison_step_count_invalid', 'Comparison step count expected a positive integer');
      }
      cancelTimer();
      const shouldResume = state === 'playing';
      state = 'paused';
      const operations = [];
      for (let index = 0; index < count && !isComplete(); index += 1) {
        operations.push(cursor < history.length
          ? replayOperation(history[cursor])
          : executeOperation());
        cursor += 1;
      }
      if (isComplete()) {
        state = 'completed';
        notify(Object.freeze({ type: 'complete', comparison: snapshot() }));
      } else if (shouldResume) {
        state = 'playing';
        schedule();
      } else {
        emitState();
      }
      return Object.freeze(operations);
    }

    function seek(simulationTimeMs) {
      nonNegative(simulationTimeMs, 'comparison_seek_time_invalid', 'Comparison seek time');
      assertRestorable();
      pause();
      rebuild(0);
      const targetCursor = history.reduce(
        (count, operation) => count + (operation.masterTimeMs <= simulationTimeMs ? 1 : 0),
        0
      );
      rebuild(targetCursor);
      positionMs = simulationTimeMs;
      emitState();
      return snapshot();
    }

    function scrub(simulationTimeMs) {
      return seek(simulationTimeMs);
    }

    function replay({ autoplay = true } = {}) {
      if (typeof autoplay !== 'boolean') {
        fail('comparison_replay_autoplay_invalid', 'Comparison replay autoplay expected a boolean');
      }
      assertRestorable();
      pause();
      rebuild(0);
      emitState();
      return autoplay ? play() : snapshot();
    }

    function cancel(reason) {
      text(reason, 'comparison_cancel_reason_invalid', 'Comparison cancellation reason');
      if (state === 'settled') fail('comparison_cancel_settled', 'A settled comparison cannot be cancelled');
      cancelTimer();
      BRANCH_ROLES.forEach((role) => {
        const branch = activeBranches[role];
        if (typeof branch.driver.cancel === 'function') branch.driver.cancel(reason);
        branch.status = 'cancelled';
      });
      cancellation = deepFreeze({ reason, cursor, simulationTimeMs: positionMs });
      state = 'cancelled';
      notify(Object.freeze({ type: 'cancel', comparison: snapshot(), cancellation }));
      return snapshot();
    }

    function restore(receipt) {
      validateExecutionReceipt(receipt);
      assertReceiptIdentity(receipt);
      cancelTimer();
      history = cloneFreeze(receipt.history, 'comparison_restore_history_clone_failed');
      settlement = receipt.settlement === null
        ? null
        : cloneFreeze(receipt.settlement, 'comparison_restore_settlement_clone_failed');
      fault = receipt.fault === null
        ? null
        : cloneFreeze(receipt.fault, 'comparison_restore_fault_clone_failed');
      cancellation = receipt.cancellation === null
        ? null
        : cloneFreeze(receipt.cancellation, 'comparison_restore_cancellation_clone_failed');
      rebuild(receipt.cursor);
      positionMs = receipt.positionMs;
      state = receipt.state === 'playing' ? 'paused' : receipt.state;
      if (state === 'cancelled') {
        BRANCH_ROLES.forEach((role) => {
          activeBranches[role].status = 'cancelled';
        });
      } else if (state === 'failed' && fault && fault.evidence && fault.evidence.role) {
        activeBranches[fault.evidence.role].status = 'failed';
      }
      emitState();
      return snapshot();
    }

    function settle() {
      assertSettlementReady();
      try {
        const branchSettlements = Object.fromEntries(BRANCH_ROLES.map((role) => {
          const branch = activeBranches[role];
          const result = branch.driver.settle();
          rejectPromise(result, 'comparison_driver_async_invalid', `${role} settlement`);
          validateBranchSettlement(result, role);
          result.metrics.forEach((metric, index) => validateMetric(metric, `${role} settlement metric ${index}`));
          const settlementEvidenceIds = collectMetricEvidence(result.metrics);
          validateEvidenceClosure(settlementEvidenceIds, `${role} settlement`);
          result.evidenceIds.forEach((evidenceId) => settlementEvidenceIds.add(evidenceId));
          validateEvidenceClosure(settlementEvidenceIds, `${role} settlement`);
          const allEvidenceIds = new Set([...branch.evidenceIds, ...settlementEvidenceIds]);
          const missingRequired = requiredEvidenceIds.filter((evidenceId) => !allEvidenceIds.has(evidenceId));
          if (missingRequired.length) {
            fail('comparison_evidence_incomplete', `${role} branch is missing required evidence`, {
              role,
              missingRequired,
            });
          }
          return [role, cloneFreeze(result, 'comparison_settlement_clone_failed')];
        }));
        const metricDeltas = compareMetrics(
          branchSettlements.baseline.metrics,
          branchSettlements.intervention.metrics
        );
        settlement = deepFreeze({
          schema: 'simulatte.comparisonSettlement.v4',
          id: `${id}:settlement`,
          comparisonId: id,
          status: 'settled',
          synchronizationPolicy,
          startingIdentity: frozenStartingIdentity,
          branches: branchSettlements,
          metricDeltas,
          evidenceClosure: {
            status: 'closed',
            requiredEvidenceIds: [...requiredEvidenceIds],
          },
        });
        state = 'settled';
        notify(Object.freeze({ type: 'settlement', settlement, comparison: snapshot() }));
        return settlement;
      } catch (error) {
        recordFault(
          error && error.code ? error.code : 'comparison_settlement_failed',
          'Comparison settlement failed',
          {
            causeCode: error && error.code ? error.code : null,
            causeMessage: error && error.message ? error.message : String(error),
          }
        );
      }
    }

    function executeOperation() {
      const roles = rolesToAdvance();
      const operation = {
        schema: 'simulatte.comparisonOperation.v4',
        index: history.length,
        synchronizationPolicy,
        advancedRoles: roles,
        branches: {},
      };
      roles.forEach((role) => {
        operation.branches[role] = advanceBranch(role, null);
      });
      operation.masterTimeMs = operationTime(operation);
      validateSynchronization(operation);
      const frozen = deepFreeze(operation);
      history = Object.freeze([...history, frozen]);
      positionMs = frozen.masterTimeMs;
      notify(Object.freeze({ type: 'operation', operation: frozen, comparison: snapshot() }));
      return frozen;
    }

    function replayOperation(recorded) {
      const actual = {
        schema: 'simulatte.comparisonOperation.v4',
        index: recorded.index,
        synchronizationPolicy,
        advancedRoles: [...recorded.advancedRoles],
        branches: {},
      };
      recorded.advancedRoles.forEach((role) => {
        actual.branches[role] = advanceBranch(role, recorded.branches[role].action);
      });
      actual.masterTimeMs = operationTime(actual);
      const frozen = deepFreeze(actual);
      if (canonical(frozen) !== canonical(recorded)) {
        recordFault('comparison_replay_diverged', 'Replayed comparison operation differs from its receipt', {
          index: recorded.index,
          expected: recorded,
          actual: frozen,
        });
      }
      positionMs = recorded.masterTimeMs;
      notify(Object.freeze({ type: 'operation', operation: recorded, replayed: true, comparison: snapshot() }));
      return recorded;
    }

    function rolesToAdvance() {
      const active = BRANCH_ROLES.filter((role) => !isBranchTerminal(activeBranches[role]));
      if (!active.length) return [];
      if (synchronizationPolicy === 'lockstep') return active;
      const nextTimes = active.map((role) => ({
        role,
        time: activeBranches[role].driver.nextEventTimeMs(),
      }));
      nextTimes.forEach(({ role, time }) => {
        nonNegative(time, 'comparison_next_event_time_invalid', `${role} next event time`);
        if (time < activeBranches[role].simulationTimeMs) {
          fail('comparison_next_event_reversed', `${role} next event time precedes branch time`);
        }
      });
      const nextTime = Math.min(...nextTimes.map((row) => row.time));
      return nextTimes.filter((row) => row.time === nextTime).map((row) => row.role);
    }

    function advanceBranch(role, recordedAction) {
      const branch = activeBranches[role];
      const policyContext = deepFreeze({
        schema: 'simulatte.comparisonPolicyStepContext.v4',
        comparisonId: id,
        branchId: branch.definition.id,
        role,
        stepIndex: branch.stepCount,
        simulationTimeMs: branch.simulationTimeMs,
      });
      const action = recordedAction === null
        ? branch.policy.decide(cloneFreeze(branch.observation, 'comparison_observation_clone_failed'), policyContext)
        : recordedAction;
      rejectPromise(action, 'comparison_policy_async_invalid', `${role} policy action`);
      assertPolicySafe(action, `${role} policy action`);
      const frozenAction = cloneFreeze(action, 'comparison_policy_action_clone_failed');
      let transition;
      let ownedTransition = null;
      try {
        transition = branch.driver.advance(deepFreeze({
          schema: 'simulatte.comparisonAdvanceRequest.v4',
          action: frozenAction,
          stepIndex: branch.stepCount,
          synchronizationPolicy,
        }));
        rejectPromise(transition, 'comparison_driver_async_invalid', `${role} driver transition`);
        validateTransition(transition, role);
        ownedTransition = cloneFreeze(transition, 'comparison_transition_clone_failed');
        applyTransition(branch, ownedTransition, role);
      } catch (error) {
        branch.status = 'failed';
        recordFault('comparison_branch_advance_failed', `${role} branch failed to advance`, {
          role,
          causeCode: error && error.code ? error.code : null,
          causeMessage: error && error.message ? error.message : String(error),
        });
      }
      return deepFreeze({
        action: frozenAction,
        transition: ownedTransition,
      });
    }

    function applyTransition(branch, transition, role) {
      if (transition.simulationTimeMs < branch.simulationTimeMs) {
        fail('comparison_branch_time_reversed', `${role} branch time moved backwards`);
      }
      transition.events.forEach((event) => {
        contracts.validateDomainEvent(event, `${role} transition event`);
        if (event.simulationTimeMs > transition.simulationTimeMs) {
          fail('comparison_event_after_transition', `${role} event occurs after its transition`);
        }
      });
      transition.metrics.forEach((metric, index) => validateMetric(metric, `${role} metric ${index}`));
      const transitionEvidenceIds = new Set([
        ...collectEventEvidence(transition.events),
        ...collectMetricEvidence(transition.metrics),
        ...transition.evidenceIds,
      ]);
      validateEvidenceClosure(transitionEvidenceIds, `${role} transition`);
      branch.events.push(...transition.events);
      timelineModule.createTimeline({ id: branch.definition.id, events: branch.events });
      branch.metrics = transition.metrics;
      transitionEvidenceIds.forEach((evidenceId) => branch.evidenceIds.add(evidenceId));
      branch.simulationTimeMs = transition.simulationTimeMs;
      branch.status = transition.status;
      branch.stepCount += 1;
      branch.observation = transition.observation;
      assertPolicySafe(branch.observation, `${role} observation`);
    }

    function validateSynchronization(operation) {
      if (synchronizationPolicy !== 'lockstep' || operation.advancedRoles.length !== 2) return;
      const times = operation.advancedRoles.map(
        (role) => operation.branches[role].transition.simulationTimeMs
      );
      if (new Set(times).size !== 1) {
        recordFault('comparison_branch_clock_drift', 'Lockstep branches advanced to different times', {
          operationIndex: operation.index,
          baselineTimeMs: times[0],
          interventionTimeMs: times[1],
        });
      }
    }

    function rebuild(targetCursor) {
      if (!Number.isInteger(targetCursor) || targetCursor < 0 || targetCursor > history.length) {
        fail('comparison_restore_cursor_invalid', 'Comparison restore cursor is outside its history');
      }
      initializeBranches();
      cursor = 0;
      positionMs = 0;
      while (cursor < targetCursor) {
        replayOperation(history[cursor]);
        cursor += 1;
      }
    }

    function receipt() {
      return deepFreeze({
        schema: 'simulatte.comparisonExecutionReceipt.v4',
        id,
        synchronizationPolicy,
        startingIdentity: frozenStartingIdentity,
        branchDefinitions,
        evidenceIds: [...evidenceIds].sort(),
        requiredEvidenceIds: [...requiredEvidenceIds],
        state,
        positionMs,
        cursor,
        history,
        branches: branchSnapshots(),
        fault,
        cancellation,
        settlement,
      });
    }

    function snapshot() {
      return deepFreeze({
        schema: 'simulatte.comparisonExecutionState.v4',
        id,
        synchronizationPolicy,
        state,
        positionMs,
        cursor,
        operationCount: history.length,
        branches: branchSnapshots(),
        fault,
        cancellation,
        hasSettlement: settlement !== null,
      });
    }

    function branchSnapshots() {
      return Object.fromEntries(BRANCH_ROLES.map((role) => {
        const branch = activeBranches[role];
        const timeline = timelineModule.createTimeline({
          id: branch.definition.id,
          events: branch.events,
        });
        return [role, deepFreeze({
          id: branch.definition.id,
          role,
          status: branch.status,
          simulationTimeMs: branch.simulationTimeMs,
          stepCount: branch.stepCount,
          metricIds: branch.metrics.map((metric) => metric.id),
          evidenceIds: [...branch.evidenceIds].sort(),
          timeline: timeline.receipt(),
        })];
      }));
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') {
        fail('comparison_listener_invalid', 'Comparison listener expected a function');
      }
      listeners.add(listener);
      listener(Object.freeze({ type: 'state', comparison: snapshot() }));
      return () => listeners.delete(listener);
    }

    function setPlaybackRate(nextRate) {
      positive(nextRate, 'comparison_playback_rate_invalid', 'Comparison playback rate');
      configuredRate = nextRate;
      if (state === 'playing') {
        cancelTimer();
        schedule();
      }
      emitState();
      return snapshot();
    }

    function schedule() {
      if (state !== 'playing' || timerId !== null || isComplete()) return;
      timerId = setTimer(tick, Math.max(1, wallIntervalMs / configuredRate));
    }

    function tick() {
      timerId = null;
      if (state !== 'playing') return;
      step(1);
      schedule();
    }

    function cancelTimer() {
      if (timerId === null) return;
      clearTimer(timerId);
      timerId = null;
    }

    function emitState() {
      notify(Object.freeze({ type: 'state', comparison: snapshot() }));
    }

    function notify(message) {
      listeners.forEach((listener) => listener(message));
    }

    function isComplete() {
      return BRANCH_ROLES.every((role) => isBranchTerminal(activeBranches[role]));
    }

    function assertRunnable() {
      if (fault) throw faultError(fault);
      if (cancellation || state === 'cancelled') {
        fail('comparison_cancelled', 'Cancelled comparison cannot advance', cancellation);
      }
      if (state === 'settled') fail('comparison_already_settled', 'Settled comparison cannot advance');
    }

    function assertRestorable() {
      if (cancellation) fail('comparison_cancelled', 'Cancelled comparison cannot replay', cancellation);
      if (fault) throw faultError(fault);
      if (state === 'settled') fail('comparison_already_settled', 'Settled comparison cannot replay');
    }

    function assertSettlementReady() {
      if (fault) throw faultError(fault);
      if (cancellation || state === 'cancelled') {
        fail('comparison_settlement_cancelled', 'Cancelled comparison cannot settle', cancellation);
      }
      BRANCH_ROLES.forEach((role) => {
        const branch = activeBranches[role];
        if (branch.status !== 'terminal') {
          fail('comparison_branch_not_terminal', `${role} branch is not terminal`, {
            role,
            status: branch.status,
          });
        }
        const actualIdentity = branch.driver.startingIdentity();
        if (canonical(actualIdentity) !== canonical(frozenStartingIdentity)) {
          fail('comparison_branch_identity_mismatch', `${role} branch identity changed before settlement`);
        }
      });
      if (synchronizationPolicy === 'lockstep') {
        const baseline = activeBranches.baseline;
        const intervention = activeBranches.intervention;
        if (baseline.simulationTimeMs !== intervention.simulationTimeMs
          || baseline.stepCount !== intervention.stepCount) {
          fail('comparison_branch_clock_drift', 'Lockstep branches are not aligned at settlement');
        }
      }
    }

    function recordFault(code, message, evidence) {
      cancelTimer();
      fault = deepFreeze({ code, message, evidence });
      state = 'failed';
      notify(Object.freeze({ type: 'error', comparison: snapshot(), fault }));
      throw faultError(fault);
    }

    function assertReceiptIdentity(value) {
      if (value.id !== id
        || value.synchronizationPolicy !== synchronizationPolicy
        || canonical(value.startingIdentity) !== canonical(frozenStartingIdentity)
        || canonical(value.branchDefinitions) !== canonical(branchDefinitions)
        || canonical(value.evidenceIds) !== canonical([...evidenceIds].sort())
        || canonical(value.requiredEvidenceIds) !== canonical(requiredEvidenceIds)) {
        fail('comparison_restore_identity_mismatch', 'Comparison receipt identity does not match this execution');
      }
    }

    initializeBranches();
    if (restoreReceipt !== null) restore(restoreReceipt);

    return Object.freeze({
      schema: 'simulatte.comparisonExecution.v4',
      cancel,
      pause,
      play,
      receipt,
      replay,
      restore,
      resume,
      scrub,
      seek,
      setPlaybackRate,
      settle,
      snapshot,
      step,
      subscribe,
    });

    function validateEvidenceClosure(candidateIds, label) {
      candidateIds.forEach((evidenceId) => {
        if (!evidenceIds.has(evidenceId)) {
          fail('comparison_evidence_unknown', `${label} references unknown evidence ${evidenceId}`, {
            evidenceId,
          });
        }
      });
    }
  }


  return Object.freeze({
    BRANCH_ROLES,
    BRANCH_STATUSES,
    SYNCHRONIZATION_POLICIES,
    createComparisonExecution,
    validateStartingIdentity,
  });
});
