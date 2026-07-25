(function attachSimulatteMainView(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteMainView = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSimulatteMainView(root) {
  function collectElements() {
    const ids = [
      'mission-field', 'scenario-field', 'scenario-label', 'scenario-description', 'scenario-seed', 'mission-input', 'mission-error', 'place-resolution-lane', 'place-lane-note', 'model-selection-controls', 'shuffle-button', 'shuffle-label', 'start-button', 'start-label', 'pause-button', 'resume-button', 'step-button', 'reset-button', 'replay-button', 'new-mission-button', 'what-if-button', 'export-button',
      'dock-more-button', 'dock-more-menu',
      'runtime-status', 'runtime-toggle', 'runtime-details', 'runtime-details-close', 'application-profile', 'application-profile-control', 'application-profile-trigger', 'application-profile-label', 'application-profile-options', 'render-identity', 'autonomy-canvas', 'follow-minimap', 'decision-title', 'decision-meta',
      'world-tier-control', 'world-tier-trigger', 'world-tier-label', 'world-tier-options', 'overlay-canvas', 'world-tiers-landing-page',
      'bet-list', 'gate-list', 'trace-list', 'route-formula', 'route-stats', 'route-components',
      'retrieval-query', 'retrieval-candidates', 'rerank-candidates', 'retrieval-stats', 'settlement-math',
      'reranker-proof', 'place-resolution-proof',
      'occurrence-stats', 'occurrence-patterns', 'occurrence-effects',
      'metric-state', 'metric-tick', 'metric-time', 'metric-speed', 'metric-distance', 'metric-route', 'metric-bet', 'journey-progress-fill', 'journey-hud',
      'metric-settlement', 'metric-calibration', 'camera-focus', 'camera-focus-button', 'camera-focus-popover', 'camera-follow', 'camera-bird', 'camera-top',
      'planning-forecast', 'alternative-proof', 'ledger-proof', 'policy-arena-proof',
      'export-ledger-button', 'import-receipt-button', 'import-receipt-file',
      'decisions-button', 'decisions-drawer', 'decisions-close', 'decisions-backdrop', 'journey-section',
      'plugin-inspector', 'plugin-map-ui', 'plugin-hud-ui',
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
  });
});
