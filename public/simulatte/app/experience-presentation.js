(function attachExperiencePresentation(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteExperiencePresentation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createExperiencePresentation() {
  const MEASURE_LABELS = Object.freeze({
    'compute-efficiency': 'Productive compute share',
    'executed-compute-tflops': 'Compute (PFLOP/s)',
    'facility-power-kw': 'Facility power (est.)',
    'direct-sun-share': 'Sun so far',
    'shade-share': 'Shade so far',
    'progress': 'Progress',
    'modeled-unserved-load': 'Unmet demand',
    'current-minimum-reserve-margin': 'Reserve margin',
    'storage-state-of-charge': 'Stored energy',
    'delivered-service': 'Service delivered',
    'dropped-demand': 'Service lost',
    'maximum-utilization': 'Busiest cable',
    'total-delta-v': 'Transfer delta-v',
    'time-of-flight': 'Flight time',
    'solution-count': 'Feasible transfers',
    'packet-distance': 'Distance traveled',
    'bottleneck-rate': 'Link capacity',
    'latency': 'Delivery delay',
    'cluster-tflops': 'Compute throughput',
    'model-flops-utilization': 'Compute utilization',
    'allreduce-latency-ms': 'Communication time',
    'peak-gpu-temp-c': 'Peak GPU temperature',
    'cooling-pue': 'Facility / IT power',
  });
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
    const latestEvent = latestStateEvent(primary);
    const stage = experience.stages.find((row) => row.id === latestEvent?.kind?.split('.').at(-1))
      || stageAt(experience.stages, progress);
    const stats = selectedMeasures(measures, experience.primaryMeasureKinds, primary?.pluginId);
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
      measurementContext: measures.find(row => row.measurement)?.measurement.context || 'Modeled results at the current simulation time.',
      statDefinitions: Object.fromEntries(measures.filter(row => row.measurement).map(row => [row.measurement.label, measurementDefinition(row)])),
    });
  }

  function measurementDefinition(row) {
    const m = row.measurement;
    return `${m.subject}. ${m.definition} ${m.timeBasis}: ${m.interval.start}–${m.interval.end} ${m.interval.unit}. ${m.validity}; ${m.freshness}. Unit: ${row.unit}.`;
  }

  function selectedMeasures(measures, kinds, pluginId) {
    const byKind = new Map(measures.map((measure) => [measure.kind, measure]));
    return Object.fromEntries([...new Set(kinds)].flatMap((kind) => {
      const measure = byKind.get(kind);
      return measure ? [[(measure.measurement?.label || MEASURE_LABELS[kind]) || humanize(kind), formatMeasure(measure)]] : [];
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
    if (measure.measurement?.validity === 'not-sampled') return 'Not sampled';
    if (measure.measurement?.validity === 'unavailable') return 'Unavailable';
    const value = Number(measure.value);
    if (Number.isFinite(value) && ['ratio', 'probability', 'fraction'].includes(String(measure.unit).toLowerCase())) {
      return `${(value * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })}%${measure.measurement?.detail ? ' / ' + measure.measurement.detail : ''}`;
    }
    const formatted = !Number.isFinite(value)
      ? String(measure.value)
      : value !== 0 && Math.abs(value) < 0.001
        ? value.toExponential(2)
        : value.toLocaleString('en-US', { maximumFractionDigits: 3 });
    if (measure.kind === 'executed-compute-tflops') return (value / 1000).toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (measure.kind === 'compute-efficiency') return `${value.toFixed(2)}%`;
    if (measure.unit === 'multiple') return `${formatted}×`;
    if (measure.unit === 'percent') return `${formatted}%`;
    if (measure.unit === 'C') return `${formatted} °C`;
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
