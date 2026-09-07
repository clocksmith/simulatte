import contracts from '../public/blank/pipeline/simulatte-phase-contracts.js';

// This observer checks retained application executions; it does not run or repair phases.
export async function validateCreatePageExecutions(receipt) {
  if (receipt.schema !== 'simulatte.worldSpecEditorBrowserAudit.v3') return;
  const expected = {
    compiled: receipt.before.contentHash,
    edited: receipt.after.contentHash,
    imported: receipt.exchange.importedContentHash,
    reconciled: receipt.reconciliation.receipt.resultWorldSpecContentHash,
  };
  const records = receipt.pipelineExecutions;
  if (!records || Object.keys(records).sort().join(',') !== Object.keys(expected).sort().join(',')) {
    throw new Error('Create page evidence must retain every execution boundary');
  }
  for (const [name, worldSpecHash] of Object.entries(expected)) {
    const record = contracts.immutableArtifact(records[name]);
    if (record.schema !== 'simulatte.createPageExecution.v1' || record.status !== 'completed' ||
        record.error !== null || record.worldSpecContentHash !== worldSpecHash ||
        record.producer.buildDigest !== receipt.runtimeSourceDigest || !Number.isSafeInteger(record.revision)) {
      throw new Error(`${name}: application execution identity mismatch`);
    }
    const lengths = name === 'reconciled' ? [6, 8] : [8];
    if (record.attempts.length !== lengths.length) throw new Error(`${name}: unexpected execution attempts`);
    for (let attemptIndex = 0; attemptIndex < lengths.length; attemptIndex++) {
      const attempt = record.attempts[attemptIndex];
      let previous = contracts.createRequestEnvelope(attempt.request);
      const expectedMode = name === 'compiled' || (name === 'reconciled' && attemptIndex === 0) ? 'prompt' : 'authored';
      if (attempt.outputs.length !== lengths[attemptIndex] || attempt.sourceMode !== expectedMode ||
          previous.request.text !== receipt.prompt ||
          attempt.status !== (lengths[attemptIndex] === 8 ? 'completed' : 'awaiting-reconciliation')) {
        throw new Error(`${name}: incomplete or misidentified processing phases`);
      }
      if (attemptIndex > 0 && attempt.request.retryPolicy?.previousPhase6Digest !==
          await contracts.artifactDigest(record.attempts[attemptIndex - 1].outputs[5])) {
        throw new Error(`${name}: authored restart lost its preceding attempt`);
      }
      for (let index = 0; index < attempt.outputs.length; index++) {
        const output = attempt.outputs[index];
        if (output.phase !== index + 1) throw new Error(`${name}: phase order mismatch`);
        const invocation = output.phase === 7 ? output.artifact.renderExecution.frameInvocation : {};
        await contracts.validateBoundOutput(output, { previous, invocation }, {
          revision: attempt.outputs[0].binding.revision,
          producer: { ...record.producer, requestRevision: record.revision },
          dependencies: output.binding.dependencies,
        });
        if (output.phase === 7 && (output.artifact.renderExecution.worldProofBinding.worldSpec.contentHash !== worldSpecHash ||
            output.artifact.renderExecution.rendered !== true)) {
          throw new Error(`${name}: renderer did not execute the exact accepted world`);
        }
        previous = output;
      }
    }
  }
  if (!(records.compiled.revision < records.edited.revision && records.edited.revision < records.imported.revision &&
      records.imported.revision < records.reconciled.revision)) throw new Error('Create executions reused or reversed application revisions');
}
