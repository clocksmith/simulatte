(function attachPluginScheduler(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginScheduler = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPluginSchedulerModule() {
  // Stable discrete-event scheduler. Events are ordered strictly by
  //   (timestamp, priority, stable sequence)
  // so a replay with identical scheduling produces an identical processing order and
  // therefore an identical terminal hash. Events are immutable, cancellation is
  // supported via supersession, and a maximum-event budget fails closed rather than
  // spinning forever.
  const SCHEMA = 'simulatte.simulationScheduler.v1';

  function compareEvents(left, right) {
    if (left.time !== right.time) return left.time - right.time;
    if (left.priority !== right.priority) return left.priority - right.priority;
    return left.sequence - right.sequence;
  }

  // Binary min-heap keyed by compareEvents.
  function createHeap() {
    const items = [];
    function up(index) {
      let child = index;
      while (child > 0) {
        const parent = (child - 1) >> 1;
        if (compareEvents(items[child], items[parent]) >= 0) break;
        const value = items[child];
        items[child] = items[parent];
        items[parent] = value;
        child = parent;
      }
    }
    function down(index) {
      let parent = index;
      const length = items.length;
      for (;;) {
        const left = parent * 2 + 1;
        const right = left + 1;
        let smallest = parent;
        if (left < length && compareEvents(items[left], items[smallest]) < 0) smallest = left;
        if (right < length && compareEvents(items[right], items[smallest]) < 0) smallest = right;
        if (smallest === parent) break;
        const value = items[parent];
        items[parent] = items[smallest];
        items[smallest] = value;
        parent = smallest;
      }
    }
    return {
      get size() { return items.length; },
      push(item) { items.push(item); up(items.length - 1); },
      pop() {
        if (!items.length) return null;
        const top = items[0];
        const last = items.pop();
        if (items.length) { items[0] = last; down(0); }
        return top;
      },
      peek() { return items.length ? items[0] : null; },
      toSortedArray() { return items.slice().sort(compareEvents); },
    };
  }

  function createScheduler(pluginId, { maxEvents = 1000000 } = {}) {
    const heap = createHeap();
    const cancelled = new Set();
    let sequence = 0;
    let clock = 0;
    let processed = 0;
    const log = [];

    function schedule({ time, kind, payload = null, priority = 0 } = {}) {
      if (!Number.isFinite(time)) throw schedulerError('scheduler_time_invalid', `Scheduled event time expected a finite number, received ${time}`);
      if (time < clock) throw schedulerError('scheduler_time_reversed', `Plugin ${pluginId} scheduled ${kind} at ${time} before clock ${clock}`, { kind, time, clock });
      if (typeof kind !== 'string' || !kind) throw schedulerError('scheduler_kind_invalid', 'Scheduled event kind expected non-empty text');
      const id = `${pluginId}:evt:${sequence}`;
      const event = Object.freeze({ id, time, kind, payload, priority, sequence });
      sequence += 1;
      heap.push(event);
      return id;
    }

    // Supersession: a cancelled event id is skipped when it surfaces from the heap.
    function cancel(eventId) { cancelled.add(eventId); }

    // Drain the queue in deterministic order. The handler may schedule further events
    // (which must be at time >= current clock). Exhausting the budget fails closed.
    function drain(handler, { maxEvents: localMax = maxEvents } = {}) {
      let count = 0;
      while (heap.size > 0) {
        const event = heap.pop();
        if (cancelled.has(event.id)) continue;
        clock = event.time;
        count += 1;
        processed += 1;
        if (count > localMax) throw schedulerError('scheduler_budget_exhausted', `Plugin ${pluginId} scheduler exceeded ${localMax} events`, { pluginId, processed });
        log.push(Object.freeze({ id: event.id, time: event.time, kind: event.kind, priority: event.priority }));
        handler(event, { schedule, cancel, clock });
      }
      return count;
    }

    function receipt() {
      return Object.freeze({
        schema: 'simulatte.schedulerReceipt.v1',
        pluginId,
        scheduledCount: sequence,
        processedCount: processed,
        cancelledCount: cancelled.size,
        finalClock: clock,
        eventLogHashInputs: log.length,
      });
    }

    return Object.freeze({
      schema: SCHEMA,
      schedule,
      cancel,
      drain,
      now: () => clock,
      pending: () => heap.size,
      trace: () => Object.freeze(log.slice()),
      receipt,
    });
  }

  function createSchedulerPort({ maxEvents = 1000000 } = {}) {
    function forPlugin(pluginId) {
      return Object.freeze({ create: (options = {}) => createScheduler(pluginId, { maxEvents, ...options }) });
    }
    return Object.freeze({ forPlugin });
  }

  function schedulerError(code, message, evidence) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulattePluginSchedulerError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return { SCHEMA, createSchedulerPort, createScheduler, compareEvents };
});
