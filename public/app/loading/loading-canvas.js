(function attachSimulatteLoadingCanvas(root) {
  if (typeof module === 'object' && module.exports) {
    require('./loading-canvas-dependencies.js');
    require('./loading-canvas-config.js');
    require('./loading-canvas-controller.js');
    require('./loading-canvas-drawing.js');
    require('./loading-canvas-pathing.js');
  }
  const scope = root.__SimulatteLoadingCanvasRefactorScope = root.__SimulatteLoadingCanvasRefactorScope || {};
  if (scope.missingDependency) return;
  let api;
  with (scope) {
    api = { createController };
  }
  if (typeof module === 'object' && module.exports) {
      module.exports = api;
    }
  root.SimulatteLoadingCanvas = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
