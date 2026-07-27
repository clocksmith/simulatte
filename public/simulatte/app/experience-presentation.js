(function attachExperiencePresentation(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteExperiencePresentation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createExperiencePresentation() {
  function summarize({
    profile,
    profileLabel,
    scenario,
    contributions = [],
    runState = 'ready',
    playback = null,
    comparisonReceipts = [],
  }) {
    const experience = profile?.experience;
    if (!experience) return null;
    const primary = contributions.find((row) => row.pluginId === profile.interaction?.simulationOwnerPluginId)
      || contributions[0]
      || null;
    const measures = primary?.state?.measures || [];
    const progress = playbackProgress(playback, measures);
    const stage = stageAt(experience.stages, progress);
    const latestEvent = latestStateEvent(primary);
    const exposesResults = !['idle', 'ready'].includes(runState);
    const stats = exposesResults
      ? selectedMeasures(measures, experience.primaryMeasureKinds)
      : { Controls: contributions.reduce((total, row) => total + (row.controls?.controls?.length || 0), 0) };
    return Object.freeze({
      experienceId: profile.id,
      kind: experience.kind,
      title: profileLabel || labelForId(profile.id),
      state: stateLabel(runState),
      description: scenario?.label || 'Configured scenario',
      event: latestEvent ? humanize(latestEvent.kind) : stage.label,
      narrative: stage.narrative,
      stageLabel: stage.label,
      timelineLabel: experience.timelineLabel,
      progress,
      comparison: comparisonStatus(experience.comparisonMode, runState, comparisonReceipts),
      stats: Object.freeze(stats),
    });
  }

  function selectedMeasures(measures, kinds) {
    const byKind = new Map(measures.map((measure) => [measure.kind, measure]));
    return Object.fromEntries(kinds.flatMap((kind) => {
      const measure = byKind.get(kind);
      return measure ? [[humanize(kind), formatMeasure(measure)]] : [];
    }));
  }

  function playbackProgress(playback, measures) {
    const currentStep = Number(playback?.currentStep);
    const totalSteps = Number(playback?.totalSteps);
    if (Number.isFinite(currentStep) && Number.isFinite(totalSteps) && totalSteps > 0) {
      return clamp(currentStep / totalSteps, 0, 1);
    }
    const progress = measures.find((measure) => measure.kind === 'progress');
    return progress && Number.isFinite(Number(progress.value))
      ? clamp(Number(progress.value), 0, 1)
      : 0;
  }

  function stageAt(stages, progress) {
    return stages.reduce(
      (active, stage) => stage.fromProgress <= progress ? stage : active,
      stages[0],
    );
  }

  function latestStateEvent(contribution) {
    const eventIds = contribution?.state?.eventIds || [];
    if (!eventIds.length) return null;
    const byId = new Map((contribution.events || []).map((event) => [event.id, event]));
    for (let index = eventIds.length - 1; index >= 0; index -= 1) {
      const event = byId.get(eventIds[index]);
      if (event) return event;
    }
    return null;
  }

  function comparisonStatus(mode, runState, receipts) {
    if (mode === 'none') return null;
    const settled = receipts.filter((receipt) => receipt?.schema === 'simulatte.comparisonExecutionReceipt.v4').length;
    if (settled) return `${settled} synchronized comparison${settled === 1 ? '' : 's'} settled`;
    if (runState === 'completed' || runState === 'settled') return 'Comparison evidence unavailable';
    if (runState === 'running' || runState === 'paused') return 'Comparison settles after both branches complete';
    return mode === 'sensitivity'
      ? 'Parameter sensitivity uses the same observations'
      : 'Baseline and intervention share starting evidence';
  }

  function formatMeasure(measure) {
    const value = Number(measure.value);
    if (Number.isFinite(value) && ['ratio', 'probability', 'fraction'].includes(String(measure.unit).toLowerCase())) {
      return `${(value * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
    }
    const formatted = !Number.isFinite(value)
      ? String(measure.value)
      : value !== 0 && Math.abs(value) < 0.001
        ? value.toExponential(2)
        : value.toLocaleString('en-US', { maximumFractionDigits: 3 });
    return measure.unit ? `${formatted} ${measure.unit}` : formatted;
  }

  function stateLabel(value) {
    const labels = {
      completed: 'Complete',
      failed: 'Stopped',
      idle: 'Ready',
      paused: 'Paused',
      ready: 'Ready',
      running: 'Running',
      settled: 'Complete',
    };
    return labels[value] || humanize(value);
  }

  function labelForId(value) {
    return humanize(String(value || '').replace(/-v\d+$/, ''));
  }

  function humanize(value) {
    const leaf = String(value || '').split('.').at(-1);
    return leaf
      .split(/[-_]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  return Object.freeze({
    formatMeasure,
    humanize,
    playbackProgress,
    stageAt,
    summarize,
  });
});
