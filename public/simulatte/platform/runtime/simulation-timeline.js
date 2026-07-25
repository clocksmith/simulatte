(function attachSimulationTimeline(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../contracts/plugin-v4-contracts.js')
    : root.SimulattePluginV4Contracts;
  const api = factory(contracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSimulationTimeline = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSimulationTimelineModule(contracts) {
  function compareEvents(left, right) {
    if (left.simulationTimeMs !== right.simulationTimeMs) return left.simulationTimeMs - right.simulationTimeMs;
    if (left.sequence !== right.sequence) return left.sequence - right.sequence;
    return left.id.localeCompare(right.id);
  }

  function createTimeline({ id, events = [], parent = null } = {}) {
    text(id, 'timeline_id_invalid', 'Timeline ID');
    const parentReceipt = parent === null ? null : validateParent(parent);
    const ordered = validateEvents(events);
    const byId = new Map(ordered.map((event) => [event.id, event]));
    validateCausation(ordered, byId);

    function all() {
      return ordered;
    }

    function atOrBefore(simulationTimeMs) {
      time(simulationTimeMs, 'timeline_time_invalid', 'Timeline query time');
      return Object.freeze(ordered.filter((event) => event.simulationTimeMs <= simulationTimeMs));
    }

    function between(startMs, endMs) {
      time(startMs, 'timeline_time_invalid', 'Timeline range start');
      time(endMs, 'timeline_time_invalid', 'Timeline range end');
      if (endMs < startMs) throw timelineError('timeline_range_reversed', 'Timeline range end must not precede its start', { startMs, endMs });
      return Object.freeze(ordered.filter((event) => event.simulationTimeMs >= startMs && event.simulationTimeMs <= endMs));
    }

    function event(eventId) {
      return byId.get(eventId) || null;
    }

    function branch({ id: branchId, atMs, events: branchEvents = [] } = {}) {
      text(branchId, 'timeline_branch_id_invalid', 'Timeline branch ID');
      time(atMs, 'timeline_branch_time_invalid', 'Timeline branch time');
      if (branchId === id) throw timelineError('timeline_branch_id_conflict', `Timeline branch ${branchId} must have a new ID`);
      const prefix = ordered.filter((row) => row.simulationTimeMs <= atMs);
      const additions = validateEvents(branchEvents);
      if (additions.some((row) => row.simulationTimeMs < atMs)) {
        throw timelineError('timeline_branch_event_precedes_fork', `Timeline branch ${branchId} contains an event before ${atMs}`);
      }
      return createTimeline({
        id: branchId,
        events: [...prefix, ...additions],
        parent: { id, atMs, eventCount: prefix.length },
      });
    }

    function receipt() {
      const pluginIds = [...new Set(ordered.map((row) => row.pluginId))].sort();
      const correlationIds = [...new Set(ordered.map((row) => row.correlationId))].sort();
      return deepFreeze({
        schema: 'simulatte.timelineReceipt.v4',
        id,
        parent: parentReceipt,
        eventCount: ordered.length,
        startMs: ordered.length ? ordered[0].simulationTimeMs : 0,
        endMs: ordered.length ? ordered[ordered.length - 1].simulationTimeMs : 0,
        pluginIds,
        correlationIds,
        eventIds: ordered.map((row) => row.id),
      });
    }

    return Object.freeze({
      schema: 'simulatte.simulationTimeline.v4',
      all,
      atOrBefore,
      between,
      branch,
      event,
      receipt,
    });
  }

  function validateEvents(events) {
    if (!Array.isArray(events)) throw timelineError('timeline_events_invalid', 'Timeline events expected an array');
    const rows = events.map((event, index) => {
      contracts.validateDomainEvent(event, `Timeline event ${index}`);
      return deepFreeze(structuredClone(event));
    }).sort(compareEvents);
    const ids = rows.map((row) => row.id);
    if (new Set(ids).size !== ids.length) throw timelineError('timeline_event_duplicate', 'Timeline event IDs must be unique', { ids });
    const pluginSequences = new Map();
    rows.forEach((row) => {
      const previous = pluginSequences.get(row.pluginId);
      if (previous !== undefined && row.sequence <= previous) {
        throw timelineError('timeline_plugin_sequence_invalid', `Timeline plugin ${row.pluginId} sequence did not increase`, {
          pluginId: row.pluginId,
          previous,
          sequence: row.sequence,
        });
      }
      pluginSequences.set(row.pluginId, row.sequence);
    });
    return Object.freeze(rows);
  }

  function validateCausation(events, byId) {
    events.forEach((event) => {
      event.causationIds.forEach((causationId) => {
        const cause = byId.get(causationId);
        if (!cause) throw timelineError('timeline_cause_missing', `Timeline event ${event.id} references missing cause ${causationId}`);
        if (compareEvents(cause, event) >= 0) {
          throw timelineError('timeline_cause_not_earlier', `Timeline event ${event.id} cause ${causationId} is not earlier`);
        }
      });
    });
  }

  function validateParent(parent) {
    if (!parent || typeof parent !== 'object' || Array.isArray(parent)) throw timelineError('timeline_parent_invalid', 'Timeline parent expected an object');
    const keys = ['id', 'atMs', 'eventCount'];
    if (Object.keys(parent).length !== keys.length || keys.some((key) => !Object.hasOwn(parent, key))) {
      throw timelineError('timeline_parent_keys_invalid', 'Timeline parent has missing or unexpected keys');
    }
    text(parent.id, 'timeline_parent_id_invalid', 'Timeline parent ID');
    time(parent.atMs, 'timeline_parent_time_invalid', 'Timeline parent time');
    if (!Number.isInteger(parent.eventCount) || parent.eventCount < 0) throw timelineError('timeline_parent_count_invalid', 'Timeline parent event count is invalid');
    return deepFreeze(structuredClone(parent));
  }

  function text(value, code, label) {
    if (typeof value !== 'string' || !value) throw timelineError(code, `${label} expected non-empty text`);
  }

  function time(value, code, label) {
    if (!Number.isFinite(value) || value < 0) throw timelineError(code, `${label} expected a non-negative finite number`);
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function timelineError(code, message, evidence = null) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteSimulationTimelineError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return Object.freeze({ compareEvents, createTimeline });
});
