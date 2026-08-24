(function attachMultirateCoordinator(root, factory) {
  const primitives = typeof module === 'object' && module.exports
    ? require('../../contracts/contract-validation-primitives.js')
    : root.SimulatteAutonomyContractPrimitives;
  const contracts = typeof module === 'object' && module.exports
    ? require('../../contracts/multiscale-contracts.js')
    : root.SimulatteMultiscaleContracts;
  const api = factory(primitives, contracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteMultirateCoordinator = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMultirateCoordinatorApi(primitives, contracts) {
  const CHECKPOINT_SCHEMA = 'simulatte.multirate-coordinator-checkpoint/v1';
  const REQUIRED_LIFECYCLE = Object.freeze([
    'initialize',
    'advance',
    'emit',
    'checkpoint',
    'restore',
    'aggregate',
    'refine',
    'dispose',
  ]);

  class MultirateCoordinatorError extends Error {
    constructor(code, message, details = null) {
      super(`${code}: ${message}`);
      this.name = 'SimulatteMultirateCoordinatorError';
      this.code = code;
      this.details = details;
    }
  }

  function compileExecutionPlan({ modules, ports, couplingPlan, adapters = {}, coupledSolverHandlers = {} }) {
    requireArray(modules, 'modules', 1);
    requireArray(ports, 'ports');
    const moduleById = new Map();
    [...modules].sort(byId).forEach((module) => {
      requireRecord(module, `module ${module?.id || '<unknown>'}`);
      requireString(module.id, 'module.id');
      requireString(module.implementationId, `${module.id}.implementationId`);
      requireString(module.implementationHash, `${module.id}.implementationHash`);
      if (moduleById.has(module.id)) fail('multirate_module_duplicate', `Duplicate module ${module.id}`);
      validateClock(module.clock, module.id);
      REQUIRED_LIFECYCLE.forEach((operation) => {
        if (typeof module.lifecycle?.[operation] !== 'function') {
          fail('multirate_lifecycle_missing', `Module ${module.id} must implement ${operation}`);
        }
      });
      moduleById.set(module.id, module);
    });

    const portById = new Map();
    [...ports].sort(byId).forEach((port) => {
      contracts.validateSimulationPort(port);
      if (!moduleById.has(port.moduleInstanceId)) {
        fail('multirate_port_module_unknown', `Port ${port.id} references unknown module ${port.moduleInstanceId}`);
      }
      if (portById.has(port.id)) fail('multirate_port_duplicate', `Duplicate port ${port.id}`);
      portById.set(port.id, port);
    });
    contracts.validateCouplingPlan(couplingPlan, { ports: [...portById.values()] });

    const inputPortsByModule = indexPorts(portById, 'input');
    const outputPortsByModule = indexPorts(portById, 'output');
    const outgoingEdgesByPort = new Map();
    const edgeById = new Map();
    [...couplingPlan.edges].sort(byId).forEach((edge) => {
      edgeById.set(edge.id, edge);
      const rows = outgoingEdgesByPort.get(edge.sourcePortId) || [];
      rows.push(edge);
      outgoingEdgesByPort.set(edge.sourcePortId, rows);
      if (edge.adapterId !== null && typeof adapters[edge.adapterId] !== 'function') {
        fail('multirate_adapter_missing', `Coupling edge ${edge.id} requires adapter ${edge.adapterId}`);
      }
    });
    outgoingEdgesByPort.forEach((rows) => rows.sort(byId));

    const solverGroups = [...couplingPlan.coupledSolvers].sort(byId).map((solver) => {
      const moduleIds = [...new Set(solver.edgeIds.flatMap((edgeId) => {
        const edge = edgeById.get(edgeId);
        const source = portById.get(edge.sourcePortId);
        const destination = portById.get(edge.destinationPortId);
        return [source.moduleInstanceId, destination.moduleInstanceId];
      }))].sort();
      if (typeof coupledSolverHandlers[solver.id] !== 'function') {
        fail('multirate_coupled_solver_missing', `Coupled solver ${solver.id} has no serial handler`);
      }
      return freeze({ solver, moduleIds });
    });
    const solverByModuleId = new Map();
    solverGroups.forEach((group) => group.moduleIds.forEach((moduleId) => {
      if (solverByModuleId.has(moduleId)) {
        fail('multirate_coupled_solver_overlap', `Module ${moduleId} belongs to multiple coupled solvers`);
      }
      solverByModuleId.set(moduleId, group);
    }));

    const canonical = {
      modules: [...moduleById.values()].map((module) => ({
        id: module.id,
        implementationId: module.implementationId,
        implementationHash: module.implementationHash,
        clock: module.clock,
      })),
      ports: [...portById.values()],
      couplingPlan,
    };
    return freeze({
      id: `execution-plan:${contentHash(canonical)}`,
      contentHash: contentHash(canonical),
      modules: [...moduleById.values()],
      moduleById,
      portById,
      inputPortsByModule,
      outputPortsByModule,
      outgoingEdgesByPort,
      solverGroups,
      solverByModuleId,
    });
  }

  function createCoordinator(configuration) {
    const {
      id,
      worldSpecContentHash,
      modules,
      ports,
      couplingPlan,
      adapters = {},
      coupledSolverHandlers = {},
      initialPortValues = {},
      inputDefaults = {},
      startTime = 0,
      branchId = 'main',
      parentCheckpointId = null,
    } = configuration || {};
    requireString(id, 'id');
    requireString(worldSpecContentHash, 'worldSpecContentHash');
    requireFinite(startTime, 'startTime');
    const plan = compileExecutionPlan({ modules, ports, couplingPlan, adapters, coupledSolverHandlers });
    const states = new Map();
    const stateHashes = new Map();
    const lastTimes = new Map(plan.modules.map((module) => [module.id, startTime]));
    const nextTimes = new Map(plan.modules.map((module) => [
      module.id,
      module.clock.kind === 'fixed' ? startTime + module.clock.intervalSeconds : Infinity,
    ]));
    const inputBuffers = new Map();
    const moduleActive = new Map(plan.modules.map((module) => [module.id, true]));
    const suspendedNextTimes = new Map();
    let pendingDeliveries = [];
    let pendingControls = [];
    let controlHistory = [];
    let ledger = [];
    let logicalTime = startTime;
    let roundSequence = 0;
    let initialized = false;
    let cancelled = false;
    let disposed = false;
    let cancellationReason = null;
    let runActive = false;

    Object.entries(initialPortValues).sort(([left], [right]) => left.localeCompare(right)).forEach(([portId, row]) => {
      const port = plan.portById.get(portId);
      if (!port || port.direction !== 'input') fail('multirate_initial_port_unknown', `Initial value references unknown input port ${portId}`);
      inputBuffers.set(portId, validatePortRecord(port, normalizePortRecord(row, startTime), 'initial'));
    });

    async function initialize() {
      assertUsable();
      if (initialized) return snapshot();
      for (const module of plan.modules) {
        const state = await module.lifecycle.initialize(freeze({
          moduleId: module.id,
          logicalTime,
          worldSpecContentHash,
          branchId,
        }));
        states.set(module.id, clone(state));
        stateHashes.set(module.id, contentHash(state));
      }
      initialized = true;
      return snapshot();
    }

    function enqueueControl(control) {
      assertUsable();
      assertSafeBoundary();
      requireRecord(control, 'control');
      requireString(control.id, 'control.id');
      requireFinite(control.logicalTime, 'control.logicalTime');
      requireString(control.authority, 'control.authority');
      requireArray(control.targetModuleIds, 'control.targetModuleIds', 1);
      if (control.logicalTime < logicalTime) fail('multirate_control_in_past', `Control ${control.id} precedes logical time ${logicalTime}`);
      control.targetModuleIds.forEach((moduleId) => {
        if (!plan.moduleById.has(moduleId)) fail('multirate_control_module_unknown', `Control ${control.id} targets unknown module ${moduleId}`);
        if (!moduleActive.get(moduleId)) fail('multirate_control_module_inactive', `Control ${control.id} targets inactive module ${moduleId}`);
      });
      if (controlHistory.some((row) => row.id === control.id)) fail('multirate_control_duplicate', `Duplicate control ${control.id}`);
      const retained = freeze(clone(control));
      pendingControls.push(retained);
      pendingControls.sort(byLogicalTimeThenId);
      controlHistory.push(retained);
      controlHistory.sort(byLogicalTimeThenId);
      return retained;
    }

    async function runUntil(targetTime) {
      assertUsable();
      if (runActive) fail('multirate_run_active', `Coordinator ${id} is already advancing`);
      requireFinite(targetTime, 'targetTime');
      if (targetTime < logicalTime) fail('multirate_time_reverse', `Cannot run backward from ${logicalTime} to ${targetTime}`);
      runActive = true;
      try {
        if (!initialized) await initialize();
        while (!cancelled) {
          const nextTime = nextCommunicationTime();
          if (!Number.isFinite(nextTime) || nextTime > targetTime) break;
          await executeRound(nextTime);
        }
        return snapshot();
      } finally {
        runActive = false;
      }
    }

    async function executeRound(nextTime) {
      applyPendingDeliveries(nextTime);
      const controls = pendingControls.filter((row) => row.logicalTime === nextTime);
      pendingControls = pendingControls.filter((row) => row.logicalTime !== nextTime);
      const due = new Set(plan.modules.filter((module) => nextTimes.get(module.id) === nextTime).map((module) => module.id));
      controls.forEach((control) => control.targetModuleIds.forEach((moduleId) => due.add(moduleId)));
      expandCoupledGroups(due);
      const moduleIds = [...due].sort();
      const latchedInputs = Object.fromEntries(moduleIds.map((moduleId) => [moduleId, latchInputs(moduleId)]));
      const roundId = `${id}:round:${String(roundSequence + 1).padStart(8, '0')}`;
      const results = new Map();
      const handled = new Set();
      const failures = [];

      try {
        for (const moduleId of moduleIds) {
          if (handled.has(moduleId)) continue;
          const group = plan.solverByModuleId.get(moduleId);
          if (group) {
            const response = await coupledSolverHandlers[group.solver.id](freeze({
              solver: group.solver,
              moduleIds: group.moduleIds,
              fromTimes: Object.fromEntries(group.moduleIds.map((id) => [id, lastTimes.get(id)])),
              toTime: nextTime,
              states: Object.fromEntries(group.moduleIds.map((id) => [id, clone(states.get(id))])),
              inputs: Object.fromEntries(group.moduleIds.map((id) => [id, latchedInputs[id]])),
              controls: controlsForModules(controls, group.moduleIds),
            }));
            group.moduleIds.forEach((id) => {
              results.set(id, validateModuleResult(id, response?.[id], nextTime));
              handled.add(id);
            });
          } else {
            results.set(moduleId, await invokeModule(moduleId, nextTime, latchedInputs[moduleId], controls));
            handled.add(moduleId);
          }
        }
      } catch (error) {
        failures.push(failureRecord(error));
        appendRound({ roundId, nextTime, moduleIds, latchedInputs, results, controls, failures, status: 'rejected' });
        throw error;
      }

      for (const moduleId of moduleIds) {
        const result = results.get(moduleId);
        states.set(moduleId, clone(result.state));
        stateHashes.set(moduleId, result.stateHash);
        lastTimes.set(moduleId, nextTime);
        const module = plan.moduleById.get(moduleId);
        if (module.clock.kind === 'fixed' && nextTimes.get(moduleId) === nextTime) {
          nextTimes.set(moduleId, nextTime + module.clock.intervalSeconds);
        }
      }
      const deliveries = createDeliveries(results, nextTime, roundId);
      pendingDeliveries.push(...deliveries);
      pendingDeliveries.sort(byDelivery);
      logicalTime = nextTime;
      roundSequence += 1;
      appendRound({ roundId, nextTime, moduleIds, latchedInputs, results, controls, failures, deliveries, status: 'accepted' });
    }

    async function invokeModule(moduleId, toTime, inputs, controls) {
      const module = plan.moduleById.get(moduleId);
      const advanced = await module.lifecycle.advance(freeze({
        moduleId,
        fromTime: lastTimes.get(moduleId),
        toTime,
        state: clone(states.get(moduleId)),
        inputs,
        controls: controlsForModules(controls, [moduleId]),
      }));
      requireRecord(advanced, `${moduleId}.advance result`);
      const emitted = await module.lifecycle.emit(freeze({
        moduleId,
        logicalTime: toTime,
        state: clone(advanced.state),
        inputs,
      }));
      return validateModuleResult(moduleId, {
        state: advanced.state,
        outputs: emitted,
        events: advanced.events || [],
        diagnostics: advanced.diagnostics || [],
      }, toTime);
    }

    function validateModuleResult(moduleId, result, toTime) {
      requireRecord(result, `${moduleId} result`);
      requireArray(result.outputs, `${moduleId}.outputs`);
      requireArray(result.events || [], `${moduleId}.events`);
      requireArray(result.diagnostics || [], `${moduleId}.diagnostics`);
      const allowedPorts = new Map((plan.outputPortsByModule.get(moduleId) || []).map((port) => [port.id, port]));
      const seen = new Set();
      const outputs = [...result.outputs].map((row) => {
        requireRecord(row, `${moduleId}.output`);
        const port = allowedPorts.get(row.portId);
        if (!port) fail('multirate_output_port_invalid', `Module ${moduleId} emitted undeclared port ${row.portId}`);
        if (seen.has(row.portId)) fail('multirate_output_duplicate', `Module ${moduleId} emitted ${row.portId} more than once`);
        seen.add(row.portId);
        return validatePortRecord(port, normalizePortRecord(row, toTime), 'output');
      }).sort((left, right) => left.portId.localeCompare(right.portId));
      return freeze({
        state: clone(result.state),
        stateHash: contentHash(result.state),
        outputs,
        events: clone(result.events || []),
        diagnostics: clone(result.diagnostics || []),
      });
    }

    function latchInputs(moduleId) {
      const rows = {};
      (plan.inputPortsByModule.get(moduleId) || []).forEach((port) => {
        let record = inputBuffers.get(port.id);
        if (!record && port.missingDataBehavior === 'use-declared-default') {
          if (!Object.prototype.hasOwnProperty.call(inputDefaults, port.id)) {
            fail('multirate_input_default_missing', `Input ${port.id} declares a default policy without a default`);
          }
          record = validatePortRecord(port, normalizePortRecord(inputDefaults[port.id], logicalTime), 'default');
        }
        if (!record && port.missingDataBehavior === 'emit-unknown') {
          record = freeze({ portId: port.id, value: null, timestamp: logicalTime, provenance: null, unknown: true });
        }
        if (!record) fail('multirate_input_missing', `Input ${port.id} has no latched value`);
        rows[port.id] = clone(record);
      });
      return freeze(rows);
    }

    function createDeliveries(results, nextTime, roundId) {
      const rows = [];
      [...results.entries()].sort(([left], [right]) => left.localeCompare(right)).forEach(([, result]) => {
        result.outputs.forEach((output) => {
          (plan.outgoingEdgesByPort.get(output.portId) || []).forEach((edge) => {
            const destination = plan.portById.get(edge.destinationPortId);
            const adapter = edge.adapterId === null ? null : adapters[edge.adapterId];
            const transformed = adapter ? adapter(freeze({
              value: clone(output.value),
              sourcePort: plan.portById.get(output.portId),
              destinationPort: destination,
              logicalTime: nextTime,
            })) : output.value;
            const record = validatePortRecord(destination, {
              portId: destination.id,
              value: transformed,
              timestamp: output.timestamp + edge.delaySeconds,
              provenance: output.provenance,
            }, 'coupling');
            rows.push(freeze({
              id: `${roundId}:${edge.id}`,
              edgeId: edge.id,
              adapterId: edge.adapterId,
              sourcePortId: output.portId,
              destinationPortId: destination.id,
              availableAt: output.timestamp + edge.delaySeconds,
              record,
            }));
          });
        });
      });
      return rows.sort(byDelivery);
    }

    function applyPendingDeliveries(time) {
      const ready = pendingDeliveries.filter((row) => row.availableAt <= time);
      pendingDeliveries = pendingDeliveries.filter((row) => row.availableAt > time);
      ready.sort(byDelivery).forEach((row) => inputBuffers.set(row.destinationPortId, row.record));
    }

    function nextCommunicationTime() {
      const fixed = Math.min(...nextTimes.values());
      const control = pendingControls.length ? pendingControls[0].logicalTime : Infinity;
      return Math.min(fixed, control);
    }

    function expandCoupledGroups(due) {
      let changed = true;
      while (changed) {
        changed = false;
        [...due].forEach((moduleId) => {
          const group = plan.solverByModuleId.get(moduleId);
          group?.moduleIds.forEach((id) => {
            if (!due.has(id)) {
              due.add(id);
              changed = true;
            }
          });
        });
      }
    }

    function appendRound({ roundId, nextTime, moduleIds, latchedInputs, results, controls, failures, deliveries = [], status }) {
      const entry = {
        schema: 'simulatte.multirate-exchange-ledger-entry/v1',
        id: roundId,
        sequence: ledger.length + 1,
        branchId,
        logicalTime: nextTime,
        status,
        activatedModuleIds: moduleIds,
        latchedInputHashes: Object.fromEntries(moduleIds.map((moduleId) => [moduleId, contentHash(latchedInputs[moduleId])])),
        outputHashes: Object.fromEntries([...results.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([moduleId, result]) => [moduleId, contentHash(result.outputs)])),
        moduleStateHashes: Object.fromEntries([...results.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([moduleId, result]) => [moduleId, result.stateHash])),
        adapterIds: [...new Set(deliveries.map((row) => row.adapterId).filter(Boolean))].sort(),
        controlIds: controls.map((row) => row.id).sort(),
        events: [...results.values()].flatMap((result) => result.events).map(clone),
        diagnostics: [...results.values()].flatMap((result) => result.diagnostics).map(clone),
        failures,
        deliveries: deliveries.map((row) => ({
          id: row.id,
          edgeId: row.edgeId,
          destinationPortId: row.destinationPortId,
          availableAt: row.availableAt,
          valueHash: contentHash(row.record),
        })),
      };
      entry.contentHash = contentHash(entry);
      ledger.push(freeze(entry));
    }

    async function checkpoint(checkpointId = `${id}:checkpoint:${logicalTime}`) {
      assertReady();
      assertSafeBoundary();
      const moduleCheckpoints = {};
      for (const module of plan.modules) {
        moduleCheckpoints[module.id] = await module.lifecycle.checkpoint(freeze({
          moduleId: module.id,
          logicalTime,
          state: clone(states.get(module.id)),
        }));
      }
      const value = {
        schema: CHECKPOINT_SCHEMA,
        id: checkpointId,
        coordinatorId: id,
        worldSpecContentHash,
        executionPlanHash: plan.contentHash,
        logicalTime,
        branchId,
        parentCheckpointId,
        roundSequence,
        states: Object.fromEntries([...states.entries()].map(([key, value]) => [key, clone(value)])),
        stateHashes: Object.fromEntries(stateHashes),
        lastTimes: Object.fromEntries(lastTimes),
        nextTimes: Object.fromEntries(nextTimes),
        moduleActive: Object.fromEntries(moduleActive),
        suspendedNextTimes: Object.fromEntries(suspendedNextTimes),
        inputBuffers: Object.fromEntries(inputBuffers),
        pendingDeliveries: clone(pendingDeliveries),
        pendingControls: clone(pendingControls),
        controlHistory: clone(controlHistory),
        ledger: clone(ledger),
        moduleCheckpoints,
      };
      value.contentHash = contentHash(value);
      return freeze(value);
    }

    async function restore(checkpointValue) {
      assertUsable();
      assertSafeBoundary();
      validateCheckpoint(checkpointValue, id, worldSpecContentHash, plan.contentHash);
      for (const module of plan.modules) {
        const state = await module.lifecycle.restore(freeze({
          moduleId: module.id,
          logicalTime: checkpointValue.logicalTime,
          checkpoint: clone(checkpointValue.moduleCheckpoints[module.id]),
          state: clone(checkpointValue.states[module.id]),
        }));
        const restoredState = state === undefined ? checkpointValue.states[module.id] : state;
        if (contentHash(restoredState) !== checkpointValue.stateHashes[module.id]) {
          fail('multirate_restore_state_diverged', `Module ${module.id} restored a different state`);
        }
        states.set(module.id, clone(restoredState));
        stateHashes.set(module.id, checkpointValue.stateHashes[module.id]);
      }
      replaceMap(lastTimes, checkpointValue.lastTimes);
      replaceMap(nextTimes, checkpointValue.nextTimes);
      replaceMap(moduleActive, checkpointValue.moduleActive);
      replaceMap(suspendedNextTimes, checkpointValue.suspendedNextTimes);
      replaceMap(inputBuffers, checkpointValue.inputBuffers);
      pendingDeliveries = clone(checkpointValue.pendingDeliveries);
      pendingControls = clone(checkpointValue.pendingControls);
      controlHistory = clone(checkpointValue.controlHistory);
      ledger = checkpointValue.ledger.map(freeze);
      logicalTime = checkpointValue.logicalTime;
      roundSequence = checkpointValue.roundSequence;
      initialized = true;
      cancelled = false;
      cancellationReason = null;
      return snapshot();
    }

    async function branch({ id: childId, checkpoint: sourceCheckpoint }) {
      requireString(childId, 'branch.id');
      const child = createCoordinator({
        ...configuration,
        id: childId,
        branchId: childId,
        parentCheckpointId: sourceCheckpoint.id,
      });
      const childCheckpoint = {
        ...clone(sourceCheckpoint),
        coordinatorId: childId,
        branchId: childId,
      };
      delete childCheckpoint.contentHash;
      childCheckpoint.contentHash = contentHash(childCheckpoint);
      await child.restore(childCheckpoint);
      return child;
    }

    async function transition(operation, moduleIds, request = {}) {
      assertReady();
      assertSafeBoundary();
      if (!['aggregate', 'refine'].includes(operation)) fail('multirate_transition_invalid', `Unknown transition ${operation}`);
      const ids = [...new Set(moduleIds)].sort();
      for (const moduleId of ids) {
        const module = plan.moduleById.get(moduleId);
        if (!module) fail('multirate_transition_module_unknown', `Unknown module ${moduleId}`);
        const state = await module.lifecycle[operation](freeze({
          moduleId,
          logicalTime,
          state: clone(states.get(moduleId)),
          request: clone(request),
        }));
        states.set(moduleId, clone(state));
        stateHashes.set(moduleId, contentHash(state));
      }
      const entry = {
        schema: 'simulatte.multirate-state-transition/v1',
        id: `${id}:${operation}:${ledger.length + 1}`,
        sequence: ledger.length + 1,
        branchId,
        logicalTime,
        status: 'accepted',
        operation,
        activatedModuleIds: ids,
        moduleStateHashes: Object.fromEntries(ids.map((moduleId) => [moduleId, stateHashes.get(moduleId)])),
      };
      entry.contentHash = contentHash(entry);
      ledger.push(freeze(entry));
      return snapshot();
    }

    function setModuleActive(moduleIds, active, reason = 'simulation-residency-transition') {
      assertReady();
      assertSafeBoundary();
      if (typeof active !== 'boolean') fail('multirate_module_active_invalid', 'Module active state must be boolean');
      const ids = [...new Set(moduleIds)].sort();
      ids.forEach((moduleId) => {
        const module = plan.moduleById.get(moduleId);
        if (!module) fail('multirate_transition_module_unknown', `Unknown module ${moduleId}`);
        if (moduleActive.get(moduleId) === active) return;
        if (!active) {
          suspendedNextTimes.set(moduleId, nextTimes.get(moduleId));
          nextTimes.set(moduleId, Infinity);
        } else {
          const interval = module.clock.kind === 'fixed' ? module.clock.intervalSeconds : Infinity;
          const prior = suspendedNextTimes.get(moduleId);
          nextTimes.set(moduleId, Number.isFinite(prior) && prior > logicalTime ? prior : logicalTime + interval);
          suspendedNextTimes.delete(moduleId);
        }
        moduleActive.set(moduleId, active);
      });
      const entry = {
        schema: 'simulatte.multirate-module-residency/v1',
        id: `${id}:module-residency:${ledger.length + 1}`,
        sequence: ledger.length + 1,
        branchId,
        logicalTime,
        status: 'accepted',
        active,
        reason: String(reason),
        activatedModuleIds: ids,
        moduleStateHashes: Object.fromEntries(ids.map((moduleId) => [moduleId, stateHashes.get(moduleId)])),
      };
      entry.contentHash = contentHash(entry);
      ledger.push(freeze(entry));
      return snapshot();
    }

    async function replay(expectedLedger = ledger) {
      assertReady();
      const reference = expectedLedger.map(clone);
      const replayCoordinator = createCoordinator(configuration);
      await replayCoordinator.initialize();
      controlHistory.forEach((control) => replayCoordinator.enqueueControl(control));
      const terminalTime = reference.reduce((maximum, row) => Math.max(maximum, row.logicalTime), startTime);
      await replayCoordinator.runUntil(terminalTime);
      const actual = replayCoordinator.getLedger();
      const count = Math.max(reference.length, actual.length);
      for (let index = 0; index < count; index += 1) {
        if (reference[index]?.contentHash !== actual[index]?.contentHash) {
          return freeze({
            status: 'diverged',
            roundIndex: index,
            expectedHash: reference[index]?.contentHash || null,
            actualHash: actual[index]?.contentHash || null,
            expected: reference[index] || null,
            actual: actual[index] || null,
          });
        }
      }
      return freeze({ status: 'match', rounds: reference.length, terminalTime });
    }

    function cancel(reason = 'cancelled') {
      assertUsable();
      cancelled = true;
      cancellationReason = String(reason);
      return snapshot();
    }

    async function dispose() {
      if (disposed) return;
      for (const module of plan.modules) {
        await module.lifecycle.dispose(freeze({
          moduleId: module.id,
          logicalTime,
          state: clone(states.get(module.id)),
        }));
      }
      disposed = true;
    }

    function getLedger() {
      return freeze(ledger.map(clone));
    }

    function snapshot() {
      return freeze({
        id,
        branchId,
        parentCheckpointId,
        worldSpecContentHash,
        executionPlanHash: plan.contentHash,
        logicalTime,
        initialized,
        cancelled,
        cancellationReason,
        disposed,
        safeBoundary: !runActive,
        moduleActive: Object.fromEntries(moduleActive),
        moduleStateHashes: Object.fromEntries(stateHashes),
        pendingDeliveryCount: pendingDeliveries.length,
        pendingControlCount: pendingControls.length,
        ledgerLength: ledger.length,
      });
    }

    function assertUsable() {
      if (disposed) fail('multirate_disposed', `Coordinator ${id} has been disposed`);
    }

    function assertReady() {
      assertUsable();
      if (!initialized) fail('multirate_not_initialized', `Coordinator ${id} is not initialized`);
    }

    function assertSafeBoundary() {
      if (runActive) fail('multirate_boundary_unsafe', `Coordinator ${id} is advancing and cannot mutate residency`);
    }

    return Object.freeze({
      aggregate: (moduleIds, request) => transition('aggregate', moduleIds, request),
      branch,
      cancel,
      checkpoint,
      dispose,
      enqueueControl,
      getLedger,
      initialize,
      refine: (moduleIds, request) => transition('refine', moduleIds, request),
      replay,
      restore,
      runUntil,
      setModuleActive,
      snapshot,
    });
  }

  function validateCheckpoint(value, coordinatorId, worldSpecContentHash, executionPlanHash) {
    requireRecord(value, 'checkpoint');
    if (value.schema !== CHECKPOINT_SCHEMA) fail('multirate_checkpoint_schema_invalid', `Expected ${CHECKPOINT_SCHEMA}`);
    if (value.coordinatorId !== coordinatorId) fail('multirate_checkpoint_coordinator_mismatch', `Checkpoint belongs to ${value.coordinatorId}`);
    if (value.worldSpecContentHash !== worldSpecContentHash) fail('multirate_checkpoint_world_mismatch', 'Checkpoint WorldSpec identity differs');
    if (value.executionPlanHash !== executionPlanHash) fail('multirate_checkpoint_plan_mismatch', 'Checkpoint execution plan differs');
    requireRecord(value.moduleActive, 'checkpoint.moduleActive');
    requireRecord(value.suspendedNextTimes, 'checkpoint.suspendedNextTimes');
    const candidate = clone(value);
    delete candidate.contentHash;
    if (contentHash(candidate) !== value.contentHash) fail('multirate_checkpoint_hash_invalid', 'Checkpoint content hash does not match');
  }

  function normalizePortRecord(value, timestamp) {
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, 'value')) {
      return {
        portId: value.portId,
        value: value.value,
        timestamp: value.timestamp ?? timestamp,
        provenance: value.provenance ?? null,
      };
    }
    return { portId: null, value, timestamp, provenance: null };
  }

  function validatePortRecord(port, row, origin) {
    const record = { ...row, portId: port.id };
    requireFinite(record.timestamp, `${origin}.${port.id}.timestamp`);
    if (port.provenanceRequired && !record.provenance) fail('multirate_port_provenance_missing', `${port.id} requires provenance`);
    validateShape(record.value, port.shape, `${origin}.${port.id}.value`);
    validateRange(record.value, port.validRange, `${origin}.${port.id}.value`);
    return freeze(record);
  }

  function validateShape(value, shape, path) {
    if (shape.length === 0) {
      if (!Number.isFinite(value)) fail('multirate_port_value_invalid', `${path} must be a finite scalar`);
      return;
    }
    function visit(current, depth) {
      if (!Array.isArray(current) || current.length !== shape[depth]) {
        fail('multirate_port_shape_invalid', `${path} must match [${shape.join(',')}]`);
      }
      if (depth === shape.length - 1) {
        current.forEach((row) => {
          if (!Number.isFinite(row)) fail('multirate_port_value_invalid', `${path} must contain finite numbers`);
        });
      } else current.forEach((row) => visit(row, depth + 1));
    }
    visit(value, 0);
  }

  function validateRange(value, range, path) {
    const values = Array.isArray(value) ? value.flat(Infinity) : [value];
    values.forEach((row) => {
      if (range.minimum !== null && row < range.minimum) fail('multirate_port_range_invalid', `${path} is below ${range.minimum}`);
      if (range.maximum !== null && row > range.maximum) fail('multirate_port_range_invalid', `${path} is above ${range.maximum}`);
    });
  }

  function validateClock(clock, moduleId) {
    requireRecord(clock, `${moduleId}.clock`);
    if (!['fixed', 'event'].includes(clock.kind)) fail('multirate_clock_invalid', `Module ${moduleId} has unsupported clock ${clock.kind}`);
    if (clock.kind === 'fixed') requirePositive(clock.intervalSeconds, `${moduleId}.clock.intervalSeconds`);
    if (clock.kind === 'event' && clock.intervalSeconds !== null) fail('multirate_clock_invalid', `Event module ${moduleId} must use a null interval`);
  }

  function indexPorts(portById, direction) {
    const result = new Map();
    [...portById.values()].filter((port) => port.direction === direction).forEach((port) => {
      const rows = result.get(port.moduleInstanceId) || [];
      rows.push(port);
      rows.sort(byId);
      result.set(port.moduleInstanceId, rows);
    });
    return result;
  }

  function controlsForModules(controls, moduleIds) {
    const selected = new Set(moduleIds);
    return controls.filter((control) => control.targetModuleIds.some((id) => selected.has(id))).map(clone);
  }

  function failureRecord(error) {
    return freeze({
      code: error?.code || 'multirate_module_failure',
      message: error?.message || String(error),
    });
  }

  function replaceMap(target, value) {
    target.clear();
    Object.entries(value).forEach(([key, row]) => target.set(key, clone(row)));
  }

  function contentHash(value) {
    const input = primitives.canonicalJson(value);
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(freeze);
    return Object.freeze(value);
  }

  function byId(left, right) {
    return String(left.id).localeCompare(String(right.id));
  }

  function byLogicalTimeThenId(left, right) {
    return left.logicalTime - right.logicalTime || left.id.localeCompare(right.id);
  }

  function byDelivery(left, right) {
    return left.availableAt - right.availableAt || left.id.localeCompare(right.id);
  }

  function requireRecord(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('multirate_record_invalid', `${label} must be an object`);
  }

  function requireArray(value, label, minimum = 0) {
    if (!Array.isArray(value) || value.length < minimum) fail('multirate_array_invalid', `${label} must contain at least ${minimum} row(s)`);
  }

  function requireString(value, label) {
    if (typeof value !== 'string' || !value) fail('multirate_string_invalid', `${label} must be a non-empty string`);
  }

  function requireFinite(value, label) {
    if (!Number.isFinite(value)) fail('multirate_number_invalid', `${label} must be finite`);
  }

  function requirePositive(value, label) {
    if (!Number.isFinite(value) || value <= 0) fail('multirate_number_invalid', `${label} must be positive`);
  }

  function fail(code, message, details = null) {
    throw new MultirateCoordinatorError(code, message, details);
  }

  return Object.freeze({
    CHECKPOINT_SCHEMA,
    MultirateCoordinatorError,
    compileExecutionPlan,
    contentHash,
    createCoordinator,
  });
});
