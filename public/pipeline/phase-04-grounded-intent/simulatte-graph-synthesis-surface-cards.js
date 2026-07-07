(function attachSimulatteGraphSynthesissurfacecards(root) {
  const scope = root.__SimulatteGraphSynthesisRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function clamp01(value) {
        return Math.max(0, Math.min(1, Number(value) || 0));
      }

    function uniqueList(values) {
        return Array.from(new Set((values || []).filter((value) => value !== undefined && value !== null)));
      }

    function escapeRegExp(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }

    Object.assign(scope, {
      clamp01,
      uniqueList,
      escapeRegExp,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
