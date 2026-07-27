(function attachExperienceCamera(root, factory) {
  const api = factory();
  root.SimulatteExperienceCamera = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createExperienceCameraApi() {
  function applyInitialCamera({ configuration, renderer, focusSelect, onModeSelected }) {
    const targetId = configuration?.pluginId && configuration?.targetId
      ? `plugin:${configuration.pluginId}:${configuration.targetId}`
      : null;
    if (targetId && !renderer.cameraTargets().some((row) => row.id === targetId)) return false;
    if (targetId) {
      focusSelect.value = targetId;
      renderer.focusCameraTarget(targetId);
    }
    if (configuration?.initialMode) {
      const mode = canonicalMode(configuration.initialMode);
      renderer.setCameraMode(mode);
      onModeSelected(mode);
    }
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
