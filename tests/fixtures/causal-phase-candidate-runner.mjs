export function replayDownstream(context) {
  const result = context.artifact.quality === 'good'
    ? { verdict: 'pass', lane: 'candidate', settled: ['critical:entity'] }
    : { verdict: 'fail', lane: 'candidate', missing: ['critical:entity'] };
  return { ...result, execution: executionReceipt(context) };
}

function executionReceipt(context) {
  return {
    schema: 'simulatte.downstreamReplayExecution.v1',
    inputArtifactHash: context.inputArtifactHash,
    startedAfterPhase: context.phase,
    executedPhaseIds: context.requiredPhaseIds,
    completedThroughPhase: 8,
  };
}
