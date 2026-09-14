(function attachExperienceCamera(root, factory) {
  const api = factory();
  root.SimulatteExperienceCamera = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createExperienceCameraApi() {
  function applyInitialCamera({ configuration, renderer, onModeSelected }) {
    const mode = canonicalMode(configuration?.initialMode || 'overview');
    const targets = renderer.cameraTargets();
    const targetId = configuration?.pluginId && configuration?.targetId
      ? `plugin:${configuration.pluginId}:${configuration.targetId}`
      : [...targets].filter((row) => row.viewMode === mode)
        .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))[0]?.id || 'route';
    if (targetId && !targets.some((row) => row.id === targetId)) return false;
    if (renderer.resetCamera) {
      renderer.resetCamera({ targetId, mode });
      onModeSelected(mode);
      return true;
    }
    if (targetId) {
      renderer.focusCameraTarget(targetId);
    }
    renderer.setCameraMode(mode);
    onModeSelected(mode);
    return true;
  }

  function runCameraMode(configuration) {
    return canonicalMode(configuration?.runMode || 'follow');
  }

  function canonicalMode(mode) {
    return mode === 'bird' ? 'overview' : mode;
  }

  return { applyInitialCamera, canonicalMode, runCameraMode };
});
