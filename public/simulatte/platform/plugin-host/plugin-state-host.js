(function attachPluginStateHost(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginStateHost = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPluginStateHostModule() {
  function createPluginStateHost(pluginIds = []) {
    const allowed = new Set(pluginIds);
    const reducers = new Map();
    const states = new Map(pluginIds.map((id) => [id, Object.freeze({})]));
    const events = [];

    function register(pluginId, reducer, initialState = {}) {
      assertAllowed(pluginId);
      if (reducers.has(pluginId)) throw stateError('plugin_reducer_duplicate', `Plugin ${pluginId} already registered a reducer`, { pluginId });
      if (typeof reducer !== 'function') throw stateError('plugin_reducer_invalid', `Plugin ${pluginId} reducer expected a function`, { pluginId });
      reducers.set(pluginId, reducer);
      states.set(pluginId, freezeClone(initialState));
    }

    function propose(pluginId, event) {
      assertAllowed(pluginId);
      if (!event || typeof event !== 'object' || Array.isArray(event)) throw stateError('plugin_event_invalid', `Plugin ${pluginId} proposed an invalid event`, { pluginId });
      if (event.pluginId !== pluginId) throw stateError('plugin_event_namespace_mismatch', `Plugin ${pluginId} cannot propose event for ${event.pluginId || 'missing'}`, { pluginId, eventPluginId: event.pluginId || null });
      if (typeof event.kind !== 'string' || !event.kind.startsWith(`${pluginId}.`)) throw stateError('plugin_event_kind_invalid', `Plugin ${pluginId} event kind must begin ${pluginId}.`, { kind: event.kind || null });
      const sequence = events.length;
      const row = freezeClone({ schema: 'simulatte.pluginEvent.v1', sequence, ...event });
      const reducer = reducers.get(pluginId);
      if (reducer) {
        const nextState = reducer(states.get(pluginId), row);
        if (!nextState || typeof nextState !== 'object' || Array.isArray(nextState)) throw stateError('plugin_reducer_state_invalid', `Plugin ${pluginId} reducer expected a plain state object`, { pluginId, receivedType: Array.isArray(nextState) ? 'array' : typeof nextState });
        states.set(pluginId, freezeClone(nextState));
      }
      events.push(row);
      return row;
    }

    function read(pluginId) {
      assertAllowed(pluginId);
      return states.get(pluginId);
    }

    function trace() {
      return Object.freeze([...events]);
    }

    function assertAllowed(pluginId) {
      if (!allowed.has(pluginId)) throw stateError('plugin_state_namespace_undeclared', `Plugin state namespace ${pluginId} is not active`, { pluginId });
    }

    return Object.freeze({ register, propose, read, trace });
  }

  function freezeClone(value) {
    return deepFreeze(structuredClone(value));
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function stateError(code, message, evidence) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulattePluginStateError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return { createPluginStateHost, deepFreeze, freezeClone };
});
