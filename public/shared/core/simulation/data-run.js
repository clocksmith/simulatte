(function attachDataRun(root, factory) {
  const common = typeof module === 'object' && module.exports;
  const api = factory(
    common ? require('../../contracts/world-spec.js') : root.SimulatteWorldSpec,
    common ? require('../../contracts/data-world-spec.js') : root.SimulatteDataWorldSpec,
    common ? require('../../contracts/input-source.js') : root.SimulatteInputSource,
    common ? require('./point-motion.js') : root.SimulattePointMotion,
    common ? require('../pipeline-runner.js') : root.SimulattePipelineRunner
  );
  if (common) module.exports = api;
  root.SimulatteDataRun = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createDataRun(world, contract, input, motion, pipelines) {
  if (!world || !contract || !input || !motion || !pipelines) throw new Error('data_run_dependency_missing');
  const hash = (value) => input.sha256(new TextEncoder().encode(world.canonicalJson(value)));
  function create(options = {}) {
    const runner = pipelines.create(options);
    async function run(spec) {
      const snapshot = JSON.parse(world.serializeWorldSpec(spec));
      const stages = [
        { id: 'validate', run: (value) => contract.validate(value), validate: contract.validate },
        { id: 'simulate', run: (value, context) => motion.run(value, context), validate(value) {
          if (value.schema !== 'simulatte.pointMotionRun.v1' || value.programHash !== snapshot.contentHash || value.frames.length !== snapshot.params.steps + 1) throw new Error('data_run_output_invalid');
        } },
        { id: 'inspect', async run(value) {
          return { ...value, receipt: { schema: 'simulatte.dataRunReceipt.v1', programHash: snapshot.contentHash,
            programSha256: await hash(snapshot), outputSha256: await hash(value.frames),
            sourceSha256: snapshot.source.compilerConfig.input.sha256, adapter: contract.KIND,
            frameCount: value.frames.length, pointCount: snapshot.objects.length,
            simulation: 'constant-velocity-2d', scientificValidation: 'not-performed', visualRecognition: 'not-reviewed' } };
        }, validate(value) { if (!/^[a-f0-9]{64}$/.test(value.receipt?.outputSha256 || '')) throw new Error('data_run_receipt_invalid'); } },
      ];
      return (await runner.run(snapshot, stages)).output;
    }
    return Object.freeze({ run, cancel: runner.cancel, dispose: runner.dispose });
  }
  function compare(left, right) {
    const before = new Map(left.frames.at(-1).points.map((point) => [point.id, point]));
    let added = 0, changed = 0;
    right.frames.at(-1).points.forEach((point) => {
      const previous = before.get(point.id);
      if (!previous) added += 1;
      else if (previous.x !== point.x || previous.y !== point.y || previous.label !== point.label) changed += 1;
      before.delete(point.id);
    });
    return { schema: 'simulatte.dataRunComparison.v1', before: left.receipt, after: right.receipt,
      sameProgram: left.receipt.programSha256 === right.receipt.programSha256,
      sameOutput: left.receipt.outputSha256 === right.receipt.outputSha256,
      added, removed: before.size, changed };
  }
  return Object.freeze({ create, compare });
});
