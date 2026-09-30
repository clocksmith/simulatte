(function attachSimulationSession(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteSimulationSession = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSimulationSessionApi() {
  const CATEGORIES = Object.freeze(['observation', 'execution', 'live', 'scenario', 'authoring', 'reproduction']);
  const STATES = Object.freeze({
    preparation: ['idle', 'preparing', 'ready', 'failed'],
    execution: ['idle', 'running', 'paused', 'complete', 'failed'],
    rendering: ['idle', 'ready', 'recovering', 'failed'],
    measurement: ['unavailable', 'pending', 'fresh', 'stale'],
  });

  function operation(definition) {
    if (!definition || typeof definition.id !== 'string' || !definition.id.trim()
      || !CATEGORIES.includes(definition.category) || typeof definition.perform !== 'function') {
      throw new TypeError('A session operation needs an id, category, and perform function');
    }
    if (definition.category === 'live' && definition.requiresRestart) {
      throw new TypeError('A live operation cannot require restart');
    }
    if (definition.category === 'observation' && definition.requiresRestart) {
      throw new TypeError('An observation operation cannot require restart');
    }
    if (definition.category === 'scenario' && definition.requiresRestart !== true) {
      throw new TypeError('A scenario edit must declare restart');
    }
    if (definition.category === 'authoring' && definition.requiresCompile !== true) {
      throw new TypeError('An authoring edit must declare compilation');
    }
    if (definition.available !== undefined && typeof definition.available !== 'function') {
      throw new TypeError('Operation availability must be a function');
    }
    return Object.freeze({
      id: definition.id,
      category: definition.category,
      target: definition.target || 'session',
      requiresRestart: definition.requiresRestart === true,
      requiresCompile: definition.requiresCompile === true,
      serial: definition.serial === true,
      available: definition.available || (() => true),
      perform: definition.perform,
    });
  }

  function create({ id, capabilities, operations = [], onChange = () => {} }) {
    if (typeof id !== 'string' || !id.trim()) throw new TypeError('Session id is required');
    if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
      throw new TypeError('Session capabilities must be declared');
    }
    const declared = new Map();
    for (const value of operations) {
      const next = operation(value);
      if (declared.has(next.id)) throw new TypeError(`Duplicate session operation ${next.id}`);
      declared.set(next.id, next);
    }
    const capabilitySet = Object.freeze({ ...capabilities });
    let state = { preparation: 'idle', execution: 'idle', rendering: 'idle', measurement: 'unavailable' };
    let disposed = false;
    let revision = 0;
    let generation = 0;
    let sequence = 0;
    let lastOperation = null;
    let runtimeQueue = Promise.resolve();
    const pending = new Map();
    const cancelled = reason => Object.assign(new Error(reason || 'Operation cancelled'), { name: 'AbortError' });
    const notify = () => { revision += 1; onChange(snapshot()); };
    function cancel(reason = 'Operation cancelled') {
      generation += 1;
      for (const task of pending.values()) task.controller.abort(cancelled(reason));
    }
    const snapshot = () => Object.freeze({
      id, capabilities: capabilitySet, ...state, visibleStatus: visibleStatus(state), revision,
      pending: Object.freeze([...pending.values()].map(task => task.receipt)),
      lastOperation, generation,
      operations: Object.freeze([...declared.values()].map((value) => Object.freeze({
        id: value.id, category: value.category, target: value.target,
        requiresRestart: value.requiresRestart, requiresCompile: value.requiresCompile,
        serial: value.serial, available: !disposed && Boolean(value.available()),
      }))),
    });
    function update(changes) {
      if (disposed) return snapshot();
      for (const [key, value] of Object.entries(changes)) {
        if (!STATES[key]?.includes(value)) throw new TypeError(`Invalid session ${key} state: ${value}`);
      }
      state = { ...state, ...changes };
      revision += 1;
      const current = snapshot();
      onChange(current);
      return current;
    }
    async function invoke(operationId, input) {
      if (disposed) throw new Error('Session is disposed');
      const selected = declared.get(operationId);
      if (!selected || !selected.available()) throw new Error(`Session operation unavailable: ${operationId}`);
      if (['scenario', 'authoring', 'reproduction'].includes(selected.category)) cancel('Superseded by ' + operationId);
      // Repeating a command replaces that command, but observing and pausing do not cancel execution.
      for (const task of pending.values()) if (task.receipt.id === operationId) task.controller.abort(cancelled('Superseded by ' + operationId));
      const token = ++sequence, current = generation, controller = new AbortController();
      const receipt = Object.freeze({ id: operationId, token, generation: current, status: 'pending' });
      const task = { controller, receipt };
      pending.set(token, task);
      notify();
      const isCurrent = () => !disposed && !controller.signal.aborted && current === generation;
      const check = () => { if (!isCurrent()) throw controller.signal.reason || cancelled('Stale operation'); };
      const context = Object.freeze({ signal: controller.signal, generation: current, isCurrent,
        throwIfCancelled: check, commit(effect) { check(); return effect(); } });
      let abort;
      const aborted = new Promise((_, reject) => {
        abort = () => reject(controller.signal.reason || cancelled());
        controller.signal.addEventListener('abort', abort, { once: true });
      });
      // Keep non-abortable runtime mutations in order. Cancellation rejects promptly,
      // but a newer scenario waits until earlier runtime work has stopped touching it.
      const perform = () => { check(); return selected.perform(input, context); };
      const work = selected.serial ? runtimeQueue.then(perform) : Promise.resolve().then(perform);
      if (selected.serial) runtimeQueue = work.catch(() => {});
      if (controller.signal.aborted) abort();
      try {
        const value = await Promise.race([work, aborted]);
        check();
        if (!lastOperation || lastOperation.token <= token) lastOperation = Object.freeze({ ...receipt, status: 'success' });
        return value;
      } catch (error) {
        // A stale task can settle its own receipt, never replace the newer operation's result.
        if (!lastOperation || lastOperation.token <= token) lastOperation = Object.freeze({ ...receipt,
          status: !isCurrent() || error.name === 'AbortError' ? 'cancelled' : 'failed', error: error.message });
        throw error;
      } finally {
        controller.signal.removeEventListener('abort', abort);
        pending.delete(token);
        if (!disposed) notify();
      }
    }
    return Object.freeze({ snapshot, update, invoke, cancel, dispose() { cancel('Session disposed'); disposed = true; revision += 1; } });
  }

  function visibleStatus(state) {
    if (state.preparation === 'failed' || state.execution === 'failed' || state.rendering === 'failed') return 'Needs attention';
    if (state.rendering === 'recovering') return 'Recovering';
    if (state.preparation === 'preparing') return 'Preparing';
    if (state.execution === 'running' && state.rendering === 'ready') return 'Running';
    if (state.execution === 'paused') return 'Paused';
    if (state.execution === 'complete') return 'Complete';
    if (state.execution === 'running') return 'Preparing';
    return 'Waiting for input';
  }

  return Object.freeze({ CATEGORIES, STATES, operation, create, visibleStatus });
});
