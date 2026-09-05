(function attachPointMotion(root, factory) {
  const contract = typeof module === 'object' && module.exports ? require('../../contracts/data-world-spec.js') : root.SimulatteDataWorldSpec;
  const api = factory(contract);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePointMotion = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPointMotion(contract) {
  if (!contract) throw new Error('point_motion_contract_missing');
  function frame(spec, step) {
    if (!Number.isInteger(step) || step < 0 || step > spec.params.steps) throw new Error('point_motion_step_invalid');
    const time = step * spec.params.duration / spec.params.steps;
    return { schema: 'simulatte.pointScene.v1', programHash: spec.contentHash, step, time, units: spec.params.units,
      points: spec.objects.map((row) => ({ id: row.id, label: row.label, x: row.x + row.vx * time, y: row.y + row.vy * time })) };
  }
  async function run(spec, { signal, onStep = () => {}, yieldTask = () => new Promise((resolve) => setTimeout(resolve, 0)) } = {}) {
    contract.validate(spec);
    const frames = [];
    for (let step = 0; step <= spec.params.steps; step += 1) {
      if (signal?.aborted) { const error = new Error('Point simulation cancelled'); error.code = 'pipeline_cancelled'; throw error; }
      frames.push(frame(spec, step));
      if (step % 20 === 0) { onStep(step, spec.params.steps); await yieldTask(); }
    }
    return { schema: 'simulatte.pointMotionRun.v1', programHash: spec.contentHash, frames };
  }
  return Object.freeze({ frame, run });
});
