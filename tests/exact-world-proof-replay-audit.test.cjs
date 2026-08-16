const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const moduleUrl = pathToFileURL(path.resolve(__dirname, '../tools/exact-world-proof-replay-audit.mjs'));

function receipt() {
  return {
    schema: 'simulatte.exactWorldProofReplayAudit.v1',
    prompt: 'a ball beside a box',
    worldSpec: {
      schema: 'simulatte.worldSpec.v1',
      contentHash: 'fnv1a32:12345678',
      prompt: 'a ball beside a box',
    },
    worldProof: {
      verdict: 'pass',
      contentHash: 'fnv1a32:87654321',
      worldSpecContentHash: 'fnv1a32:12345678',
      classStatuses: {
        intent: 'pass', semantic: 'pass', compilation: 'pass', simulation: 'pass',
        interaction: 'pass', safety: 'pass', visual: 'pass', replay: 'pass',
      },
    },
    controlExecution: { required: true, executed: true },
    compilerDeterminism: {
      status: 'pass', baselineContentHash: 'compile-a', recompiledContentHash: 'compile-a',
    },
    simulationReproducibility: {
      status: 'pass', baselineStateHash: 'state-a', replayStateHash: 'state-a',
    },
    beforeRenderInputSerial: 4,
    afterRenderInputSerial: 5,
  };
}

test('exact WorldProof replay validator binds the canonical program, proof, control, and replay', async () => {
  const audit = await import(moduleUrl);
  const valid = receipt();
  assert.equal(audit.validateExactWorldProofReplayReceipt(valid, valid.prompt), valid);

  for (const mutate of [
    (copy) => { copy.worldSpec.prompt = 'another prompt'; },
    (copy) => { copy.worldProof.worldSpecContentHash = 'fnv1a32:aaaaaaaa'; },
    (copy) => { copy.worldProof.classStatuses.interaction = 'not-proven'; },
    (copy) => { copy.controlExecution.executed = false; },
    (copy) => { copy.compilerDeterminism.recompiledContentHash = 'compile-b'; },
    (copy) => { copy.simulationReproducibility.replayStateHash = 'state-b'; },
    (copy) => { copy.afterRenderInputSerial = copy.beforeRenderInputSerial; },
  ]) {
    const changed = structuredClone(valid);
    mutate(changed);
    assert.throws(
      () => audit.validateExactWorldProofReplayReceipt(changed, valid.prompt),
      /Exact WorldProof replay failed/,
    );
  }
});

test('exact replay browser expressions retain explicit prompt and control bindings', async () => {
  const audit = await import(moduleUrl);
  assert.match(audit.replayStateExpression('a ball'), /a ball/);
  assert.match(audit.controlExecutionExpression('a ball'), /PointerEvent/);
  assert.match(audit.controlResultExpression('a ball', 7), /interactionStatus/);
  assert.match(audit.replayResultExpression('a ball', 8), /afterRenderInputSerial/);
});
