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

  function snapshotPayload(value, seen = new WeakMap(), path = 'payload') {
    if (value === null || typeof value === 'undefined') return value;
    if (['string', 'number', 'boolean', 'bigint'].includes(typeof value)) return value;
    if (typeof value !== 'object') {
      throw schedulerError('scheduler_payload_invalid', `Scheduled event ${path} contains unsupported ${typeof value}`, { path });
    }
    if (seen.has(value)) return seen.get(value);
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
      throw schedulerError('scheduler_payload_invalid', `Scheduled event ${path} expected records and arrays`, {
        path,
        receivedType: value.constructor?.name || 'object',
      });
    }
    if (Object.getOwnPropertySymbols(value).length) {
      throw schedulerError('scheduler_payload_invalid', `Scheduled event ${path} contains unsupported symbol keys`, { path });
    }
    const copy = Array.isArray(value) ? [] : Object.create(prototype);
    seen.set(value, copy);
    Object.keys(value).forEach((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || typeof descriptor.get === 'function' || typeof descriptor.set === 'function') {
        throw schedulerError('scheduler_payload_invalid', `Scheduled event ${path}.${key} expected a data property`, { path: `${path}.${key}` });
      }
      Object.defineProperty(copy, key, {
        value: snapshotPayload(descriptor.value, seen, `${path}.${key}`),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    });
    return Object.freeze(copy);
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
    validateEventBudget(maxEvents, 'scheduler maxEvents');
    const heap = createHeap();
    const cancelled = new Set();
    let sequence = 0;
    let clock = 0;
    let processed = 0;
    const log = [];
    let terminalFailure = null;

    function assertOperational(operation) {
      if (!terminalFailure) return;
      throw schedulerError('scheduler_terminal', `Plugin ${pluginId} cannot ${operation} after ${terminalFailure.code}`, {
        pluginId,
        operation,
        failure: terminalFailure,
      });
    }

    function fail(code, event, cause = null) {
      terminalFailure = Object.freeze({
        code,
        eventId: event?.id || null,
        eventKind: event?.kind || null,
        eventTime: event?.time ?? null,
        causeCode: typeof cause?.code === 'string' ? cause.code : null,
        causeMessage: typeof cause?.message === 'string' ? cause.message : null,
      });
      return terminalFailure;
    }

    function schedule({ time, kind, payload = null, priority = 0 } = {}) {
      assertOperational('schedule events');
      if (!Number.isFinite(time)) throw schedulerError('scheduler_time_invalid', `Scheduled event time expected a finite number, received ${time}`);
      if (time < clock) throw schedulerError('scheduler_time_reversed', `Plugin ${pluginId} scheduled ${kind} at ${time} before clock ${clock}`, { kind, time, clock });
      if (typeof kind !== 'string' || !kind) throw schedulerError('scheduler_kind_invalid', 'Scheduled event kind expected non-empty text');
      const id = `${pluginId}:evt:${sequence}`;
      const event = Object.freeze({ id, time, kind, payload: snapshotPayload(payload), priority, sequence });
      sequence += 1;
      heap.push(event);
      return id;
    }

    // Supersession: a cancelled event id is skipped when it surfaces from the heap.
    function cancel(eventId) {
      assertOperational('cancel events');
      cancelled.add(eventId);
    }

    // Drain the queue in deterministic order. The handler may schedule further events
    // (which must be at time >= current clock). Exhausting the budget fails closed.
    function drain(handler, { maxEvents: localMax = maxEvents } = {}) {
      assertOperational('drain events');
      if (typeof handler !== 'function') throw schedulerError('scheduler_handler_invalid', 'Scheduler drain expected an event handler');
      validateEventBudget(localMax, 'drain maxEvents');
      let count = 0;
      while (heap.size > 0) {
        const next = heap.peek();
        if (cancelled.has(next.id)) {
          heap.pop();
          continue;
        }
        if (count >= localMax) {
          const failure = fail('scheduler_budget_exhausted', next);
          throw schedulerError('scheduler_budget_exhausted', `Plugin ${pluginId} scheduler exhausted its ${localMax} event budget`, {
            pluginId,
            processedThisDrain: count,
            processedTotal: processed,
            blockedEventId: next.id,
            failure,
          });
        }
        const event = heap.pop();
        clock = event.time;
        try {
          const outcome = handler(event, { schedule, cancel, clock });
          if (outcome && typeof outcome.then === 'function') {
            throw schedulerError('scheduler_handler_async_unsupported', `Plugin ${pluginId} scheduler handlers must settle synchronously`, {
              pluginId,
              eventId: event.id,
            });
          }
        } catch (error) {
          fail('scheduler_handler_failed', event, error);
          throw error;
        }
        count += 1;
        processed += 1;
        log.push(Object.freeze({ id: event.id, time: event.time, kind: event.kind, priority: event.priority }));
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
        terminalState: terminalFailure ? 'failed' : (heap.size ? 'ready' : 'settled'),
        failure: terminalFailure,
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

  function validateEventBudget(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw schedulerError('scheduler_budget_invalid', `${label} expected a non-negative safe integer, received ${value}`, { value });
    }
  }

  return { SCHEMA, createSchedulerPort, createScheduler, compareEvents };
});
