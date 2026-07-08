(function attachSimulatteLoadingCanvaspathing(root) {
  const scope = root.__SimulatteLoadingCanvasRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const DIRECTIONS = Object.freeze([
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
        { x: 0, y: -1 },
      ]);

    const ROYGBIV_SPECTRUM = Object.freeze([
        '#ff9fbd',
        '#ffc98b',
        '#f6e899',
        '#bdeca1',
        '#9ee8cf',
        '#9bdcff',
        '#b8b5ff',
        '#d7a8ff',
      ]);

    Object.assign(scope, {
      DIRECTIONS,
      ROYGBIV_SPECTRUM,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
