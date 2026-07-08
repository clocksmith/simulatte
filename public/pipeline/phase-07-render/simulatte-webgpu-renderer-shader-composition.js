(function attachSimulatteWebGpuRenderershadercomposition(root) {
  const scope = root.__SimulatteWebGpuRendererRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const WEBGPU_SHADER = WEBGPU_SHADER_PARTS.join('\n');

    Object.assign(scope, {
      WEBGPU_SHADER,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
