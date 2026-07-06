(function attachSimulattePhysicsLab(root, factory) {
  const model = typeof module === 'object' && module.exports
    ? require('../../pipeline/phase-06-simulation/simulatte-physics-model.js')
    : root.SimulattePhysicsModel;
  const renderer = typeof module === 'object' && module.exports
    ? require('../prompt/prompt-controller.js')
    : root.SimulattePhysicsRenderer;
  const api = factory(model, renderer);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulattePhysicsLab = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPhysicsLab(model, renderer) {
  return {
    ...model,
    ...renderer,
  };
});

if (typeof window !== 'undefined') {
  window.SimulatteStartPhysicsLab = () => {
    const lab = window.SimulattePhysicsLab;
    if (!lab || typeof lab.start !== 'function') return false;
    if (!lab._browserLab) lab._browserLab = lab.start();
    return true;
  };
  const startWhenReady = () => {
    if (!window.SimulatteStartPhysicsLab()) {
      console.warn('[simulatte.physics] lab runtime not ready; boot loader may retry scripts');
    }
  };
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', startWhenReady, { once: true });
  } else {
    startWhenReady();
  }
}
