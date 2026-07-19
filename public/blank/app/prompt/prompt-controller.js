(function attachSimulattePhysicsRenderer(root) {
  const lab = typeof module === 'object' && module.exports
    ? require('./prompt-controller-lab-controller.js')
    : root.SimulattePromptControllerLab;
  if (!lab || typeof lab.createBrowserLab !== 'function') {
    throw new Error('SimulattePhysicsRenderer requires the prompt controller lab');
  }
  function start() {
    if (typeof document === 'undefined') return null;
    return lab.createBrowserLab(document);
  }
  const api = Object.freeze({ createBrowserLab: lab.createBrowserLab, start });
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePhysicsRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
