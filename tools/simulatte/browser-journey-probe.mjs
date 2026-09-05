function browserJourneyExpression(expectedRunCameraMode = 'follow', expectsPluginPlayback = false) {
  return `(async () => {
    const configuredRunMode = ${JSON.stringify(expectedRunCameraMode)};
    const pluginPlayback = ${Boolean(expectsPluginPlayback)};
    const runtimeFailure = () => {
      const status = document.getElementById('runtime-status');
      if (status?.dataset.kind !== 'error') return null;
      const event = [...(globalThis.__simulatteAutonomyRuntimeEvents || [])]
        .reverse()
        .find((row) => row.event === 'runtime.failed');
      return event?.details?.message || status.textContent || 'unknown runtime error';
    };
    const waitFor = async (predicate, label, limit = 60000) => {
      const started = performance.now();
      while (!predicate()) {
        const status = document.getElementById('runtime-status');
        const failure = runtimeFailure();
        if (failure) throw new Error('autonomy browser runtime.failed at ' + label + ': ' + failure
          + '; url=' + (globalThis.location ? globalThis.location.pathname + globalThis.location.search : 'unavailable')
          + '; events=' + (globalThis.__simulatteAutonomyRuntimeEvents || []).slice(-8).map((row) => row.event).join(','));
        if (performance.now() - started > limit) {
          const state = document.getElementById('metric-state');
          throw new Error('autonomy browser timeout at ' + label +
            '; runtime=' + (status && status.dataset.kind) + ':' + (status && status.textContent) +
            '; state=' + (state && state.textContent) +
            '; playback=' + (document.getElementById('playback-progress')?.textContent || 'missing') +
            ':' + (document.getElementById('playback-event')?.textContent || 'missing') +
            '; resume=' + (document.getElementById('resume-button')?.hidden ? 'hidden' : 'visible') +
            ':' + (document.getElementById('resume-button')?.disabled ? 'disabled' : 'enabled') +
            '; camera=' + (document.getElementById('autonomy-canvas')?.dataset.cameraMode || 'missing') +
            ':' + (document.getElementById('autonomy-canvas')?.dataset.cameraFocus || 'missing'));
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    };
    await waitFor(() => document.getElementById('runtime-status').dataset.kind === 'ready', 'runtime-ready');
    const viewportRect = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
    const rectFor = (id) => {
      const element = document.getElementById(id);
      const rect = element.getBoundingClientRect();
      return { id, hidden: element.hidden, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const interactionMode = document.body.dataset.interactionMode || 'prompt';
    const cameraModeIds = ['camera-follow', 'camera-pov', 'camera-bird', 'camera-top', 'camera-free', 'camera-compare'];
    const initialRects = ['runtime-toggle', 'application-profile-trigger', ...cameraModeIds, 'mission-input', 'scenario-field', 'shuffle-button', 'start-button', 'place-resolution-lane', 'decisions-button', 'experience-doc-link'].map(rectFor);
    const primaryFieldId = interactionMode === 'prompt' ? 'mission-input' : 'scenario-field';
    const initialLayout = {
      viewport: viewportRect,
      rects: initialRects,
      allWithinViewport: initialRects.every((rect) => rect.hidden || (rect.left >= -0.5 && rect.top >= -0.5 && rect.right <= viewportRect.width + 0.5 && rect.bottom <= viewportRect.height + 0.5)),
      primaryControlsVisible: [primaryFieldId, 'shuffle-button', 'start-button'].every((id) => {
        const rect = initialRects.find((row) => row.id === id);
        const minimum = 40;
        return rect && !rect.hidden && rect.width >= minimum && rect.height >= minimum;
      }),
    };
    const rafIntervals = [];
    const longTasks = [];
    const phaseMarks = [{ phase: 'sampling_started', at: performance.now() }];
    const markPhase = (phase) => {
      phaseMarks.push({ phase, at: performance.now() });
      console.log('SIMULATTE_BROWSER_PHASE', phase);
    };
    let lastRafTimestamp = null;
    let sampleRaf = true;
    const sampleFrame = (timestamp) => {
      if (lastRafTimestamp !== null) rafIntervals.push(timestamp - lastRafTimestamp);
      lastRafTimestamp = timestamp;
      if (sampleRaf) requestAnimationFrame(sampleFrame);
    };
    requestAnimationFrame(sampleFrame);
    const longTaskObserver = typeof PerformanceObserver === 'function'
      ? new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push({ startTime: entry.startTime, duration: entry.duration });
      })
      : null;
    try { longTaskObserver?.observe({ type: 'longtask', buffered: true }); } catch { /* Long Tasks API is optional. */ }
    const canvas = document.getElementById('autonomy-canvas');
    const minimap = document.getElementById('follow-minimap');
    const initialCamera = {
      mode: canvas.dataset.cameraMode,
      focus: canvas.dataset.cameraFocus,
      decision: globalThis.__simulattePluginPlatformV4?.view?.state?.decision || null,
    };
    const cameraExperiences = {
      available: cameraModeIds
        .map((id) => document.getElementById(id))
        .filter((button) => button && !button.hidden)
        .map((button) => button.id.replace(/^camera-/, '').replace(/^bird$/, 'overview')),
      selected: cameraModeIds
        .map((id) => document.getElementById(id))
        .find((button) => button?.getAttribute('aria-pressed') === 'true')?.id.replace(/^camera-/, '').replace(/^bird$/, 'overview') || null,
      focusControlAbsent: !document.getElementById('camera-focus-button')
        && !document.getElementById('camera-focus-popover')
        && !document.getElementById('camera-focus'),
    };
    const applicationProfile = document.getElementById('application-profile');
    const applicationProfileTrigger = document.getElementById('application-profile-trigger');
    const applicationProfileOptions = document.getElementById('application-profile-options');
    const missionInput = document.getElementById('mission-input');
    const scenarioSeed = document.getElementById('scenario-seed');
    const shuffleButton = document.getElementById('shuffle-button');
    const startButton = document.getElementById('start-button');
    applicationProfileTrigger.click();
    const selectedProfileOption = applicationProfileOptions.querySelector('[role="option"][aria-selected="true"]');
    const customProfileSelect = {
      enabled: !applicationProfileTrigger.disabled,
      opened: applicationProfileTrigger.getAttribute('aria-expanded') === 'true' && !applicationProfileOptions.hidden,
      groupLabels: Array.from(applicationProfileOptions.querySelectorAll('.select-group-label'), (row) => row.textContent.trim()),
      optionCount: applicationProfileOptions.querySelectorAll('[role="option"]').length,
      selectedLabel: selectedProfileOption?.textContent.trim() || '',
    };
    selectedProfileOption?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    customProfileSelect.escapeClosed = applicationProfileTrigger.getAttribute('aria-expanded') === 'false'
      && applicationProfileOptions.hidden
      && document.activeElement === applicationProfileTrigger;
    const originalMission = missionInput.value;
    const originalSeed = scenarioSeed.textContent;
    const initialRouteUrl = location.href;
    markPhase('scenario_shuffle_started');
    shuffleButton.click();
    markPhase('scenario_shuffle_dispatched');
    await waitFor(() => missionInput.value !== originalMission || scenarioSeed.textContent !== originalSeed, 'scenario-shuffled');
    await waitFor(() => (
      document.getElementById('runtime-status').textContent.trim() === 'Ready'
      && !shuffleButton.disabled
      && !startButton.disabled
    ), 'scenario-reload-ready');
    markPhase('scenario_shuffle_complete');
    const shuffledMission = missionInput.value;
    const shuffledSeed = scenarioSeed.textContent;
    const shuffledRouteUrl = location.href;
    const initialRoute = new URL(initialRouteUrl);
    const shuffledRoute = new URL(shuffledRouteUrl);
    const shuffle = {
      changed: shuffledMission.length > 0 && (shuffledMission !== originalMission || shuffledSeed !== originalSeed),
      seedChanged: shuffledSeed !== originalSeed,
      interactionMode,
      originalMission,
      shuffledMission,
      originalSeed,
      shuffledSeed,
      startLabel: startButton.textContent.trim(),
    };
    const urlState = {
      initialUrl: initialRouteUrl,
      shuffledUrl: shuffledRouteUrl,
      initialScenario: initialRoute.searchParams.get('scenario'),
      shuffledScenario: shuffledRoute.searchParams.get('scenario'),
      initialSeed: initialRoute.searchParams.get('seed'),
      shuffledSeed: shuffledRoute.searchParams.get('seed'),
      scenarioChanged: initialRoute.searchParams.get('scenario') !== shuffledRoute.searchParams.get('scenario'),
      hasTypedParameters: [...initialRoute.searchParams.keys()].some((key) => key.startsWith('param.')),
    };
    const visibleCopy = document.body.innerText;
    const createLink = document.querySelector('.sim-product-nav [data-local-href="./blank/"]');
    const experienceDocLink = document.getElementById('experience-doc-link');
    const experienceDocRect = experienceDocLink?.getBoundingClientRect();
    const missionDock = document.querySelector('.mission-dock');
    const missionDockRect = missionDock?.getBoundingClientRect();
    const intersects = (left, right) => Boolean(
      left && right
      && left.width > 0
      && left.height > 0
      && right.width > 0
      && right.height > 0
      && left.left < right.right
      && left.right > right.left
      && left.top < right.bottom
      && left.bottom > right.top
    );
    const expectedExperienceDocUrl = globalThis.SimulatteWorldTiersBoot?.experienceDocUrl(applicationProfile.value);
    const copy = {
      removedLabelsAbsent: !visibleCopy.includes('Mission compiler')
        && !visibleCopy.includes('Natural language to grounded obligations')
        && !visibleCopy.includes('Every autonomous choice, exposed and settled.')
        && !visibleCopy.includes('observe, retrieve, choose, settle')
        && !visibleCopy.includes('3 regions | 2026-07-13'),
      createLink: {
        href: createLink?.getAttribute('href') || null,
        label: createLink?.textContent.trim() || null,
        insideProductNavigation: Boolean(createLink?.closest('.sim-product-nav')),
      },
      experienceDocLink: {
        href: experienceDocLink?.href || null,
        label: experienceDocLink?.textContent.trim() || null,
        target: experienceDocLink?.target || null,
        rel: experienceDocLink?.rel || '',
        visible: Boolean(
          experienceDocLink
          && !experienceDocLink.hidden
          && getComputedStyle(experienceDocLink).display !== 'none'
          && experienceDocRect?.width > 0
          && experienceDocRect?.height > 0
        ),
        matchesActiveProfile: Boolean(
          expectedExperienceDocUrl
          && experienceDocLink?.href === expectedExperienceDocUrl
        ),
        withinViewport: Boolean(
          experienceDocRect
          && experienceDocRect.left >= -0.5
          && experienceDocRect.top >= -0.5
          && experienceDocRect.right <= viewportRect.width + 0.5
          && experienceDocRect.bottom <= viewportRect.height + 0.5
        ),
        rect: experienceDocRect ? {
          left: experienceDocRect.left,
          top: experienceDocRect.top,
          right: experienceDocRect.right,
          bottom: experienceDocRect.bottom,
        } : null,
        missionDockRect: missionDockRect ? {
          left: missionDockRect.left,
          top: missionDockRect.top,
          right: missionDockRect.right,
          bottom: missionDockRect.bottom,
        } : null,
        insideMissionDock: experienceDocLink?.parentElement === missionDock,
        overlapsMissionContent: [...(missionDock?.children || [])]
          .filter((element) => element !== experienceDocLink && !element.hidden)
          .some((element) => intersects(experienceDocRect, element.getBoundingClientRect())),
      },
    };
    const sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
    const vector = (value) => String(value || '').split(',').map(Number);
    const vectorDistance = (left, right) => Math.hypot(...left.map((value, index) => value - right[index]));
    const cameraEye = () => vector(canvas.dataset.cameraEye);
    const cameraTarget = () => vector(canvas.dataset.cameraTarget);
    const waitForCamera = (label) => waitFor(() => canvas.dataset.cameraTransition === 'settled', label, 5000);
    const probeMode = async (mode) => {
      const expectedMode = mode === 'bird' ? 'overview' : mode;
      console.log('SIMULATTE_BROWSER_PHASE', 'camera-' + mode + '-before');
      await waitForCamera('camera-' + mode + '-ready');
      const before = cameraEye();
      document.getElementById('camera-' + mode).click();
      console.log('SIMULATTE_BROWSER_PHASE', 'camera-' + mode + '-clicked');
      const immediate = cameraEye();
      const began = canvas.dataset.cameraMode === expectedMode && canvas.dataset.cameraTransition === 'active';
      const noSnap = vectorDistance(before, immediate) < 1;
      await sleep(260);
      const middle = cameraEye();
      const progress = Number(canvas.dataset.cameraTransitionProgress);
      const progressed = canvas.dataset.cameraTransition === 'active'
        && progress > 0
        && progress < 1
        && vectorDistance(before, middle) > 1;
      await waitForCamera('camera-' + mode + '-settled');
      console.log('SIMULATTE_BROWSER_PHASE', 'camera-' + mode + '-settled');
      const after = cameraEye();
      return {
        mode,
        began,
        noSnap,
        progressed,
        settled: canvas.dataset.cameraMode === expectedMode && canvas.dataset.cameraTransition === 'settled',
        moved: vectorDistance(before, after) > 2,
      };
    };
    const modeProbes = [];
    if (initialCamera.mode === 'top') {
      document.getElementById('camera-bird').click();
      await waitForCamera('camera-probe-reset');
    }
    if (cameraExperiences.available.includes('top')) modeProbes.push(await probeMode('top'));
    if (cameraExperiences.available.includes('follow')) modeProbes.push(await probeMode('follow'));
    const followZoomBefore = Number(canvas.dataset.cameraFollowDistance);
    if (cameraExperiences.available.includes('follow')) canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -240 }));
    await sleep(260);
    const followZoomAfter = Number(canvas.dataset.cameraFollowDistance);
    const followZoomWorked = !cameraExperiences.available.includes('follow') || (canvas.dataset.cameraInteraction === 'zoom'
      && Number.isFinite(followZoomBefore)
      && Number.isFinite(followZoomAfter)
      && followZoomAfter < followZoomBefore);
    if (cameraExperiences.available.includes('overview')) modeProbes.push(await probeMode('bird'));
    markPhase('camera_modes_complete');

    const originalSetPointerCapture = canvas.setPointerCapture;
    canvas.setPointerCapture = () => {};
    const pointer = (type, pointerId, x, y, options = {}) => canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      pointerId,
      clientX: x,
      clientY: y,
      button: options.button || 0,
      buttons: type === 'pointerup' ? 0 : 1,
      shiftKey: Boolean(options.shiftKey),
    }));
    const panBefore = cameraTarget();
    pointer('pointerdown', 41, 180, 220, { shiftKey: true });
    pointer('pointermove', 41, 215, 240, { shiftKey: true });
    pointer('pointerup', 41, 215, 240, { shiftKey: true });
    await sleep(260);
    const panWorked = canvas.dataset.cameraInteraction === 'pan'
      && canvas.dataset.cameraFocus === 'custom'
      && vectorDistance(panBefore, cameraTarget()) > 1;
    const orbitBefore = cameraEye();
    pointer('pointerdown', 42, 180, 220);
    pointer('pointermove', 42, 225, 238);
    pointer('pointerup', 42, 225, 238);
    await sleep(260);
    const orbitWorked = canvas.dataset.cameraInteraction === 'orbit'
      && vectorDistance(orbitBefore, cameraEye()) > 1;
    const zoomBefore = vectorDistance(cameraEye(), cameraTarget());
    canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -240 }));
    await sleep(260);
    const zoomWorked = vectorDistance(cameraEye(), cameraTarget()) < zoomBefore - 1;
    canvas.setPointerCapture = originalSetPointerCapture;

    markPhase('camera_interactions_complete');
    if (!pluginPlayback) {
      missionInput.value = 'run in circles around union squatre park parimeter until youve ran 5000 feet';
      missionInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const editInvalidatedController = pluginPlayback || (document.getElementById('export-button').disabled
      && document.getElementById('runtime-status').dataset.kind === 'changed');
    markPhase('mission_edited');
    startButton.click();
    markPhase('start_clicked');
    const missionLockedDuringRun = missionInput.disabled;
    await waitFor(() => canvas.dataset.cameraMode === configuredRunMode
      && (configuredRunMode !== 'follow' || (canvas.dataset.followMinimap === 'visible'
        && !minimap.hidden
        && Number(minimap.dataset.frameCount || 0) > 0)), 'start-configured-camera', 5000);
    const startedInConfiguredMode = canvas.dataset.cameraMode === configuredRunMode;
    const minimapReceipt = {
      visible: canvas.dataset.followMinimap === 'visible' && !minimap.hidden,
      projection: minimap.dataset.projection,
      radiusM: Number(minimap.dataset.radiusM),
      frameCount: Number(minimap.dataset.frameCount || 0),
    };
    markPhase('configured_camera_ready');
    if (pluginPlayback) {
      const timeline = document.getElementById('playback-timeline');
      const pauseButton = document.getElementById('pause-button');
      const resumeButton = document.getElementById('resume-button');
      await waitFor(() => Number(timeline.max || 0) > 0 && !pauseButton.hidden, 'plugin-playback-ready');
      markPhase('plugin_playback_ready');
      pauseButton.click();
      timeline.value = timeline.max;
      timeline.dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor(() => (
        document.body.dataset.journeyPhase === 'paused'
        && Number(timeline.value) === Number(timeline.max)
        && document.getElementById('runtime-status').textContent.startsWith('End preview')
      ), 'plugin-playback-terminal-preview');
      markPhase('plugin_playback_terminal_preview');
      resumeButton.click();
      markPhase('plugin_playback_resume_clicked');
    }
    await waitFor(() => pluginPlayback
      ? ['completed', 'failed'].includes(document.body.dataset.journeyPhase)
      : ['completed', 'failed'].includes(document.getElementById('metric-state').textContent), 'journey-terminal');
    markPhase('journey_terminal');
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    sampleRaf = false;
    longTaskObserver?.disconnect();
    const sortedFrameIntervals = [...rafIntervals].sort((left, right) => left - right);
    const sampledLongTasks = longTasks.filter((row) => row.startTime >= phaseMarks[0].at);
    const percentile = (fraction) => sortedFrameIntervals[Math.min(sortedFrameIntervals.length - 1, Math.max(0, Math.ceil(sortedFrameIntervals.length * fraction) - 1))] || null;
    const roundMetric = (value) => Number.isFinite(value) ? Number(value.toFixed(4)) : null;
    const frameDistribution = {
      min: roundMetric(sortedFrameIntervals[0]),
      p50: roundMetric(percentile(0.5)),
      p95: roundMetric(percentile(0.95)),
      p99: roundMetric(percentile(0.99)),
      max: roundMetric(sortedFrameIntervals.at(-1)),
      mean: roundMetric(rafIntervals.reduce((sum, value) => sum + value, 0) / Math.max(1, rafIntervals.length)),
    };
    const runtimeEvents = window.__simulatteAutonomyRuntimeEvents || [];
    const runtimeEventNames = runtimeEvents.map((row) => row.event);
    const manifestEvent = runtimeEvents.find((row) => row.event === 'data.manifest.received');
    const retrievalEvent = runtimeEvents.find((row) => row.event === 'retrieval.lane.executed');
    const requiredRuntimeEvents = [
      'app.boot.started',
      'data.load.started',
      'data.manifest.received',
      'data.manifest.validated',
      'data.load.ready',
      'renderer.ready',
      ...(pluginPlayback
        ? ['plugin.playback.started', 'plugin.playback.terminal']
        : ['mission.compiled', 'journey.started', 'retrieval.lane.executed', 'journey.terminal']),
    ];
    return {
      runtime: document.getElementById('runtime-status').textContent,
      initialLayout,
      applicationProfile: {
        enabled: !applicationProfile.disabled,
        selectedId: applicationProfile.value,
        optionIds: Array.from(applicationProfile.options, (option) => option.value),
        custom: customProfileSelect,
      },
      state: pluginPlayback ? document.body.dataset.journeyPhase : document.getElementById('metric-state').textContent,
      tick: Number(document.getElementById('metric-tick').textContent),
      distance: document.getElementById('metric-distance').textContent,
      decision: document.getElementById('metric-bet').textContent,
      settlement: document.getElementById('metric-settlement').textContent,
      calibration: document.getElementById('metric-calibration').textContent,
      traceRows: document.querySelectorAll('.trace-row').length,
      betRows: document.querySelectorAll('.bet-row').length,
      selectedRows: document.querySelectorAll('.bet-row.is-selected').length,
      rejectedRows: document.querySelectorAll('.bet-row.is-rejected').length,
      gateRows: document.querySelectorAll('.gate-row').length,
      retrievalRows: document.querySelectorAll('#retrieval-candidates > span').length,
      rerankRows: document.querySelectorAll('#rerank-candidates > span').length,
      occurrenceRows: document.querySelectorAll('#occurrence-patterns > span').length,
      retrievalLaneLabel: document.getElementById('retrieval-stats').textContent,
      rerankerProof: document.getElementById('reranker-proof').textContent,
      runtimeLog: {
        eventCount: runtimeEvents.length,
        eventNames: runtimeEventNames,
        failures: runtimeEvents
          .filter((row) => row.level === 'error')
          .map((row) => ({ event: row.event, details: row.details })),
        requiredEventsPresent: requiredRuntimeEvents.every((event) => runtimeEventNames.includes(event)),
        manifestMissionExampleCount: manifestEvent?.details?.missionExampleCount ?? null,
        manifestCacheMode: manifestEvent?.details?.response?.cacheMode ?? null,
        embeddingExecuted: retrievalEvent?.details?.modelExecution?.embedding?.executed ?? null,
        neuralRerankerExecuted: retrievalEvent?.details?.modelExecution?.neuralReranker?.executed ?? null,
        failureCount: runtimeEvents.filter((row) => row.level === 'error').length,
      },
      shuffle,
      urlState,
      copy,
      camera: {
        experiences: cameraExperiences,
        modeProbes,
        panWorked,
        orbitWorked,
        zoomWorked,
        followZoomWorked,
        followZoomBefore,
        followZoomAfter,
        initial: initialCamera,
        configuredRunMode,
        startedInConfiguredMode,
        minimap: minimapReceipt,
      },
      editInvalidatedController,
      missionLockedDuringRun,
      pluginPlayback: globalThis.__simulattePluginRunReceipt || null,
      rendererBackend: document.getElementById('autonomy-canvas').dataset.rendererBackend || null,
      actorMeshSchema: document.getElementById('autonomy-canvas').dataset.actorMeshSchema || null,
      actorMeshKinds: document.getElementById('autonomy-canvas').dataset.actorMeshKinds || null,
      materialModel: document.getElementById('autonomy-canvas').dataset.materialModel || null,
      ambientActorCount: Number(document.getElementById('autonomy-canvas').dataset.ambientActorCount || 0),
      ambientActorKinds: document.getElementById('autonomy-canvas').dataset.ambientActorKinds || null,
      adapterName: document.getElementById('autonomy-canvas').dataset.adapterName || null,
      rendererFrames: Number(document.getElementById('autonomy-canvas').dataset.frameCount || 0),
      rendererReceipt: document.getElementById('autonomy-canvas').__simulatteRenderReceipt?.() || null,
      appRenderReceipt: globalThis.__simulatteAppRenderReceipt?.() || null,
      smoothness: {
        rafFrameCount: rafIntervals.length,
        frameIntervalMs: frameDistribution,
        over20msCount: rafIntervals.filter((value) => value > 20).length,
        over33msCount: rafIntervals.filter((value) => value > 33.34).length,
        over33msRatio: roundMetric(rafIntervals.filter((value) => value > 33.34).length / Math.max(1, rafIntervals.length)),
        longTaskCount: sampledLongTasks.length,
        longTaskTotalMs: roundMetric(sampledLongTasks.reduce((sum, row) => sum + row.duration, 0)),
        longestTaskMs: roundMetric(Math.max(0, ...sampledLongTasks.map((row) => row.duration))),
        phaseMarks,
        longTasks: sampledLongTasks.map((row) => ({
          startTime: roundMetric(row.startTime),
          duration: roundMetric(row.duration),
          phase: [...phaseMarks].reverse().find((mark) => mark.at <= row.startTime)?.phase || 'before_sampling',
        })),
      },
      staticVertexCount: Number(document.getElementById('autonomy-canvas').dataset.staticVertexCount || 0),
      dynamicVertexCount: Number(document.getElementById('autonomy-canvas').dataset.dynamicVertexCount || 0),
      canvasWidth: document.getElementById('autonomy-canvas').width,
      canvasHeight: document.getElementById('autonomy-canvas').height,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      scrollY: window.scrollY,
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth
    };
  })()`;
}

