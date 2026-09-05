(function attachCityPluginSession(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCityPluginSession = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCityPluginSessionModule() {
  function create({ hostRoot, extensions, pluginUi, elements, profile, interaction, playbackStorage,
    experienceCameraApi, simulationClockApi, pluginPlaybackApi, pluginViewRuntimeApi, log,
    recordRenderWork, renderWorkReceipt, renderExperienceSummary, summarize, yieldToFrame,
    getScenario, getCameraMode, getRenderer, selectCamera, selectViewMode, applyRouteParameters,
    onPhase, onPlayback, onViewRuntime, onError }) {
    let disposed = false;
    let pluginRenderGeneration = 0;
    let hasAppliedInitialCamera = false;
    let pluginClock = null;
    let pluginPlayback = null;
    let pluginViewRuntime = null;
    let lastPluginContributions = Object.freeze([]);
    const renderWork = {
      samples: [],
      phases: Object.fromEntries(['platform', 'pluginUi', 'renderer', 'viewRuntime', 'total'].map((key) => [key, []])),
    };
    async function renderPluginExperience(context) {
      if (disposed) return;
      const renderGeneration = ++pluginRenderGeneration;
      const renderStartedAt = performance.now();
      const pluginContext = { ...context, compositionSize: extensions.activePluginIds.length };
      const platformStartedAt = performance.now();
      const platform = extensions.platformV4(pluginContext);
      recordRenderWork(renderWork.phases.platform, performance.now() - platformStartedAt);
      Object.entries(platform.workCpuMs || {}).forEach(([phase, durationMs]) => {
        const key = `platform:${phase}`;
        if (!renderWork.phases[key]) renderWork.phases[key] = [];
        recordRenderWork(renderWork.phases[key], durationMs);
      });
      lastPluginContributions = platform.contributions;
      const uiStartedAt = performance.now();
      pluginUi.render(extensions.views(pluginContext), platform.contributions);
      if (applyRouteParameters()) pluginUi.render(extensions.views(pluginContext), platform.contributions);
      recordRenderWork(renderWork.phases.pluginUi, performance.now() - uiStartedAt);
      const controlCount = platform.contributions.reduce((total, contribution) => total + contribution.controls.controls.length, 0);
      elements.decisionsButton.textContent = controlCount ? `Controls (${controlCount})` : 'Evidence';
      renderPluginSummary(pluginPlayback?.snapshot().phase || 'ready');
      const renderer = getRenderer();
      if (!renderer) return;
      await yieldToFrame();
      if (disposed || renderGeneration !== pluginRenderGeneration || renderer !== getRenderer()) return;
      const selected = renderer.cameraState?.()?.focusId || 'route';
      const semanticPresentations = platform.contributions.map((contribution) => ({
        pluginId: contribution.pluginId,
        presentation: contribution.presentation,
      }));
      const platformTime = Math.max(0, ...platform.contributions.map((contribution) => contribution.state?.simulationTimeMs || 0));
      const rendererStartedAt = performance.now();
      renderer.setPluginPresentations(semanticPresentations, {
        simulationTimeMs: platformTime,
        selectedIds: [selected],
        provenanceReceipts: platform.provenanceReceipts,
      });
      recordRenderWork(renderWork.phases.renderer, performance.now() - rendererStartedAt);
      if (!hasAppliedInitialCamera) hasAppliedInitialCamera = experienceCameraApi.applyInitialCamera({
        configuration: getCameraMode() ? { ...profile.camera, initialMode: getCameraMode() } : profile.camera,
        renderer,
        onModeSelected: selectCamera,
      });
      if (!pluginClock) pluginClock = simulationClockApi.createClock({
        timeline: platform.timeline,
        wallIntervalMs: profile.interaction?.stepDelayMs || 450,
      });
      const clockState = pluginClock.snapshot();
      const timelineReceipt = platform.timeline.receipt();
      if (clockState.timelineId !== timelineReceipt.id
        || clockState.eventCount !== timelineReceipt.eventCount
        || (clockState.state !== 'playing' && clockState.currentMs !== platformTime)) {
        pluginClock.useTimeline(platform.timeline, { atMs: platformTime });
      }
      if (interaction.mode === 'playback' && !pluginPlayback) {
        if (!pluginPlaybackApi?.createController) throw new Error('Plugin playback dependency is unavailable');
        const ownerPluginId = profile.interaction?.simulationOwnerPluginId || extensions.activePluginIds[0];
        pluginPlayback = pluginPlaybackApi.createController({
          runtime: extensions,
          ownerPluginId,
          scenario: getScenario(),
          clock: pluginClock,
          getControlValues: pluginUi.values,
          setControlValues: pluginUi.setValues,
          render: () => renderPluginExperience({ mission: null }),
          onPhase,
          onSettled: (receipt) => {
            hostRoot.__simulattePluginRunReceipt = receipt;
            hostRoot.__simulatteComparisonExecutionReceipts = Object.freeze(
              receipt.comparisonExecutionReceipts
                || (receipt.comparisonExecutionReceipt ? [receipt.comparisonExecutionReceipt] : [])
            );
            const persisted = pluginPlaybackApi.saveStoredReceipt(
              playbackStorage,
              profile.id,
              receipt
            );
            if (!persisted) log.warn('plugin.playback.persistence.skipped', {
              profileId: profile.id,
              reason: 'browser_storage_unavailable',
            });
          },
          onError,
        });
        onPlayback(pluginPlayback);
      }
      if (!pluginViewRuntime) {
        pluginViewRuntime = pluginViewRuntimeApi.createCoordinator({
          renderer,
          onModeSelected: selectViewMode,
        });
        onViewRuntime(pluginViewRuntime);
      }
      const viewStartedAt = performance.now();
      const viewReceipt = pluginViewRuntime.sync(platform.contributions, platform.provenanceReceipts);
      recordRenderWork(renderWork.phases.viewRuntime, performance.now() - viewStartedAt);
      hostRoot.__simulattePluginPlatformV4 = Object.freeze({
        receipt: platform.receipt,
        contributions: platform.contributions,
        contributionSources: platform.contributionSources,
        provenance: platform.provenanceCoverage,
        clock: pluginClock.receipt(),
        view: viewReceipt,
        compositor: renderer.receipt().pluginCompositor,
      });
      recordRenderWork(renderWork.phases.total, performance.now() - renderStartedAt);
      hostRoot.__simulatteAppRenderReceipt = () => renderWorkReceipt(renderWork);
    }
    function renderPluginSummary(runState) {
      renderExperienceSummary(elements, summarize({
        profileId: profile.id,
        profile: profile,
        profileLabel: elements.applicationProfileLabel.textContent,
        scenario: getScenario(),
        contributions: lastPluginContributions,
        runState,
        playback: pluginPlayback?.snapshot() || null,
        comparisonReceipts: hostRoot.__simulatteComparisonExecutionReceipts || [],
      }));
    }


    function dispose() {
      disposed = true;
      pluginRenderGeneration += 1;
      pluginClock?.pause();
    }
    return Object.freeze({ render: renderPluginExperience, summary: renderPluginSummary, dispose });
  }
  return Object.freeze({ create });
});
