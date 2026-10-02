(function attachCityPluginSession(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCityPluginSession = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCityPluginSessionModule() {
  function create({ hostRoot, extensions, pluginUi, elements, profile, interaction, playbackStorage, createPluginRuntime,
    experienceCameraApi, simulationClockApi, pluginPlaybackApi, pluginViewRuntimeApi, log,
    recordRenderWork, renderWorkReceipt, renderExperienceSummary, summarize, yieldToFrame,
    getScenario, getCameraMode, getRenderer, selectCamera, selectViewMode, applyRouteParameters,
    onPhase, onPlayback, onViewRuntime, onParametersApplied, onError }) {
    let disposed = false, inspector = null, inspectorInsets = {}, inspectorViewport = null;
    const applyInspectorInsets = () => getRenderer()?.setViewportInsets?.(inspectorInsets);
    const owner = profile.interaction?.simulationOwnerPluginId || extensions.activePluginIds[0];
    const status = hostRoot.SimulatteSimulationSessionStatus.create({host: elements.runtimeStatus?.parentElement || elements.startButton.parentElement});
    const session = hostRoot.SimulatteSimulationSession.create({ id: profile.id,
      capabilities: { selection: true, camera: true, pause: true, restart: true, replay: 'model-receipt', liveActions: false },
      onChange: snapshot => status.render(snapshot),
      operations: [
        ...['start','pause','resume','step','replay'].map(id => ({id,serial:!['pause','resume'].includes(id),category:id==='replay'?'reproduction':'execution',perform:async(_,operation)=>{const result=await pluginPlayback[id]();operation.throwIfCancelled();await renderPluginExperience({mission:null});return result;}})),
        {id:'restart',serial:true,category:'reproduction',perform:async(_,operation)=>{await pluginPlayback.reset(getScenario());operation.throwIfCancelled();const result=await pluginPlayback.start();operation.throwIfCancelled();await renderPluginExperience({mission:null});return result;}},
        {id:'seek',serial:true,category:'reproduction',perform:value=>pluginPlayback.seek(value)},
        {id:'speed',category:'execution',perform:value=>pluginPlayback.setPlaybackRate(value)},
        {id:'select-object',category:'observation',perform:id=>inspector.select(id)},
        {id:'focus-object',category:'observation',perform:id=>{
          applyInspectorInsets();
          const targetId=`plugin:${owner}:${id}`;
          pluginViewRuntime?.setManualOverride({mode:'top',targetIds:[targetId]});
          getRenderer().focusCameraTarget(targetId);
          getRenderer().setCameraMode('top');selectCamera('top');
        }},
        {id:'camera',category:'observation',perform:mode=>{
          applyInspectorInsets();
          const renderer=getRenderer();
          const target=hostRoot.SimulatteCityInterface.preferredCameraTarget(renderer.cameraTargets(),mode);
          pluginViewRuntime?.setManualOverride({mode,targetIds:target?[target.id]:[]});
          if(target)renderer.focusCameraTarget(target.id);
          renderer.setCameraMode(mode);selectCamera(mode);
        }},
        {id:'reset-view',category:'observation',perform:()=>{applyInspectorInsets();pluginViewRuntime?.setManualOverride({mode:profile.camera.initialMode||profile.experience.defaultView,targetIds:[]});return experienceCameraApi.applyInitialCamera({configuration:profile.camera,renderer:getRenderer(),onModeSelected:selectCamera});}},
        {id:'object-preview',category:'observation',perform:async(input,operation)=>{
          const action=inspector.action(input.targetId,input.actionId);
          const result=await extensions.dispatchAction(owner,action.command,{scenario:getScenario(),values:action.values});
          operation.throwIfCancelled();return result;
        }},
        {id:'object-apply',serial:true,category:'scenario',requiresRestart:true,perform:async(input,operation)=>{
          const action=input.prepared || inspector.action(input.targetId,input.actionId);
          if(action.prepared)await pluginPlayback.applyPrepared(action);else await pluginPlayback.applyControls(action.values);
          operation.throwIfCancelled();await pluginPlayback.start();operation.throwIfCancelled();
          await renderPluginExperience({mission:null});await onParametersApplied?.();
        }},
        {id:'object-live',serial:true,category:'live',perform:async input=>{
          const action=inspector.action(input.targetId,input.actionId);return pluginPlayback.intervene(action.command,action.values);
        }},
        {id:'apply-controls',serial:true,category:'scenario',requiresRestart:true,perform:async(values,operation)=>{
          await pluginPlayback.applyControls(values);operation.throwIfCancelled();const result=await pluginPlayback.start();operation.throwIfCancelled();await renderPluginExperience({mission:null});operation.throwIfCancelled();await onParametersApplied?.();return result;
        }},
        {id:'preview-controls',category:'observation',perform:async(values,operation)=>{
          const preview=await createPluginRuntime();
          try {
            operation.throwIfCancelled();
            const result=await preview.dispatchAction(owner,'scenario.run',{scenario:getScenario(),values:{...values,phase:'start'}});
            operation.throwIfCancelled();
            if(result.status==='refused')throw new Error(result.reason);
            return structuredClone(preview.platformV4({mission:null}).contributions.find(row=>row.pluginId===owner));
          }finally{await preview.dispose();}
        }},
      ],
    });
    session.update({preparation:'preparing'});
    hostRoot.SimulatteActiveSession=session;
    const commands=Object.freeze({snapshot:()=>pluginPlayback.snapshot(),
      ...Object.fromEntries(['start','pause','resume','step','replay'].map(id=>[id,()=>session.invoke(id)])),
      reset:()=>session.invoke('restart'), seek:value=>session.invoke('seek',value), setPlaybackRate:value=>session.invoke('speed',value),
    });
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
    let rendering = false, pendingRender = null;
    function renderPluginExperience(context) {
      const promise = new Promise((resolve, reject) => {
        pendingRender ||= { context, waiters: [] };
        pendingRender.context = context;
        pendingRender.waiters.push({ resolve, reject });
      });
      if (!rendering) void drainRenders();
      return promise;
    }
    async function drainRenders() {
      rendering = true;
      while (pendingRender) {
        const batch = pendingRender; pendingRender = null;
        try {
          await renderPluginExperienceNow(batch.context);
          batch.waiters.forEach(waiter => waiter.resolve());
        } catch (error) { batch.waiters.forEach(waiter => waiter.reject(error)); }
      }
      rendering = false;
    }
    async function renderPluginExperienceNow(context) {
      if (disposed) return;
      const renderGeneration = ++pluginRenderGeneration;
      await yieldToFrame();
      if (disposed || renderGeneration !== pluginRenderGeneration) return;
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
      if(profile.id==='sun-walker-v1') {
        if(!inspector)inspector=hostRoot.SimulatteObjectInteraction.create({host:elements.autonomyCanvas.parentElement,canvas:elements.autonomyCanvas,
          getSession:()=>session,onPreviewChange:()=>renderPluginExperience({mission:null}),projectObjects:()=>getRenderer()?.projectObjects?.()||[],
          onInsets:panel=>{
            const rect=elements.autonomyCanvas.getBoundingClientRect(),viewport=`${rect.width}:${rect.height}`;
            inspectorInsets=hostRoot.SimulatteCameraFit.measureInsets(rect,[{edge:'bottom',rect:panel.getBoundingClientRect()}]);
            // Opening selection preserves framing; orientation and explicit Focus use the new usable area.
            if(inspectorViewport!==viewport){inspectorViewport=viewport;applyInspectorInsets();}
          }});
        inspector.update(platform.contributions.find(row=>row.pluginId===owner));
      }

      const uiStartedAt = performance.now();
      pluginUi.render(extensions.views(pluginContext), platform.contributions);
      if (applyRouteParameters()) pluginUi.render(extensions.views(pluginContext), platform.contributions);
      recordRenderWork(renderWork.phases.pluginUi, performance.now() - uiStartedAt);
      const controlCount = platform.contributions.reduce((total, contribution) => total + contribution.controls.controls.length, 0);
      elements.decisionsButton.textContent = 'Advanced';
      renderPluginSummary(pluginPlayback?.snapshot().phase || 'ready');
      const renderer = getRenderer();
      if (!renderer) return;
      await yieldToFrame();
      if (disposed || renderGeneration !== pluginRenderGeneration || renderer !== getRenderer()) return;
      const selected = renderer.cameraState?.()?.focusId || 'route';
      const semanticPresentations = platform.contributions.map((contribution) => ({
        pluginId: contribution.pluginId,
        presentation: contribution.pluginId===owner ? inspector?.presentation() || contribution.presentation : contribution.presentation,
      }));
      const platformTime = Math.max(0, ...platform.contributions.map((contribution) => contribution.state?.simulationTimeMs || 0));
      const rendererStartedAt = performance.now();
      renderer.session.setScene({ presentations: semanticPresentations,
        simulationTimeMs: platformTime,
        selectedIds: [selected],
        provenanceReceipts: inspector?.provenanceReceipts(platform.provenanceReceipts) || platform.provenanceReceipts,
      });
      session.update({preparation:'ready',rendering:'ready'});
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
          onPhase:(phase,snapshot)=>{session.update({execution:phase==='completed'?'complete':['running','paused','failed'].includes(phase)?phase:'idle'});onPhase(phase,snapshot);},
          onSettled: (receipt) => {
            hostRoot.__simulattePluginRunReceipt = receipt;
            hostRoot.__simulatteComparisonExecutionReceipts = Object.freeze(
              receipt.comparisonExecutionReceipts
                || (receipt.comparisonExecutionReceipt ? [receipt.comparisonExecutionReceipt] : [])
            );
            renderPluginSummary('settled');
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
        // The selected profile/URL owns the initial view, not the next plugin intent.
        pluginViewRuntime.setManualOverride({ mode: getCameraMode() || profile.experience.defaultView, targetIds: [] });
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
      inspector?.dispose();session.dispose();status.dispose();
      if(hostRoot.SimulatteActiveSession===session)hostRoot.SimulatteActiveSession=null;
    }
    return Object.freeze({ failRendering:()=>session.update({rendering:'failed'}), invoke:session.invoke, commands:()=>pluginPlayback?commands:null, render: renderPluginExperience, summary: renderPluginSummary, appliedParameters: () => Object.fromEntries(lastPluginContributions.map(row => [row.pluginId, Object.fromEntries(row.controls.controls.map(control => [control.id, structuredClone(control.value)]))])), dispose });
  }
  return Object.freeze({ create });
});
