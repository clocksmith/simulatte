(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MotorcycleLifecycle = api;
})(globalThis, function() {
  function create({ prepare, frame, suspend, release, onState,
    requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame, clock = () => performance.now() }) {
    let state = 'loading', generation = 0, frameId = null, disposed = false;
    let paused = false, recoveries = 0, failures = [], pending = null;
    const frameCpuMs=[];let frameCount=0;
    const snapshot = () => ({ state, generation, recoveries, paused, failures: failures.map(row => ({ ...row })),
      observation:{frameCount,frameCpuMs:[...frameCpuMs],scope:'Main-thread frame call; excludes GPU completion and worker measurement latency'} });
    function publish(next) { state = next; onState(snapshot()); }
    function cancel() { if (frameId !== null) cancelFrame(frameId); frameId = null; }
    function schedule(id) {
      if (disposed || id !== generation || frameId !== null) return;
      frameId = requestFrame(now => {
        frameId = null;
        if (disposed || id !== generation) return;
        try {
          const started=clock();frame(now);frameCount++;frameCpuMs.push(clock()-started);if(frameCpuMs.length>120)frameCpuMs.shift();
          publish(paused ? 'paused' : 'running');
          schedule(id);
        } catch (error) { void fail(error); }
      });
    }
    async function launch(recovering) {
      const id = ++generation;
      cancel(); publish(recovering ? 'recovering' : 'loading');
      try {
        await prepare({ backend: recovering ? 'webgl' : 'auto', isCurrent: () => !disposed && id === generation });
        if (disposed || id !== generation) { await release(); return; }
        schedule(id); // Only a successful frame can publish running or paused.
      } catch (error) { if (!disposed && id === generation) await fail(error); }
    }
    async function fail(error) {
      cancel(); ++generation;
      failures.push({ message: error.message || String(error), state });
      publish('recovering');
      try { suspend(); } catch(cleanupError) { failures.push({message:cleanupError.message,state:'suspend'}); }
      try { await release(); } catch (cleanupError) { failures.push({ message: cleanupError.message, state: 'cleanup' }); }
      if (disposed) return;
      if (recoveries < 1) { recoveries++; await launch(true); }
      else publish('failed');
    }
    return Object.freeze({
      snapshot,
      start() { if(['running','paused'].includes(state))return Promise.resolve(snapshot()); if (!pending && !disposed) pending = launch(false).finally(() => { pending = null; }); return pending; },
      setPaused(value) { paused = !!value; if (['running', 'paused'].includes(state)) publish(paused ? 'paused' : 'running'); },
      retry() { if (state !== 'failed' || disposed) return pending; recoveries = 0; return this.start(); },
      async dispose() { disposed = true; ++generation; cancel(); suspend(); await release(); },
    });
  }
  return { create };
});
