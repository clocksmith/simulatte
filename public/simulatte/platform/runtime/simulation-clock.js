(function attachSimulationClock(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSimulationClock = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSimulationClockModule() {
  function createClock({
    timeline,
    playbackRate = 1,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    wallIntervalMs = 50,
  } = {}) {
    validateTimeline(timeline);
    rate(playbackRate);
    positive(wallIntervalMs, 'simulation_clock_interval_invalid', 'Clock wall interval');
    const listeners = new Set();
    let activeTimeline = timeline;
    let currentMs = 0;
    let cursor = 0;
    let state = 'paused';
    let timerId = null;
    let emittedCount = 0;
    let configuredRate = playbackRate;

    function play() {
      if (state === 'playing') return snapshot();
      if (cursor >= activeTimeline.all().length) seek(0);
      state = 'playing';
      emitState();
      schedule();
      return snapshot();
    }

    function pause() {
      state = 'paused';
      cancelTimer();
      emitState();
      return snapshot();
    }

    function step(count = 1) {
      if (!Number.isInteger(count) || count < 1) throw clockError('simulation_clock_step_invalid', 'Clock step count expected a positive integer');
      const events = activeTimeline.all();
      const emitted = [];
      for (let index = 0; index < count && cursor < events.length; index += 1) {
        const event = events[cursor];
        cursor += 1;
        currentMs = event.simulationTimeMs;
        emittedCount += 1;
        emitted.push(event);
        notify(Object.freeze({ type: 'event', event, clock: snapshot() }));
      }
      if (cursor >= events.length && state === 'playing') {
        state = 'paused';
        cancelTimer();
        notify(Object.freeze({ type: 'complete', clock: snapshot() }));
      } else {
        emitState();
      }
      return Object.freeze(emitted);
    }

    function seek(simulationTimeMs) {
      nonNegative(simulationTimeMs, 'simulation_clock_seek_invalid', 'Clock seek time');
      cancelTimer();
      state = 'paused';
      currentMs = simulationTimeMs;
      cursor = firstAfter(activeTimeline.all(), simulationTimeMs);
      emitState();
      return snapshot();
    }

    function replay() {
      cancelTimer();
      state = 'paused';
      currentMs = 0;
      cursor = 0;
      emitState();
      return play();
    }

    function useTimeline(nextTimeline, { atMs = 0 } = {}) {
      validateTimeline(nextTimeline);
      activeTimeline = nextTimeline;
      return seek(atMs);
    }

    function branch(options) {
      const nextTimeline = activeTimeline.branch({ atMs: currentMs, ...options });
      useTimeline(nextTimeline, { atMs: currentMs });
      notify(Object.freeze({ type: 'branch', timeline: nextTimeline.receipt(), clock: snapshot() }));
      return nextTimeline;
    }

    function setPlaybackRate(nextRate) {
      rate(nextRate);
      configuredRate = nextRate;
      if (state === 'playing') {
        cancelTimer();
        schedule();
      }
      emitState();
      return snapshot();
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') throw clockError('simulation_clock_listener_invalid', 'Clock listener expected a function');
      listeners.add(listener);
      listener(Object.freeze({ type: 'state', clock: snapshot() }));
      return () => listeners.delete(listener);
    }

    function snapshot() {
      const timelineReceipt = activeTimeline.receipt();
      return Object.freeze({
        schema: 'simulatte.simulationClockState.v4',
        timelineId: timelineReceipt.id,
        state,
        currentMs,
        playbackRate: configuredRate,
        cursor,
        eventCount: timelineReceipt.eventCount,
      });
    }

    function receipt() {
      return Object.freeze({
        schema: 'simulatte.simulationClockReceipt.v4',
        timeline: activeTimeline.receipt(),
        state: snapshot(),
        emittedCount,
      });
    }

    function schedule() {
      if (state !== 'playing' || timerId !== null) return;
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
      notify(Object.freeze({ type: 'state', clock: snapshot() }));
    }

    function notify(message) {
      listeners.forEach((listener) => listener(message));
    }

    return Object.freeze({
      schema: 'simulatte.simulationClock.v4',
      branch,
      pause,
      play,
      receipt,
      replay,
      seek,
      setPlaybackRate,
      snapshot,
      step,
      subscribe,
      useTimeline,
    });
  }

  function firstAfter(events, simulationTimeMs) {
    let low = 0;
    let high = events.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (events[middle].simulationTimeMs <= simulationTimeMs) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  function validateTimeline(value) {
    if (!value || value.schema !== 'simulatte.simulationTimeline.v4' || typeof value.all !== 'function') {
      throw clockError('simulation_clock_timeline_invalid', 'Clock expected a v4 simulation timeline');
    }
  }

  function rate(value) {
    positive(value, 'simulation_clock_rate_invalid', 'Clock playback rate');
  }

  function positive(value, code, label) {
    if (!Number.isFinite(value) || value <= 0) throw clockError(code, `${label} expected a positive finite number`);
  }

  function nonNegative(value, code, label) {
    if (!Number.isFinite(value) || value < 0) throw clockError(code, `${label} expected a non-negative finite number`);
  }

  function clockError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteSimulationClockError';
    error.code = code;
    return error;
  }

  return Object.freeze({ createClock, firstAfter });
});
