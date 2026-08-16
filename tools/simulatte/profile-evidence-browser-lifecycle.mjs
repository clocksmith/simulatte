const PROGRESSIVE_LIFECYCLE = Object.freeze(['pause', 'step', 'resume']);

function progressiveLifecycleProbeSource(interactionPath) {
  const required = PROGRESSIVE_LIFECYCLE.filter((step) => interactionPath.includes(step));
  if (!required.length) return '';
  if (required.length !== PROGRESSIVE_LIFECYCLE.length) {
    throw new Error(`profile_evidence_progressive_lifecycle_incomplete: ${required.join(',')}`);
  }
  return `
    const pause = document.getElementById('pause-button');
    await waitFor(
      () => pause && !pause.hidden && !pause.disabled,
      'pause-control-ready',
      5000
    );
    pause.click();
    await waitFor(
      () => document.body.dataset.journeyPhase === 'paused',
      'pause-applied',
      5000
    );
    lifecycle.push('pause');
    markPerformance('pause');

    const step = document.getElementById('step-button');
    await waitFor(
      () => step && !step.hidden && !step.disabled,
      'step-control-ready',
      5000
    );
    const previousStepStatus = document.getElementById('runtime-status')?.textContent || '';
    const previousEmittedCount = Number(globalThis.__simulattePluginPlatformV4?.clock?.emittedCount || 0);
    const previousClockCursor = Number(globalThis.__simulattePluginPlatformV4?.clock?.state?.cursor || 0);
    const previousTierStepCount = Number(globalThis.__simulatteTierRunState?.stepCount || 0);
    step.click();
    await waitFor(
      () => document.body.dataset.journeyPhase === 'completed'
        || Number(globalThis.__simulattePluginPlatformV4?.clock?.emittedCount || 0) > previousEmittedCount
        || Number(globalThis.__simulattePluginPlatformV4?.clock?.state?.cursor || 0) > previousClockCursor
        || Number(globalThis.__simulatteTierRunState?.stepCount || 0) > previousTierStepCount
        || (document.getElementById('runtime-status')?.textContent || '') !== previousStepStatus,
      'step-completed',
      10000
    );
    lifecycle.push('step');
    markPerformance('step');

    const resume = document.getElementById('resume-button');
    await waitFor(
      () => resume && !resume.hidden && !resume.disabled,
      'resume-control-ready',
      5000
    );
    resume.click();
    await waitFor(
      () => ['running', 'completed'].includes(document.body.dataset.journeyPhase),
      'resume-applied',
      5000
    );
    lifecycle.push('resume');
    markPerformance('resume');
  `;
}

export { progressiveLifecycleProbeSource };
