(function attachSimulatteMainView(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteMainView = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSimulatteMainView(root) {
  const ANALYSIS_PROFILES = new Set(['safety-explorer-v1']);
  const SOLVER_PROFILES = new Set(['orbital-transfer-planner-v1']);

  function collectElements() {
    const ids = [
      'mission-field', 'scenario-field', 'scenario-label', 'scenario-description', 'scenario-seed', 'mission-input', 'mission-error', 'place-resolution-lane', 'place-lane-note', 'model-selection-controls', 'shuffle-button', 'shuffle-label', 'start-button', 'start-label', 'pause-button', 'resume-button', 'step-button', 'reset-button', 'replay-button', 'new-mission-button', 'what-if-button', 'export-button', 'playback-speed-control', 'playback-speed', 'playback-timeline-control', 'playback-timeline', 'playback-progress',
      'dock-more-button', 'dock-more-menu',
      'runtime-status', 'runtime-toggle', 'runtime-details', 'runtime-details-close', 'runtime-context-label', 'runtime-context-legend', 'runtime-context-hint', 'runtime-data-copy', 'application-profile', 'application-profile-control', 'application-profile-trigger', 'application-profile-label', 'application-profile-options', 'render-identity', 'autonomy-canvas', 'follow-minimap', 'decision-title', 'decision-meta',
      'world-tier-control', 'world-tier-trigger', 'world-tier-label', 'world-tier-options', 'overlay-canvas', 'world-tiers-landing-page',
      'bet-list', 'gate-list', 'trace-list', 'route-formula', 'route-stats', 'route-components',
      'retrieval-query', 'retrieval-candidates', 'rerank-candidates', 'retrieval-stats', 'settlement-math',
      'reranker-proof', 'place-resolution-proof',
      'occurrence-stats', 'occurrence-patterns', 'occurrence-effects',
      'metric-state', 'metric-tick', 'metric-time', 'metric-speed', 'metric-distance', 'metric-route', 'metric-bet', 'journey-progress-fill', 'journey-hud',
      'metric-settlement', 'metric-calibration', 'camera-controls', 'camera-focus', 'camera-focus-button', 'camera-focus-popover', 'camera-follow', 'camera-bird', 'camera-top',
      'experience-summary', 'experience-summary-state', 'experience-summary-title', 'experience-summary-description', 'experience-summary-stats', 'experience-summary-help',
      'planning-forecast', 'alternative-proof', 'ledger-proof', 'policy-arena-proof',
      'export-ledger-button', 'import-receipt-button', 'import-receipt-file',
      'decisions-button', 'decisions-drawer', 'decisions-close', 'decisions-backdrop', 'journey-section', 'decision-section', 'advanced-section', 'model-selection-panel',
      'plugin-inspector', 'plugin-map-ui',
    ];
    const elements = Object.fromEntries(ids.map((id) => [camelId(id), root.document.getElementById(id)]));
    const missing = ids.filter((id) => !root.document.getElementById(id));
    if (missing.length) throw new Error(`Autonomy UI expected elements: ${missing.join(', ')}`);
    return elements;
  }

  function populateApplicationProfiles(select, manifest, selectedId) {
    const references = [manifest.applicationProfile, ...(manifest.applicationProfiles || [])];
    root.SimulatteWorldTiersBoot.populateProfileSelect(select, references, selectedId);
    select.disabled = false;
  }

  function applicationProfileLabel(id) {
    return root.SimulatteWorldTiersBoot.labelForProfile(id);
  }

  function camelId(id) {
    return id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  function setRuntimeStatus(elements, text, kind) {
    if (elements.runtimeStatus.textContent !== text) elements.runtimeStatus.textContent = text;
    if (elements.runtimeStatus.dataset.kind !== kind) elements.runtimeStatus.dataset.kind = kind;
    if (elements.runtimeToggle.title !== text) elements.runtimeToggle.title = text;
  }

  function runtimeLabel(state) {
    if (state.status === 'completed') return state.taskType === 'delivery' ? 'Delivered' : 'Complete';
    if (state.status === 'failed') return 'Stopped';
    return 'Running';
  }

  function renderIdentity(receipt) {
    const adapter = receipt.adapter.description || receipt.adapter.device || receipt.adapter.architecture || 'adapter';
    return `${adapter} | ${receipt.buildingCount} buildings | ${receipt.ambientTraffic.actorCount} moving actors | ${receipt.staticVertexCount.toLocaleString()} static vertices`;
  }

  function renderPlaceResolution(elements, mission, readiness, evidence) {
    if (!mission.placeResolution) {
      const defaultCorrect = evidence?.lanes?.challenger?.metrics?.correct || 0;
      const modelCorrect = evidence?.lanes?.modelCandidate?.metrics?.correct || 0;
      elements.placeResolutionProof.textContent = `Deterministic place matching ${defaultCorrect}/${evidence?.population?.probeCount || 0} · Qwen +${Math.max(0, modelCorrect - defaultCorrect)} · ${readiness?.state || 'idle'}`;
      return;
    }
    const roles = mission.placeResolution.roles.map((row) => {
      const lane = row.evidence?.lane === 'qwen_embedding_cosine' ? 'Qwen embedding' : 'extended typo';
      const label = row.evidence?.ranking?.[0]?.label || row.nodeId;
      return `${row.role}: ${label} via ${lane}`;
    });
    elements.placeResolutionProof.textContent = `${roles.join(' · ')} · model executed: ${mission.placeResolution.modelExecution ? 'yes' : 'no'}`;
  }

  function renderPlanning(elements, planning) {
    const forecast = planning.forecast;
    elements.planningForecast.textContent = `${Math.round(forecast.predictedDurationSeconds)} s · ${Math.round(forecast.distanceM).toLocaleString()} m`;
    elements.alternativeProof.dataset.pluginAuditCount = String(Object.keys(planning.pluginAudits || {}).length);
    elements.alternativeProof.dataset.routeAlgorithm = planning.alternatives?.[0]?.algorithm || '';
    elements.alternativeProof.textContent = planning.alternatives.length > 1
      ? `${planning.alternatives.length} compared · ${(planning.alternatives[1].forecast.predictedDurationSeconds - forecast.predictedDurationSeconds).toFixed(1)} s next`
      : 'No distinct legal alternative';
  }

  function renderPlayback(elements, phase, snapshot) {
    const isProgressive = snapshot.totalSteps > 1;
    const currentStep = Math.min(snapshot.currentStep, snapshot.totalSteps);
    elements.playbackSpeedControl.hidden = !isProgressive;
    elements.playbackTimelineControl.hidden = !isProgressive;
    elements.playbackTimeline.max = String(snapshot.totalSteps);
    elements.playbackTimeline.value = String(currentStep);
    elements.playbackProgress.textContent = `${currentStep} / ${snapshot.totalSteps}`;
    elements.playbackSpeed.value = String(snapshot.clock.playbackRate);
    if (isProgressive) {
      elements.dockMoreButton.hidden = !['running', 'paused', 'completed'].includes(phase);
    } else if (phase === 'completed') {
      elements.startButton.hidden = false;
      elements.replayButton.hidden = true;
      elements.newMissionButton.hidden = true;
      elements.dockMoreButton.hidden = true;
    }
    if (phase === 'completed') return 'Complete';
    if (snapshot.terminalPreview) return `End preview · Resume or step to settle`;
    if (phase === 'paused') return `Paused at ${snapshot.currentStep} of ${snapshot.totalSteps}`;
    if (phase === 'running') return `Running ${snapshot.currentStep} of ${snapshot.totalSteps}`;
    return 'Ready';
  }

  function configureExperienceShell(elements, {
    interactionMode,
    profileId,
    tier = 'city',
  }) {
    const isExperiment = interactionMode === 'playback' || interactionMode === 'simulation';
    const experienceKind = ANALYSIS_PROFILES.has(profileId)
      ? 'analysis'
      : SOLVER_PROFILES.has(profileId) ? 'solver' : isExperiment ? 'simulation' : 'journey';
    root.document.body.dataset.experienceShell = isExperiment ? 'experiment' : 'journey';
    root.document.body.dataset.experienceId = profileId || '';
    root.document.body.dataset.experienceKind = experienceKind;
    elements.journeyHud.hidden = isExperiment;
    elements.journeySection.hidden = isExperiment;
    elements.decisionSection.hidden = isExperiment;
    elements.advancedSection.hidden = isExperiment;
    elements.modelSelectionPanel.hidden = isExperiment;
    elements.experienceSummary.hidden = !isExperiment;
    elements.cameraControls.hidden = false;
    const governedTier = tier !== 'city';
    elements.cameraFollow.hidden = governedTier;
    elements.cameraFollow.textContent = 'Follow';
    elements.cameraBird.textContent = 'Overview';
    elements.cameraTop.textContent = governedTier ? 'Free' : 'Top';
    elements.decisionTitle.textContent = isExperiment ? 'Experiment' : 'Decision details';
    elements.decisionMeta.textContent = experienceKind === 'analysis'
      ? 'Adjust evidence parameters, analyze the corridor, then inspect source rows.'
      : experienceKind === 'solver'
        ? 'Adjust solver parameters, solve the transfer, then inspect verification evidence.'
        : isExperiment
          ? 'Set parameters, run the experiment, then inspect its evidence.'
      : 'Inspect the active journey and its evidence.';
    const playMark = elements.startButton.querySelector?.('.play-mark');
    if (playMark) playMark.hidden = experienceKind === 'analysis' || experienceKind === 'solver';
    elements.runtimeContextLabel.textContent = isExperiment ? 'Experience view' : 'Map';
    elements.runtimeContextLegend.hidden = isExperiment;
    elements.runtimeContextHint.textContent = viewHint(tier);
    replaceRuntimeCopy(elements.runtimeDataCopy, isExperiment ? [
      'The selected experience controls which governed data, modeled assumptions, and semantic layers are loaded.',
      'Open Controls for exact parameters and evidence. Open Experience docs for the data and simulation boundary.',
    ] : [
      'NYC bike routes, park properties, building footprints, and OpenStreetMap street context.',
      'Park circuits follow property boundaries, not surveyed sidewalks. Traffic, signals, risk, and outcomes are simulated.',
    ]);
    return Object.freeze({ isExperiment, experienceKind, tier, profileId: profileId || null });
  }

  function renderExperienceSummary(elements, summary) {
    if (!summary) {
      elements.experienceSummary.hidden = true;
      return;
    }
    elements.experienceSummary.hidden = false;
    elements.experienceSummary.dataset.experienceId = summary.experienceId;
    elements.experienceSummaryState.textContent = stateLabel(summary.description);
    elements.experienceSummaryTitle.textContent = summary.title;
    elements.experienceSummaryDescription.textContent = summary.description;
    const documentRef = elements.experienceSummary.ownerDocument;
    const rows = Object.entries(summary.stats || {}).map(([label, value]) => {
      const row = documentRef.createElement('div');
      const term = documentRef.createElement('dt');
      const description = documentRef.createElement('dd');
      term.textContent = label;
      description.textContent = String(value);
      row.append(term, description);
      return row;
    });
    elements.experienceSummaryStats.replaceChildren(...rows);
    elements.experienceSummaryHelp.textContent = summary.help || '';
  }

  function replaceRuntimeCopy(container, paragraphs) {
    const documentRef = container.ownerDocument;
    container.replaceChildren(...paragraphs.map((text) => {
      const paragraph = documentRef.createElement('p');
      paragraph.textContent = text;
      return paragraph;
    }));
  }

  function viewHint(tier) {
    if (tier === 'city') return 'Drag to orbit. Shift-drag or use Top to pan. Scroll to zoom.';
    if (tier === 'star-chart') return 'Drag to orbit the star field. Scroll to zoom. Use Focus to frame evidence.';
    return 'Drag to pan. Scroll to zoom. Use Focus to frame evidence.';
  }

  function stateLabel(description) {
    const parts = String(description || '').split(' · ');
    return parts.at(-1) || 'Ready';
  }

  return Object.freeze({
    collectElements,
    populateApplicationProfiles,
    applicationProfileLabel,
    camelId,
    setRuntimeStatus,
    runtimeLabel,
    renderIdentity,
    renderPlaceResolution,
    renderPlanning,
    renderPlayback,
    configureExperienceShell,
    renderExperienceSummary,
  });
});
