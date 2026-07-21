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
      renderer.setCameraMode(configuration.initialMode);
      onModeSelected(configuration.initialMode);
    }
    return true;
  }

  function runCameraMode(configuration) {
    return configuration?.runMode || 'follow';
  }

  return { applyInitialCamera, runCameraMode };
});
