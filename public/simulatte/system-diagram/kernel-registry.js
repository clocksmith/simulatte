(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteSystemDiagramKernels = api;
})(globalThis, function () {
  'use strict';
  const HOOKS = Object.freeze(['validateParams', 'init', 'start', 'onRequest', 'onServed', 'onResult', 'onWake', 'onFault', 'onControl', 'observe']);
  const kernels = new Map();
  // A kernel implements behaviour for one class-library kernel id through the engine ctx API only.
  function register(kernel) {
    if (!kernel || typeof kernel.id !== 'string' || !kernel.id) throw Error('Kernel registration requires an id');
    if (kernels.has(kernel.id)) throw Error(`Kernel ${kernel.id} is already registered`);
    for (const key of Object.keys(kernel)) if (key !== 'id' && key !== 'station' && !HOOKS.includes(key)) throw Error(`Kernel ${kernel.id} declares unknown hook ${key}`);
    for (const hook of HOOKS) if (kernel[hook] !== undefined && typeof kernel[hook] !== 'function') throw Error(`Kernel ${kernel.id}.${hook} must be a function`);
    if (kernel.station !== undefined && kernel.station !== null && (typeof kernel.station !== 'object' || typeof kernel.station.concurrency !== 'string' || typeof kernel.station.queueCapacity !== 'string')) throw Error(`Kernel ${kernel.id}.station must name concurrency and queueCapacity parameters`);
    kernels.set(kernel.id, Object.freeze({ ...kernel }));
  }
  function get(id) {
    const kernel = kernels.get(id);
    if (!kernel) throw Error(`Kernel ${id} has no registered behaviour`);
    return kernel;
  }
  return Object.freeze({ HOOKS, register, get, has: id => kernels.has(id), ids: () => [...kernels.keys()].sort() });
});
