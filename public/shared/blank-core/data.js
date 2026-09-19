import createAuthorship from './factories/world-spec-authorship.js';
import createWorld from './factories/world-spec.js';
import createDataContract from './factories/data-world-spec.js';
import createInputSource from './factories/input-source.js';
import createMotion from './factories/point-motion.js';
import createDataRun from './factories/data-run.js';
import createPipelineAdapter from './factories/pipeline-adapter.js';
import { createRuntime } from './index.js';

const world = createWorld(createAuthorship());
const contract = createDataContract(world);
const inputs = createInputSource(world);
const runs = createDataRun(world, contract, inputs, createMotion(contract),
  createPipelineAdapter(() => Promise.resolve({ createRuntime })));

export const decodeInput = inputs.decode;
export const compileDataWorld = contract.compile;
export const compareDataRuns = runs.compare;

export function createDataSimulation(options) {
  const instance = runs.create(options);
  return Object.freeze({ run: instance.run, cancel: instance.cancel, close: instance.dispose });
}
