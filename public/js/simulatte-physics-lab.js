(function attachSimulattePhysicsLab(root, factory) {
  const model = typeof module === 'object' && module.exports
    ? require('./simulatte-physics-model.js')
    : root.SimulattePhysicsModel;
  const renderer = typeof module === 'object' && module.exports
    ? require('./simulatte-physics-renderer.js')
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
  window.addEventListener('DOMContentLoaded', () => {
    window.SimulattePhysicsLab._browserLab = window.SimulattePhysicsLab.start();
  });
}