function consentFlowExpression() {
  return `(async () => {
    const runtimeFailure = () => {
      const status = document.getElementById('runtime-status');
      if (status?.dataset.kind !== 'error') return null;
      const event = [...(globalThis.__simulatteAutonomyRuntimeEvents || [])]
        .reverse()
        .find((row) => row.event === 'runtime.failed');
      return event?.details?.message || status.textContent || 'unknown runtime error';
    };
    const waitFor = async (predicate, label, limit = 60000) => {
      const started = performance.now();
      while (!predicate()) {
        const failure = runtimeFailure();
        if (failure) throw new Error('autonomy browser runtime.failed at ' + label + ': ' + failure);
        if (performance.now() - started > limit) throw new Error('autonomy browser timeout at ' + label);
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    };
    const toggle = document.getElementById('place-resolution-lane');
    const dialog = document.getElementById('neural-model-dialog');
    await waitFor(() => toggle && toggle.getAttribute('aria-checked') === 'false', 'consent-ready');
    toggle.click();
    await waitFor(() => dialog.open, 'consent-open');
    const disclosed = {
      title: dialog.querySelector('h2').textContent.trim(),
      embedding: dialog.querySelector('[data-neural-model="embedding-size"]').textContent.trim(),
      rerankerRowAbsent: !dialog.querySelector('[data-neural-model="reranker-size"]'),
      total: dialog.querySelector('[data-neural-model="download-summary"]').textContent.trim(),
      use: dialog.querySelector('[data-neural-model="surface-use"]').textContent.trim(),
    };
    dialog.querySelector('[data-neural-consent="cancel"]').click();
    await waitFor(() => !dialog.open && !toggle.checked, 'consent-cancel');
    toggle.click();
    await waitFor(() => dialog.open, 'consent-reopen');
    dialog.querySelector('[data-neural-consent="accept"]').click();
    await waitFor(() => !dialog.open && toggle.checked, 'consent-accept');
    const grantRemembered = Boolean(localStorage.getItem('simulatte.neuralModels.consent.v1'));
    toggle.click();
    await waitFor(() => !toggle.checked, 'consent-revoke');
    return {
      disclosed,
      grantRemembered,
      revoked: !localStorage.getItem('simulatte.neuralModels.consent.v1'),
      finalEnabled: toggle.checked,
    };
  })()`;
}


export { browserJourneyExpression, consentFlowExpression };
