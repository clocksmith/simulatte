export function replayDownstream(context) {
  const result = context.artifact.quality === 'good'
    ? { verdict: 'pass', lane: 'reference', settled: ['critical:entity'] }
    : { verdict: 'fail', lane: 'reference', missing: ['critical:entity'] };
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
